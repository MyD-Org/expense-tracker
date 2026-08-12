import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export interface Expense {
  id: number
  household_id: number
  added_by: string
  added_by_name?: string
  description: string
  amount: number
  category: "fijo" | "variable" | "tarjeta"
  status: "pagado" | "pendiente"
  due_date: string
  notes?: string
  payment_code?: string
  receipt_data?: string
  receipt_name?: string
  has_receipt?: boolean
  invoice_data?: string
  invoice_name?: string
  has_invoice?: boolean
  /** Solo para category='tarjeta': tarjeta y mes de resumen. */
  card_id?: number | null
  billing_month?: string | null
  /** Cuánto se pagó del total. saldo = amount - paid_amount. */
  paid_amount: number
  minimum_due?: number | null
  /** Solo en los listados: cuántos items tiene el resumen y cuánto suman. */
  item_count?: number
  items_total?: number
  created_at: string
  updated_at: string
}

export interface ExpenseInput {
  description: string
  amount: number
  category: "fijo" | "variable" | "tarjeta"
  status: "pagado" | "pendiente"
  due_date: string
  notes?: string
  propagation_months?: number | "indefinido"
  card_id?: number | null
  billing_month?: string | null
  minimum_due?: number | null
  payment_code?: string
  receipt_data?: string | null
  receipt_name?: string | null
  invoice_data?: string | null
  invoice_name?: string | null
}

export async function getExpenses(householdId: number, year?: string, month?: string): Promise<Expense[]> {
  let rows: Record<string, any>[]
  if (year && month && month !== "all") {
    rows = await sql`
      SELECT e.id, e.household_id, e.added_by, e.description, e.amount, e.category, e.status, TO_CHAR(e.due_date, 'YYYY-MM-DD') AS due_date, e.notes, e.payment_code, e.receipt_name, (e.receipt_data IS NOT NULL) AS has_receipt, e.invoice_name, (e.invoice_data IS NOT NULL) AS has_invoice, e.card_id, TO_CHAR(e.billing_month, 'YYYY-MM-DD') AS billing_month, e.paid_amount, e.minimum_due,
      (SELECT COUNT(*)::int FROM expense_items i WHERE i.card_id = e.card_id AND i.billing_month = e.billing_month) AS item_count,
      (SELECT COALESCE(SUM(i.amount), 0)::float8 FROM expense_items i WHERE i.card_id = e.card_id AND i.billing_month = e.billing_month) AS items_total,
      e.created_at, e.updated_at, u.name as added_by_name
      FROM expenses e
      LEFT JOIN app_users u ON u.id = e.added_by
      WHERE e.household_id = ${householdId}
      AND EXTRACT(YEAR FROM e.due_date) = ${parseInt(year)}
      AND EXTRACT(MONTH FROM e.due_date) = ${parseInt(month)}
      ORDER BY e.due_date ASC, e.created_at DESC
    `
  } else if (year) {
    rows = await sql`
      SELECT e.id, e.household_id, e.added_by, e.description, e.amount, e.category, e.status, TO_CHAR(e.due_date, 'YYYY-MM-DD') AS due_date, e.notes, e.payment_code, e.receipt_name, (e.receipt_data IS NOT NULL) AS has_receipt, e.invoice_name, (e.invoice_data IS NOT NULL) AS has_invoice, e.card_id, TO_CHAR(e.billing_month, 'YYYY-MM-DD') AS billing_month, e.paid_amount, e.minimum_due,
      (SELECT COUNT(*)::int FROM expense_items i WHERE i.card_id = e.card_id AND i.billing_month = e.billing_month) AS item_count,
      (SELECT COALESCE(SUM(i.amount), 0)::float8 FROM expense_items i WHERE i.card_id = e.card_id AND i.billing_month = e.billing_month) AS items_total,
      e.created_at, e.updated_at, u.name as added_by_name
      FROM expenses e
      LEFT JOIN app_users u ON u.id = e.added_by
      WHERE e.household_id = ${householdId}
      AND EXTRACT(YEAR FROM e.due_date) = ${parseInt(year)}
      ORDER BY e.due_date ASC, e.created_at DESC
    `
  } else {
    rows = await sql`
      SELECT e.id, e.household_id, e.added_by, e.description, e.amount, e.category, e.status, TO_CHAR(e.due_date, 'YYYY-MM-DD') AS due_date, e.notes, e.payment_code, e.receipt_name, (e.receipt_data IS NOT NULL) AS has_receipt, e.invoice_name, (e.invoice_data IS NOT NULL) AS has_invoice, e.card_id, TO_CHAR(e.billing_month, 'YYYY-MM-DD') AS billing_month, e.paid_amount, e.minimum_due,
      (SELECT COUNT(*)::int FROM expense_items i WHERE i.card_id = e.card_id AND i.billing_month = e.billing_month) AS item_count,
      (SELECT COALESCE(SUM(i.amount), 0)::float8 FROM expense_items i WHERE i.card_id = e.card_id AND i.billing_month = e.billing_month) AS items_total,
      e.created_at, e.updated_at, u.name as added_by_name
      FROM expenses e
      LEFT JOIN app_users u ON u.id = e.added_by
      WHERE e.household_id = ${householdId}
      ORDER BY e.due_date ASC, e.created_at DESC
    `
  }
  return rows as unknown as Expense[]
}

