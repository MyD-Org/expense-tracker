import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export interface Card {
  id: number
  household_id: number
  name: string
  last4?: string | null
  closing_day?: number | null
  due_day?: number | null
  color?: string | null
  archived: boolean
  created_at: string
}

export interface CardInput {
  name: string
  last4?: string | null
  closing_day?: number | null
  due_day?: number | null
  color?: string | null
}

export async function getCards(householdId: number, includeArchived = false): Promise<Card[]> {
  const rows = includeArchived
    ? await sql`SELECT * FROM cards WHERE household_id = ${householdId} ORDER BY archived ASC, name ASC`
    : await sql`SELECT * FROM cards WHERE household_id = ${householdId} AND archived = FALSE ORDER BY name ASC`
  return rows as unknown as Card[]
}

export async function createCard(householdId: number, card: CardInput): Promise<Card> {
  const [row] = await sql`
    INSERT INTO cards (household_id, name, last4, closing_day, due_day, color)
    VALUES (${householdId}, ${card.name}, ${card.last4 || null}, ${card.closing_day ?? null}, ${card.due_day ?? null}, ${card.color || null})
    RETURNING *
  `
  return row as unknown as Card
}

export async function updateCard(id: number, householdId: number, card: Partial<CardInput> & { archived?: boolean }): Promise<Card | null> {
  const [row] = await sql`
    UPDATE cards SET
      name = COALESCE(${card.name ?? null}, name),
      last4 = COALESCE(${card.last4 ?? null}, last4),
      closing_day = COALESCE(${card.closing_day ?? null}, closing_day),
      due_day = COALESCE(${card.due_day ?? null}, due_day),
      color = COALESCE(${card.color ?? null}, color),
      archived = COALESCE(${card.archived ?? null}, archived)
    WHERE id = ${id} AND household_id = ${householdId}
    RETURNING *
  `
  return (row as unknown as Card) ?? null
}

// Busca una tarjeta por nombre (case-insensitive) y si no existe la crea.
// Lo usa el ingreso por API para no obligar al agente a conocer los ids.
export async function findOrCreateCardByName(householdId: number, name: string): Promise<Card> {
  const rows = await sql`
    SELECT * FROM cards
    WHERE household_id = ${householdId} AND lower(trim(name)) = lower(trim(${name}))
    LIMIT 1
  `
  if (rows[0]) return rows[0] as unknown as Card
  return createCard(householdId, { name: name.trim() })
}

// ── Ciclo de facturación ──

/** Normaliza cualquier fecha al primer día de su mes: "2026-08-20" → "2026-08-01" */
export function toBillingMonth(date: string): string {
  return `${date.slice(0, 7)}-01`
}

/**
 * Mes de resumen en el que cae una compra.
 * Es el primer cierre posterior a la compra: con cierre el 15, una compra del
 * 20 de agosto entra al resumen de septiembre. Sin día de cierre configurado,
 * la compra cae en el mes de su propia fecha.
 */
export function billingMonthForPurchase(purchaseDate: string, closingDay?: number | null): string {
  const base = toBillingMonth(purchaseDate)
  if (!closingDay) return base

  const day = Number(purchaseDate.slice(8, 10))
  if (day <= closingDay) return base

  const [y, m] = base.split("-").map(Number)
  const next = new Date(y, m, 1) // m es 1-based, así que esto ya es el mes siguiente
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`
}

/** Suma n meses a un billing_month ("2026-08-01" + 2 → "2026-10-01") */
export function addMonths(billingMonth: string, n: number): string {
  const [y, m] = billingMonth.split("-").map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}
