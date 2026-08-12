import { neon } from "@neondatabase/serverless"
import { randomUUID } from "crypto"
import { addMonths, billingMonthForPurchase, toBillingMonth } from "@/lib/cards"

const sql = neon(process.env.DATABASE_URL!)

export type ItemKind = "fijo" | "variable" | "suscripcion" | "financiero"

export interface ExpenseItem {
  id: number
  household_id: number
  card_id: number
  billing_month: string
  description: string
  amount: number
  merchant?: string | null
  kind: ItemKind
  purchase_date?: string | null
  purchase_group_id?: string | null
  installment_current?: number | null
  installment_total?: number | null
  external_ref: string
  source: "manual" | "api"
  tag?: string | null
  added_by?: string | null
  created_at: string
  updated_at: string
}

export interface ItemInput {
  description: string
  /** Monto de UNA cuota, salvo que amount_is_total sea true. */
  amount: number
  kind?: ItemKind
  merchant?: string | null
  purchase_date?: string | null
  /** Cantidad de cuotas. 1 o vacío = un pago. */
  installment_total?: number | null
  /** Si es true, `amount` es el total de la compra y se divide entre las cuotas. */
  amount_is_total?: boolean
  tag?: string | null
  external_ref?: string | null
  /** Mes de resumen explícito. Si falta, se calcula desde purchase_date + cierre. */
  billing_month?: string | null
}

/** Items de un resumen concreto, buscados por (card_id, billing_month). */
export async function getItemsForStatement(householdId: number, cardId: number, billingMonth: string): Promise<ExpenseItem[]> {
  const rows = await sql`
    SELECT id, household_id, card_id, TO_CHAR(billing_month, 'YYYY-MM-DD') AS billing_month,
      description, amount, merchant, kind, TO_CHAR(purchase_date, 'YYYY-MM-DD') AS purchase_date,
      purchase_group_id, installment_current, installment_total, external_ref, source, tag,
      added_by, created_at, updated_at
    FROM expense_items
    WHERE household_id = ${householdId} AND card_id = ${cardId} AND billing_month = ${billingMonth}
    ORDER BY amount DESC, id ASC
  `
  return rows as unknown as ExpenseItem[]
}

/**
 * Crea un item. Si tiene más de una cuota, genera las N cuotas en meses de
 * resumen consecutivos, unidas por purchase_group_id. Devuelve todas.
 */
export async function createItem(
  householdId: number,
  cardId: number,
  addedBy: string,
  input: ItemInput,
  closingDay?: number | null,
): Promise<ExpenseItem[]> {
  const total = Math.max(1, Math.min(input.installment_total || 1, 60))

  // Mes de resumen de la primera cuota
  const firstMonth = input.billing_month
    ? toBillingMonth(input.billing_month)
    : input.purchase_date
      ? billingMonthForPurchase(input.purchase_date, closingDay)
      : toBillingMonth(new Date().toISOString().slice(0, 10))

  // El monto guardado es SIEMPRE el de una cuota.
  const perInstallment = input.amount_is_total ? round2(input.amount / total) : round2(input.amount)
  const groupId = total > 1 ? randomUUID() : null

  const created: ExpenseItem[] = []
  for (let n = 1; n <= total; n++) {
    // Redondeo: la última cuota absorbe la diferencia de centavos.
    const amount =
      input.amount_is_total && n === total
        ? round2(input.amount - perInstallment * (total - 1))
        : perInstallment

    // external_ref determinístico: si el agente después importa el resumen y
    // trae esta misma cuota, cae en la misma fila en vez de duplicar.
    const ref = groupId ? `grp:${groupId}:${n}` : input.external_ref || `man:${randomUUID()}`

    const [row] = await sql`
      INSERT INTO expense_items (
        household_id, card_id, billing_month, description, amount, merchant, kind,
        purchase_date, purchase_group_id, installment_current, installment_total,
        external_ref, source, tag, added_by
      ) VALUES (
        ${householdId}, ${cardId}, ${addMonths(firstMonth, n - 1)}, ${input.description}, ${amount},
        ${input.merchant || null}, ${input.kind || "variable"}, ${input.purchase_date || null},
        ${groupId}, ${groupId ? n : null}, ${total > 1 ? total : null},
        ${ref}, 'manual', ${input.tag || null}, ${addedBy}
      )
      ON CONFLICT (card_id, billing_month, external_ref) DO UPDATE SET
        description = EXCLUDED.description, amount = EXCLUDED.amount, kind = EXCLUDED.kind,
        merchant = EXCLUDED.merchant, tag = EXCLUDED.tag, updated_at = NOW()
      RETURNING id, household_id, card_id, TO_CHAR(billing_month, 'YYYY-MM-DD') AS billing_month,
        description, amount, merchant, kind, TO_CHAR(purchase_date, 'YYYY-MM-DD') AS purchase_date,
        purchase_group_id, installment_current, installment_total, external_ref, source, tag,
        added_by, created_at, updated_at
    `
    created.push(row as unknown as ExpenseItem)
  }
  return created
}