export async function createExpense(householdId: number, addedBy: string, expense: ExpenseInput): Promise<Expense> {
  const [newExpense] = await sql`
    INSERT INTO expenses (household_id, added_by, description, amount, category, status, due_date, notes, payment_code, receipt_data, receipt_name, invoice_data, invoice_name, card_id, billing_month, minimum_due, paid_amount)
    VALUES (${householdId}, ${addedBy}, ${expense.description}, ${expense.amount}, ${expense.category}, ${expense.status}, ${expense.due_date}, ${expense.notes || null}, ${expense.payment_code || null}, ${expense.receipt_data || null}, ${expense.receipt_name || null}, ${expense.invoice_data || null}, ${expense.invoice_name || null}, ${expense.card_id ?? null}, ${expense.billing_month ?? null}, ${expense.minimum_due ?? null}, ${expense.status === "pagado" ? expense.amount : 0})
    RETURNING id, household_id, added_by, description, amount, category, status, TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date, notes, payment_code, receipt_name, (receipt_data IS NOT NULL) AS has_receipt, invoice_name, (invoice_data IS NOT NULL) AS has_invoice, card_id, TO_CHAR(billing_month, 'YYYY-MM-DD') AS billing_month, paid_amount, minimum_due, created_at, updated_at
  `

  if (expense.category === "fijo" && expense.propagation_months) {
    const baseDate = new Date(expense.due_date + "T00:00:00")

    let monthsToCreate = 0
    if (expense.propagation_months === "indefinido") {
      monthsToCreate = 12
    } else {
      monthsToCreate = Math.max(0, Math.min(expense.propagation_months, 60))
    }

    for (let i = 1; i <= monthsToCreate; i++) {
      const nextMonth = new Date(baseDate)
      nextMonth.setMonth(baseDate.getMonth() + i)

      const year = nextMonth.getFullYear()
      const month = String(nextMonth.getMonth() + 1).padStart(2, "0")
      const day = String(nextMonth.getDate()).padStart(2, "0")
      const nextMonthDate = `${year}-${month}-${day}`

      await sql`
        INSERT INTO expenses (household_id, added_by, description, amount, category, status, due_date, notes, payment_code)
        VALUES (${householdId}, ${addedBy}, ${expense.description}, ${expense.amount}, ${expense.category}, 'pendiente', ${nextMonthDate}, ${expense.notes || null}, ${expense.payment_code || null})
      `
    }
  }

  return newExpense as Expense
}

