import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getFutureCommitments } from "@/lib/expense-items"
import { initializeDatabase } from "@/lib/init-database"

/** Cuotas ya comprometidas para los próximos meses, agrupadas por mes y tarjeta. */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!session.user.householdId) return NextResponse.json({ error: "Sin hogar configurado" }, { status: 403 })

  try {
    await initializeDatabase()
    const raw = Number.parseInt(new URL(request.url).searchParams.get("months") || "12")
    const months = Number.isNaN(raw) ? 12 : Math.min(36, Math.max(1, raw))
    const rows = await getFutureCommitments(session.user.householdId, months)
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching commitments:", error)
    return NextResponse.json({ error: "Failed to fetch commitments" }, { status: 500 })
  }
}
