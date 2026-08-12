import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions, verifyIngestToken } from "@/lib/auth"
import { findOrCreateCardByName, getCards, toBillingMonth } from "@/lib/cards"
import { getStatementBreakdown, upsertStatementItems } from "@/lib/expense-items"
import { findOrCreateStatement, updateExpense } from "@/lib/database"
import { initializeDatabase } from "@/lib/init-database"

/**
 * Ingreso de un resumen de tarjeta completo, pensado para el agente que lee
 * los resúmenes del banco. Autenticado con el mismo token que POST /api/expenses.
 *
 * Body:
 * {
 *   "card": "Visa Galicia",            // nombre; se crea si no existe
 *   "billing_month": "2026-08",        // mes del resumen
 *   "total": 482350.55,                // total a pagar (manda sobre los items)
 *   "minimum_due": 96470.11,           // opcional
 *   "due_date": "2026-09-10",          // opcional; si falta usa el día de pago
 *   "items": [
 *     { "description": "Spotify", "amount": 3499, "kind": "suscripcion" },
 *     { "description": "Coto", "amount": 45200, "purchase_date": "2026-08-03" },
 *     { "description": "Notebook", "amount": 91000,
 *       "installment_current": 3, "installment_total": 12,
 *       "external_ref": "TXN-88213" }
 *   ]
 * }
 *
 * Es idempotente: reprocesar el mismo resumen actualiza las líneas existentes
 * en vez de duplicarlas.
 */
export async function POST(request: NextRequest) {
  const ingest = verifyIngestToken(request)
  let householdId: number
  let userId: string

  if (ingest) {
    householdId = ingest.householdId
    userId = ingest.userId
  } else {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    if (!session.user.householdId) return NextResponse.json({ error: "Sin hogar configurado" }, { status: 403 })
    householdId = session.user.householdId
    userId = session.user.id
  }

  try {
    await initializeDatabase()
    const body = await request.json()

    if (!body?.card || !body?.billing_month) {
      return NextResponse.json({ error: "Faltan campos requeridos: card, billing_month" }, { status: 400 })
    }

    const billingMonth = toBillingMonth(
      body.billing_month.length === 7 ? `${body.billing_month}-01` : body.billing_month,
    )

    // La tarjeta puede venir por id o por nombre.
    let card
    if (typeof body.card === "number") {
      card = (await getCards(householdId, true)).find((c) => c.id === body.card)
      if (!card) return NextResponse.json({ error: "La tarjeta no existe" }, { status: 404 })
    } else {
      card = await findOrCreateCardByName(householdId, String(body.card))
    }

    let statement = await findOrCreateStatement(
      householdId,
      userId,
      card,
      billingMonth,
      typeof body.total === "number" ? body.total : undefined,
    )

    if (typeof body.minimum_due === "number" || body.due_date) {
      statement = await updateExpense(statement.id, householdId, {
        minimum_due: typeof body.minimum_due === "number" ? body.minimum_due : undefined,
        due_date: body.due_date || undefined,
      })
    }

    const lines = Array.isArray(body.items) ? body.items : []
    const invalid = lines.find((l: any) => !l?.description || typeof l.amount !== "number")
    if (invalid) {
      return NextResponse.json({ error: "Cada item necesita description y amount numérico" }, { status: 400 })
    }

    const { upserted } = await upsertStatementItems(householdId, card.id, billingMonth, userId, lines)
    const breakdown = await getStatementBreakdown(householdId, card.id, billingMonth, Number(statement.amount) || 0)

    return NextResponse.json({ statement, card, upserted, breakdown }, { status: 200 })
  } catch (error: any) {
    console.error("Error ingesting statement:", error)
    return NextResponse.json({ error: "Failed to ingest statement", details: error.message }, { status: 500 })
  }
}