// Busca un gasto equivalente ya cargado (mismo servicio + monto + vencimiento)
// para que el ingreso automático por API sea idempotente y no duplique.
export async function findDuplicateExpense(
  householdId: number,
  description: string,
  amount: number,
  dueDate: string,
): Promise<Expense | null> {
  const rows = await sql`
    SELECT id, household_id, added_by, description, amount, category, status, TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date, notes, payment_code, created_at, updated_at
    FROM expenses
    WHERE household_id = ${householdId}
    AND lower(trim(description)) = lower(trim(${description}))
    AND amount = ${amount}
    AND due_date = ${dueDate}
    LIMIT 1
  `
  return (rows[0] as unknown as Expense) ?? null
}

export async function updateExpense(id: number, householdId: number, expense: Partial<ExpenseInput>): Promise<Expense> {
  const [updatedExpense] = await sql`
    UPDATE expenses
    SET
      description = COALESCE(${expense.description ?? null}, description),
      amount = COALESCE(${expense.amount ?? null}, amount),
      category = COALESCE(${expense.category ?? null}, category),
      status = COALESCE(${expense.status ?? null}, status),
      due_date = COALESCE(${expense.due_date ?? null}, due_date),
      notes = COALESCE(${expense.notes ?? null}, notes),
      payment_code = COALESCE(${expense.payment_code ?? null}, payment_code),
      receipt_data = COALESCE(${expense.receipt_data ?? null}, receipt_data),
      receipt_name = COALESCE(${expense.receipt_name ?? null}, receipt_name),
      invoice_data = COALESCE(${expense.invoice_data ?? null}, invoice_data),
      invoice_name = COALESCE(${expense.invoice_name ?? null}, invoice_name),
      card_id = COALESCE(${expense.card_id ?? null}, card_id),
      billing_month = COALESCE(${expense.billing_month ?? null}, billing_month),
      minimum_due = COALESCE(${expense.minimum_due ?? null}, minimum_due),
      -- El toggle pagado/pendiente tiene que mover el saldo con él, o un
      -- resumen "pagado" quedaría mostrando saldo pendiente.
      paid_amount = CASE
        WHEN ${expense.status ?? null} = 'pagado' THEN COALESCE(${expense.amount ?? null}, amount)
        WHEN ${expense.status ?? null} = 'pendiente' THEN 0
        ELSE paid_amount
      END,
      updated_at = NOW()
    WHERE id = ${id} AND household_id = ${householdId}
    RETURNING id, household_id, added_by, description, amount, category, status, TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date, notes, payment_code, receipt_name, (receipt_data IS NOT NULL) AS has_receipt, invoice_name, (invoice_data IS NOT NULL) AS has_invoice, card_id, TO_CHAR(billing_month, 'YYYY-MM-DD') AS billing_month, paid_amount, minimum_due, created_at, updated_at
  `
  return updatedExpense as Expense
}

/**
 * Registra un pago sobre un gasto (típicamente el resumen de una tarjeta).
 * `amount` es lo que pagás ahora; se acumula sobre lo ya pagado.
 * El estado es derivado: si el saldo llega a cero queda 'pagado', si no sigue
 * 'pendiente' (con paid_amount > 0 la UI lo muestra como "parcial").
 * Con `replace` en true el monto pisa lo acumulado en vez de sumarse — es lo
 * que usa el campo editable de "pagaste" para corregir un error de carga.
 */
