import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getExpenseById } from "@/lib/database"
import { parseStatementFromText } from "@/lib/parse-statement-document"
import { initializeDatabase } from "@/lib/init-database"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!session.user.householdId) return NextResponse.json({ error: "Sin hogar configurado" }, { status: 403 })

  try {
    await initializeDatabase()
    const expense = await getExpenseById(Number.parseInt(params.id), session.user.householdId)
    if (!expense) return NextResponse.json({ error: "El gasto no existe" }, { status: 404 })
    if (!expense.card_id || !expense.billing_month) {
      return NextResponse.json({ error: "Este gasto no es un resumen de tarjeta." }, { status: 400 })
    }

    const body = await request.json()
    const text = typeof body?.text === "string" ? body.text.trim() : ""
    if (text.length < 40) {
      return NextResponse.json({ error: "Texto insuficiente para leer consumos" }, { status: 400 })
    }

    const result = parseStatementFromText(text)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error parsing statement text:", error)
    return NextResponse.json({ error: error?.message || "No se pudo leer el resumen" }, { status: 400 })
  }
}
