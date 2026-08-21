import { type NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { neon } from "@neondatabase/serverless"
import { timingSafeEqual } from "node:crypto"
import { initializeDatabase } from "@/lib/init-database"

const sql = neon(process.env.DATABASE_URL!)

// Autenticación para el agente de ingreso automático (Cowork/cron).
// Si el request trae "Authorization: Bearer <EXPENSE_INGEST_TOKEN>" válido,
// devuelve el hogar/usuario configurados en variables de entorno.
// Devuelve null si no está configurado o el token no coincide.
export function verifyIngestToken(request: Request): { householdId: number; userId: string } | null {
  const configured = process.env.EXPENSE_INGEST_TOKEN
  const householdId = process.env.INGEST_HOUSEHOLD_ID
  const userId = process.env.INGEST_USER_ID
  if (!configured || !householdId || !userId) return null

  const match = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const provided = match[1].trim()

  const a = Buffer.from(provided)
  const b = Buffer.from(configured)
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null

  const parsedHousehold = parseInt(householdId, 10)
  if (Number.isNaN(parsedHousehold)) return null
  return { householdId: parsedHousehold, userId }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider !== "google") return false

      const email = user.email?.toLowerCase()

      // Lista blanca: solo los emails autorizados pueden entrar.
      // Se configura con ALLOWED_EMAILS (separados por coma). Si está vacío, no se restringe.
      const allowed = (process.env.ALLOWED_EMAILS || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
      if (allowed.length > 0) {
        if (!email || !allowed.includes(email)) {
          // El detalle importa para diagnosticar: sin él no se distingue
          // "falta el email en la lista" de "la variable no llegó al deploy".
          console.warn(
            `[auth] Login bloqueado: ${user.email} no figura entre los ${allowed.length} emails de ALLOWED_EMAILS`,
          )
          return "/login?error=EmailNoAutorizado"
        }
      } else {
        console.warn("[auth] ALLOWED_EMAILS vacío o ausente: no se está restringiendo el acceso")
      }

      try {
        await initializeDatabase()

        // app_users.email es UNIQUE, pero el upsert de abajo sólo resuelve el
        // conflicto por id. Si el email ya está guardado con OTRO id (cuenta
        // vieja, alta manual, o un id de Google distinto al de la fila), el
        // INSERT viola la restricción de email y el catch de abajo tumbaba el
        // login con el mismo cartel que un email no autorizado. Lo separamos.
        const [clash] = await sql`
          SELECT id FROM app_users WHERE lower(email) = ${email} AND id <> ${user.id}
        `
        if (clash) {
          console.error(
            `[auth] ${user.email} ya existe en app_users con id ${clash.id}, pero Google manda ${user.id}. ` +
              "Hay que unificar esa fila a mano antes de que pueda entrar.",
          )
          return "/login?error=CuentaDuplicada"
        }

        await sql`
          INSERT INTO app_users (id, email, name, image)
          VALUES (${user.id}, ${user.email}, ${user.name}, ${user.image})
          ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            image = EXCLUDED.image
        `
        return true
      } catch (e) {
        console.error("[auth] Error de base de datos al iniciar sesión:", e)
        return "/login?error=ErrorServidor"
      }
    },
    async jwt({ token }) {
      if (!token.sub) return token
      try {
        const [member] = await sql`
          SELECT hm.household_id, h.name as household_name
          FROM household_members hm
          JOIN households h ON h.id = hm.household_id
          WHERE hm.user_id = ${token.sub}
          LIMIT 1
        `
        token.householdId = member?.household_id ?? null
        token.householdName = member?.household_name ?? null
      } catch {
        token.householdId = null
        token.householdName = null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!
        session.user.householdId = token.householdId ?? null
        session.user.householdName = token.householdName ?? null
      }
      return session
    },
  },
}
