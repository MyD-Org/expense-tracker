import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getExpenseById } from "@/lib/database"
import { getStatementBreakdown, upsertStatementItems, type ItemKind } from "@/lib/expense-items"
import { initializeDatabase } from "@/lib/init-database"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!session.user.householdId) return NextResponse.json({ error: "Sin hogar configurado" }, { status: 403 })

  try {
    await initializeDatabase()
    const householdId = session.user.householdId
    const expense = await getExpenseById(Number.parseInt(params.id), householdId)
    if (!expense) return NextResponse.json({ error: "El gasto no existe" }, { status: 404 })
    if (!expense.card_id || !expense.billing_month) {
      return NextResponse.json({ error: "Este gasto no es un resumen de tarjeta." }, { status: 400 })
    }

    const body = await request.json()
    const raw = Array.isArray(body?.items) ? body.items : []
    if (!raw.length) {
      return NextResponse.json({ error: "No hay items para importar" }, { status: 400 })
    }

    const lines = raw
      .filter((l: any) => l?.description?.trim() && typeof l.amount === "number" && l.amount > 0)
      .map((l: any) => ({
        description: String(l.description).trim(),
        amount: Number(l.amount),
        kind: (["fijo", "variable", "suscripcion", "financiero"] as ItemKind[]).includes(l.kind)
          ? l.kind
          : ("variable" as ItemKind),
        merchant: l.merchant || null,
        purchase_date: l.purchase_date || null,
        installment_current: l.installment_current ?? null,
        installment_total: l.installment_total ?? null,
        tag: l.tag || null,
      }))

    const { upserted } = await upsertStatementItems(
      householdId,
      expense.card_id,
      expense.billing_month,
      session.user.id,
      lines,
    )

    const breakdown = await getStatementBreakdown(
      householdId,
      expense.card_id,
      expense.billing_month,
      Number(expense.amount) || 0,
    )

    return NextResponse.json({ upserted, breakdown })
  } catch (error: any) {
    console.error("Error importing items:", error)
    return NextResponse.json({ error: "Failed to import items", details: error.message }, { status: 500 })
  }
}