export async function updateItem(
  id: number,
  householdId: number,
  patch: Partial<Pick<ItemInput, "description" | "amount" | "kind" | "merchant" | "tag">>,
): Promise<ExpenseItem | null> {
  const [row] = await sql`
    UPDATE expense_items SET
      description = COALESCE(${patch.description ?? null}, description),
      amount = COALESCE(${patch.amount ?? null}, amount),
      kind = COALESCE(${patch.kind ?? null}, kind),
      merchant = COALESCE(${patch.merchant ?? null}, merchant),
      tag = COALESCE(${patch.tag ?? null}, tag),
      updated_at = NOW()
    WHERE id = ${id} AND household_id = ${householdId}
    RETURNING id, household_id, card_id, TO_CHAR(billing_month, 'YYYY-MM-DD') AS billing_month,
      description, amount, merchant, kind, TO_CHAR(purchase_date, 'YYYY-MM-DD') AS purchase_date,
      purchase_group_id, installment_current, installment_total, external_ref, source, tag,
      added_by, created_at, updated_at
  `
  return (row as unknown as ExpenseItem) ?? null
}

/**
 * Borra un item. Con `allFuture` borra también las cuotas siguientes del mismo
 * grupo (útil cuando devolvés una compra en cuotas).
 */
export async function deleteItem(id: number, householdId: number, allFuture = false): Promise<number> {
  if (!allFuture) {
    const rows = await sql`DELETE FROM expense_items WHERE id = ${id} AND household_id = ${householdId} RETURNING id`
    return rows.length
  }
  const rows = await sql`
    DELETE FROM expense_items
    WHERE household_id = ${householdId}
    AND purchase_group_id = (SELECT purchase_group_id FROM expense_items WHERE id = ${id} AND household_id = ${householdId})
    AND purchase_group_id IS NOT NULL
    AND billing_month >= (SELECT billing_month FROM expense_items WHERE id = ${id})
    RETURNING id
  `
  return rows.length
}

/**
 * Upsert masivo de un resumen importado (agente / API).
 * Idempotente por (card_id, billing_month, external_ref): reprocesar el mismo
 * resumen actualiza las filas en vez de duplicarlas.
 */
