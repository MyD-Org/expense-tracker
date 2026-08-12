import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getExpenseById } from "@/lib/database"
import { getCards } from "@/lib/cards"
import { createItem, getItemsForStatement, getStatementBreakdown } from "@/lib/expense-items"
import { initializeDatabase } from "@/lib/init-database"

// Un resumen sin tarjeta o sin mes asignado no puede tener desglose todavía.
async function loadStatement(id: number, householdId: number) {
  const expense = await getExpenseById(id, householdId)
  if (!expense) return { error: "El gasto no existe", status: 404 as const }
  if (!expense.card_id || !expense.billing_month) {
    return { error: "Este gasto no es un resumen de tarjeta. Asignale una tarjeta y un mes de resumen.", status: 400 as const }
  }
  return { expense, cardId: expense.card_id, billingMonth: expense.billing_month }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!session.user.householdId) return NextResponse.json({ error: "Sin hogar configurado" }, { status: 403 })

  try {
    await initializeDatabase()
    const st = await loadStatement(Number.parseInt(params.id), session.user.householdId)
    if ("error" in st) return NextResponse.json({ error: st.error }, { status: st.status })

    const [items, breakdown] = await Promise.all([
      getItemsForStatement(session.user.householdId, st.cardId, st.billingMonth),
      getStatementBreakdown(session.user.householdId, st.cardId, st.billingMonth, Number(st.expense.amount) || 0),
    ])
    return NextResponse.json({ items, breakdown })
  } catch (error) {
    console.error("Error fetching items:", error)
    return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!session.user.householdId) return NextResponse.json({ error: "Sin hogar configurado" }, { status: 403 })

  try {
    await initializeDatabase()
    const householdId = session.user.householdId
    const st = await loadStatement(Number.parseInt(params.id), householdId)
    if ("error" in st) return NextResponse.json({ error: st.error }, { status: st.status })

    const body = await request.json()
    if (!body?.description?.trim() || typeof body.amount !== "number") {
      return NextResponse.json({ error: "Faltan description y amount" }, { status: 400 })
    }

    const cards = await getCards(householdId, true)
    const card = cards.find((c) => c.id === st.cardId)

    const items = await createItem(
      householdId,
      st.cardId,
      session.user.id,
      // La primera cuota cae en el resumen que estás viendo; las siguientes
      // se reparten en los meses posteriores.
      { ...body, billing_month: st.billingMonth },
      card?.closing_day,
    )
    return NextResponse.json({ items }, { status: 201 })
  } catch (error: any) {
    console.error("Error creating item:", error)
    return NextResponse.json({ error: "Failed to create item", details: error.message }, { status: 500 })
  }
}