export async function registerPayment(
  id: number,
  householdId: number,
  amount: number,
  replace = false,
): Promise<Expense | null> {
  // neon-http no permite anidar fragmentos sql`` dentro de otra query, así que
  // las dos variantes van escritas por separado.
  const rows = replace
    ? await sql`
        UPDATE expenses
        SET
          paid_amount = GREATEST(0, ${amount}),
          status = CASE WHEN GREATEST(0, ${amount}) >= amount THEN 'pagado' ELSE 'pendiente' END,
          updated_at = NOW()
        WHERE id = ${id} AND household_id = ${householdId}
        RETURNING id, household_id, added_by, description, amount, category, status, TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date, notes, payment_code, receipt_name, (receipt_data IS NOT NULL) AS has_receipt, invoice_name, (invoice_data IS NOT NULL) AS has_invoice, card_id, TO_CHAR(billing_month, 'YYYY-MM-DD') AS billing_month, paid_amount, minimum_due, created_at, updated_at
      `
    : await sql`
        UPDATE expenses
        SET
          paid_amount = GREATEST(0, paid_amount + ${amount}),
          status = CASE WHEN GREATEST(0, paid_amount + ${amount}) >= amount THEN 'pagado' ELSE 'pendiente' END,
          updated_at = NOW()
        WHERE id = ${id} AND household_id = ${householdId}
        RETURNING id, household_id, added_by, description, amount, category, status, TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date, notes, payment_code, receipt_name, (receipt_data IS NOT NULL) AS has_receipt, invoice_name, (invoice_data IS NOT NULL) AS has_invoice, card_id, TO_CHAR(billing_month, 'YYYY-MM-DD') AS billing_month, paid_amount, minimum_due, created_at, updated_at
      `
  const row = rows[0]
  return (row as unknown as Expense) ?? null
}

export async function getExpenseById(id: number, householdId: number): Promise<Expense | null> {
  const rows = await sql`
    SELECT e.id, e.household_id, e.added_by, e.description, e.amount, e.category, e.status, TO_CHAR(e.due_date, 'YYYY-MM-DD') AS due_date, e.notes, e.payment_code, e.receipt_name, (e.receipt_data IS NOT NULL) AS has_receipt, e.invoice_name, (e.invoice_data IS NOT NULL) AS has_invoice, e.card_id, TO_CHAR(e.billing_month, 'YYYY-MM-DD') AS billing_month, e.paid_amount, e.minimum_due,
    (SELECT COUNT(*)::int FROM expense_items i WHERE i.card_id = e.card_id AND i.billing_month = e.billing_month) AS item_count,
    (SELECT COALESCE(SUM(i.amount), 0)::float8 FROM expense_items i WHERE i.card_id = e.card_id AND i.billing_month = e.billing_month) AS items_total,
    e.created_at, e.updated_at, u.name as added_by_name
    FROM expenses e
    LEFT JOIN app_users u ON u.id = e.added_by
    WHERE e.id = ${id} AND e.household_id = ${householdId}
    LIMIT 1
  `
  return (rows[0] as unknown as Expense) ?? null
}

/**
 * Busca el resumen de una tarjeta para un mes, y lo crea si no existe.
 * Es el gasto único que se paga; los items cuelgan de (card_id, billing_month).
 */