export async function upsertStatementItems(
  householdId: number,
  cardId: number,
  billingMonth: string,
  addedBy: string,
  lines: Array<ItemInput & { installment_current?: number | null }>,
): Promise<{ upserted: number }> {
  const month = toBillingMonth(billingMonth)
  let upserted = 0

  for (const [lineIdx, line] of lines.entries()) {
    const current = line.installment_current ?? null
    const total = line.installment_total ?? null
    const isInstallment = !!(current && total && total > 1)

    // Una compra en cuotas se proyecta hacia adelante: el resumen de agosto
    // trae "cuota 1/3", y nosotros dejamos también la 2 y la 3 en los meses que
    // vienen, para que "comprometido a futuro" no espere al resumen siguiente.
    const lastToWrite = isInstallment ? total! : current || 1
    const from = isInstallment ? current! : 1

    for (let n = from; n <= lastToWrite; n++) {
      // La clave de una cuota NO incluye el monto: los intereses hacen que la
      // cuota 2 llegue con centavos distintos, y si el monto entrara en la
      // clave, el resumen de septiembre insertaría una fila nueva al lado de la
      // que proyectamos ahora. Con esta clave, coincide y actualiza.
      const ref = isInstallment
        ? `cuota:${slug(line.description)}:${n}/${total}`
        : line.external_ref ||
          `auto:${lineIdx}:${slug(line.description)}:${line.purchase_date ?? "nd"}:${round2(line.amount)}`

      await sql`
        INSERT INTO expense_items (
          household_id, card_id, billing_month, description, amount, merchant, kind,
          purchase_date, installment_current, installment_total, external_ref, source, tag, added_by
        ) VALUES (
          ${householdId}, ${cardId}, ${addMonths(month, n - from)}, ${line.description}, ${round2(line.amount)},
          ${line.merchant || null}, ${line.kind || "variable"}, ${line.purchase_date || null},
          ${isInstallment ? n : null}, ${total},
          ${ref}, 'api', ${line.tag || null}, ${addedBy}
        )
        ON CONFLICT (card_id, billing_month, external_ref) DO UPDATE SET
          description = EXCLUDED.description, amount = EXCLUDED.amount, merchant = EXCLUDED.merchant,
          kind = EXCLUDED.kind, purchase_date = EXCLUDED.purchase_date,
          installment_current = EXCLUDED.installment_current,
          installment_total = EXCLUDED.installment_total, tag = EXCLUDED.tag, updated_at = NOW()
      `
      upserted++
    }
  }
  return { upserted }
}

/**
 * Desglose por tipo de un resumen. `unclassified` = total del resumen menos la
 * suma de items: el número que hace que la cuenta cierre aunque falten items.
 */
export async function getStatementBreakdown(householdId: number, cardId: number, billingMonth: string, statementTotal: number) {
  const rows = await sql`
    SELECT kind, SUM(amount)::float8 AS total, COUNT(*)::int AS count
    FROM expense_items
    WHERE household_id = ${householdId} AND card_id = ${cardId} AND billing_month = ${billingMonth}
    GROUP BY kind
  `
  const byKind: Record<ItemKind, number> = { fijo: 0, variable: 0, suscripcion: 0, financiero: 0 }
  let itemsTotal = 0
  let count = 0
  for (const r of rows as any[]) {
    byKind[r.kind as ItemKind] = r.total
    itemsTotal += r.total
    count += r.count
  }
  const itemsRounded = round2(itemsTotal)
  const diff = round2(statementTotal - itemsRounded)
  // Centavos flotantes o redondeo de cuotas pueden dejar ±$1 sin significado real.
  const unclassified = Math.abs(diff) < 1 ? 0 : diff

  return {
    byKind,
    itemsTotal: itemsRounded,
    itemCount: count,
    unclassified,
  }
}

/**
 * Cuotas ya comprometidas hacia adelante, por mes y tarjeta.
 * Solo mira meses futuros: lo que vas a tener que pagar sí o sí.
 */
export async function getFutureCommitments(householdId: number, months = 12) {
  const from = toBillingMonth(new Date().toISOString().slice(0, 10))
  const to = addMonths(from, months)
  const rows = await sql`
    SELECT TO_CHAR(i.billing_month, 'YYYY-MM-DD') AS billing_month,
           i.card_id, c.name AS card_name,
           SUM(i.amount)::float8 AS total, COUNT(*)::int AS count
    FROM expense_items i
    JOIN cards c ON c.id = i.card_id
    WHERE i.household_id = ${householdId}
    AND i.billing_month > ${from}
    AND i.billing_month <= ${to}
    AND i.installment_total > 1
    GROUP BY i.billing_month, i.card_id, c.name
    ORDER BY i.billing_month ASC, total DESC
  `
  return rows as unknown as Array<{
    billing_month: string
    card_id: number
    card_name: string
    total: number
    count: number
  }>
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function slug(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, "-").slice(0, 40)
}
