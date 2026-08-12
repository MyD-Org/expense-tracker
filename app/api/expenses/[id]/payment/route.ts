import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { registerPayment } from "@/lib/database"
import { initializeDatabase } from "@/lib/init-database"

/**
 * Registra un pago sobre un gasto. Body: { amount: number, replace?: boolean }
 * `replace` pisa lo acumulado en vez de sumarse (para corregir una carga).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!session.user.householdId) return NextResponse.json({ error: "Sin hogar configurado" }, { status: 403 })

  try {
    await initializeDatabase()
    const { amount, replace } = await request.json()
    if (typeof amount !== "number" || Number.isNaN(amount)) {
      return NextResponse.json({ error: "amount tiene que ser un número" }, { status: 400 })
    }
    const expense = await registerPayment(Number.parseInt(params.id), session.user.householdId, amount, !!replace)
    if (!expense) return NextResponse.json({ error: "El gasto no existe" }, { status: 404 })
    return NextResponse.json(expense)
  } catch (error) {
    console.error("Error registering payment:", error)
    return NextResponse.json({ error: "Failed to register payment" }, { status: 500 })
  }
}