export async function findOrCreateStatement(
  householdId: number,
  addedBy: string,
  card: { id: number; name: string; due_day?: number | null; closing_day?: number | null },
  billingMonth: string,
  total?: number,
): Promise<Expense> {
  const existing = await sql`
    SELECT id, household_id, added_by, description, amount, category, status, TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date, notes, payment_code, receipt_name, (receipt_data IS NOT NULL) AS has_receipt, invoice_name, (invoice_data IS NOT NULL) AS has_invoice, card_id, TO_CHAR(billing_month, 'YYYY-MM-DD') AS billing_month, paid_amount, minimum_due, created_at, updated_at
    FROM expenses
    WHERE household_id = ${householdId} AND card_id = ${card.id} AND billing_month = ${billingMonth}
    LIMIT 1
  `
  if (existing[0]) {
    // El total del resumen manda: si el banco lo informa, lo actualizamos.
    if (typeof total === "number" && total > 0) {
      const [updated] = await sql`
        UPDATE expenses SET amount = ${total}, updated_at = NOW()
        WHERE id = ${(existing[0] as any).id}
        RETURNING id, household_id, added_by, description, amount, category, status, TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date, notes, payment_code, receipt_name, (receipt_data IS NOT NULL) AS has_receipt, invoice_name, (invoice_data IS NOT NULL) AS has_invoice, card_id, TO_CHAR(billing_month, 'YYYY-MM-DD') AS billing_month, paid_amount, minimum_due, created_at, updated_at
      `
      return updated as unknown as Expense
    }
    return existing[0] as unknown as Expense
  }

  // Vencimiento: el primer día de pago POSTERIOR al cierre. Con cierre el 28 y
  // pago el 5, el resumen de agosto vence el 5 de septiembre — el vencimiento
  // cae en el mes siguiente cada vez que el día de pago es anterior al cierre.
  const [y, m] = billingMonth.split("-").map(Number)
  const dueDay = card.due_day || 10
  const rollsOver = card.closing_day != null && dueDay <= card.closing_day
  const dueY = rollsOver && m === 12 ? y + 1 : y
  const dueM = rollsOver ? (m === 12 ? 1 : m + 1) : m
  const lastDay = new Date(dueY, dueM, 0).getDate()
  const day = Math.min(dueDay, lastDay)
  const dueDate = `${dueY}-${String(dueM).padStart(2, "0")}-${String(day).padStart(2, "0")}`

  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" })

  return createExpense(householdId, addedBy, {
    description: `${card.name} — ${monthLabel}`,
    amount: total ?? 0,
    category: "tarjeta",
    status: "pendiente",
    due_date: dueDate,
    card_id: card.id,
    billing_month: billingMonth,
  })
}

// No se pueden borrar gastos pagados: primero hay que volverlos a pendiente.
// Devuelve false si no borró nada (no existe o está pagado).
export async function deleteExpense(id: number, householdId: number): Promise<boolean> {
  const rows = await sql`
    DELETE FROM expenses
    WHERE id = ${id} AND household_id = ${householdId}
    RETURNING id
  `
  return rows.length > 0
}

export async function getExpenseStats(householdId: number, year?: string, month?: string) {
  let stats: any[]

  if (year && month && month !== "all") {
    stats = await sql`
      SELECT
        COUNT(*) as total_expenses,
        SUM(CASE WHEN status = 'pagado' THEN amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN status = 'pendiente' THEN amount ELSE 0 END) as total_pending,
        SUM(CASE WHEN category = 'fijo' THEN amount ELSE 0 END) as total_fixed,
        SUM(CASE WHEN category = 'variable' THEN amount ELSE 0 END) as total_variable,
        SUM(CASE WHEN category = 'tarjeta' THEN amount ELSE 0 END) as total_cards,
        COUNT(CASE WHEN status = 'pendiente' AND due_date <= (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + INTERVAL '7 days' THEN 1 END) as upcoming_due
      FROM expenses
      WHERE household_id = ${householdId}
      AND EXTRACT(YEAR FROM due_date) = ${parseInt(year)}
      AND EXTRACT(MONTH FROM due_date) = ${parseInt(month)}
    `
  } else if (year) {
    stats = await sql`
      SELECT
        COUNT(*) as total_expenses,
        SUM(CASE WHEN status = 'pagado' THEN amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN status = 'pendiente' THEN amount ELSE 0 END) as total_pending,
        SUM(CASE WHEN category = 'fijo' THEN amount ELSE 0 END) as total_fixed,
        SUM(CASE WHEN category = 'variable' THEN amount ELSE 0 END) as total_variable,
        SUM(CASE WHEN category = 'tarjeta' THEN amount ELSE 0 END) as total_cards,
        COUNT(CASE WHEN status = 'pendiente' AND due_date <= (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + INTERVAL '7 days' THEN 1 END) as upcoming_due
      FROM expenses
      WHERE household_id = ${householdId}
      AND EXTRACT(YEAR FROM due_date) = ${parseInt(year)}
    `
  } else {
    stats = await sql`
      SELECT
        COUNT(*) as total_expenses,
        SUM(CASE WHEN status = 'pagado' THEN amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN status = 'pendiente' THEN amount ELSE 0 END) as total_pending,
        SUM(CASE WHEN category = 'fijo' THEN amount ELSE 0 END) as total_fixed,
        SUM(CASE WHEN category = 'variable' THEN amount ELSE 0 END) as total_variable,
        SUM(CASE WHEN category = 'tarjeta' THEN amount ELSE 0 END) as total_cards,
        COUNT(CASE WHEN status = 'pendiente' AND due_date <= (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + INTERVAL '7 days' THEN 1 END) as upcoming_due
      FROM expenses
      WHERE household_id = ${householdId}
    `
  }

  const stat = stats[0]
  return {
    totalExpenses: Number.parseInt(stat.total_expenses),
    totalPaid: Number.parseFloat(stat.total_paid || "0"),
    totalPending: Number.parseFloat(stat.total_pending || "0"),
    totalFixed: Number.parseFloat(stat.total_fixed || "0"),
    totalVariable: Number.parseFloat(stat.total_variable || "0"),
    totalCards: Number.parseFloat(stat.total_cards || "0"),
    upcomingDue: Number.parseInt(stat.upcoming_due),
  }
}

export async function getExpiringToday(householdId: number): Promise<Expense[]> {
  const rows = await sql`
    SELECT e.id, e.household_id, e.added_by, e.description, e.amount, e.category, e.status, TO_CHAR(e.due_date, 'YYYY-MM-DD') AS due_date, e.notes, e.payment_code, e.receipt_name, (e.receipt_data IS NOT NULL) AS has_receipt, e.invoice_name, (e.invoice_data IS NOT NULL) AS has_invoice, e.card_id, TO_CHAR(e.billing_month, 'YYYY-MM-DD') AS billing_month, e.paid_amount, e.minimum_due,
      (SELECT COUNT(*)::int FROM expense_items i WHERE i.card_id = e.card_id AND i.billing_month = e.billing_month) AS item_count,
      (SELECT COALESCE(SUM(i.amount), 0)::float8 FROM expense_items i WHERE i.card_id = e.card_id AND i.billing_month = e.billing_month) AS items_total,
      e.created_at, e.updated_at, u.name as added_by_name
    FROM expenses e
    LEFT JOIN app_users u ON u.id = e.added_by
    WHERE e.household_id = ${householdId}
    AND e.status = 'pendiente'
    AND e.due_date = (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
    ORDER BY e.amount DESC
  `
  return rows as unknown as Expense[]
}

export async function getExpiringTomorrow(householdId: number): Promise<Expense[]> {
  const rows = await sql`
    SELECT e.id, e.household_id, e.added_by, e.description, e.amount, e.category, e.status, TO_CHAR(e.due_date, 'YYYY-MM-DD') AS due_date, e.notes, e.payment_code, e.receipt_name, (e.receipt_data IS NOT NULL) AS has_receipt, e.invoice_name, (e.invoice_data IS NOT NULL) AS has_invoice, e.card_id, TO_CHAR(e.billing_month, 'YYYY-MM-DD') AS billing_month, e.paid_amount, e.minimum_due,
      (SELECT COUNT(*)::int FROM expense_items i WHERE i.card_id = e.card_id AND i.billing_month = e.billing_month) AS item_count,
      (SELECT COALESCE(SUM(i.amount), 0)::float8 FROM expense_items i WHERE i.card_id = e.card_id AND i.billing_month = e.billing_month) AS items_total,
      e.created_at, e.updated_at, u.name as added_by_name
    FROM expenses e
    LEFT JOIN app_users u ON u.id = e.added_by
    WHERE e.household_id = ${householdId}
    AND e.status = 'pendiente'
    AND e.due_date = (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + INTERVAL '1 day'
    ORDER BY e.amount DESC
  `
  return rows as unknown as Expense[]
}
