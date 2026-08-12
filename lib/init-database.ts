import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

// Se ejecuta una sola vez por instancia del servidor: guardamos la promesa
// para no repetir todos los CREATE/ALTER en cada request.
let initPromise: Promise<void> | null = null

export function initializeDatabase(): Promise<void> {
  if (!initPromise) {
    initPromise = runInit().catch((e) => {
      // Si falla, permitir reintentar en el próximo request
      initPromise = null
      throw e
    })
  }
  return initPromise
}

async function runInit() {
  try {
    // app_users table
    await sql`
      CREATE TABLE IF NOT EXISTS app_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        image TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // households table
    await sql`
      CREATE TABLE IF NOT EXISTS households (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        invite_code TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // household_members table
    await sql`
      CREATE TABLE IF NOT EXISTS household_members (
        user_id TEXT REFERENCES app_users(id) ON DELETE CASCADE,
        household_id INTEGER REFERENCES households(id) ON DELETE CASCADE,
        role TEXT DEFAULT 'member',
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, household_id)
      )
    `

    // expenses table
    await sql`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        household_id INTEGER REFERENCES households(id) ON DELETE CASCADE,
        added_by TEXT,
        description TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('fijo', 'variable', 'tarjeta')),
        status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'pagado')),
        due_date DATE NOT NULL,
        notes TEXT,
        payment_code TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // Add columns to existing expenses table if they don't exist yet
    await sql`
      ALTER TABLE expenses
      ADD COLUMN IF NOT EXISTS household_id INTEGER REFERENCES households(id) ON DELETE CASCADE
    `.catch(() => {})

    await sql`
      ALTER TABLE expenses
      ADD COLUMN IF NOT EXISTS added_by TEXT
    `.catch(() => {})

    // La tabla vieja tenía user_id TEXT NOT NULL — ya no se usa.
    // Quitamos la restricción NOT NULL para que los nuevos inserts (sin user_id) funcionen.
    await sql`
      ALTER TABLE expenses
      ALTER COLUMN user_id DROP NOT NULL
    `.catch(() => {})

    // Comprobante de pago (imagen o PDF guardado como data URL en base64)
    await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_data TEXT`.catch(() => {})
    await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_name TEXT`.catch(() => {})

    // Factura (imagen o PDF guardado como data URL en base64)
    await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice_data TEXT`.catch(() => {})
    await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice_name TEXT`.catch(() => {})

    // ── Desglose de tarjetas ──
    // Un gasto category='tarjeta' es el RESUMEN del mes de una tarjeta: su
    // `amount` es el total a pagar (lo que dice el banco) y es el único que
    // se paga. Los expense_items son el desglose analítico que cuelga de él.

    // Pago parcial del resumen: saldo = amount - paid_amount.
    // `status` sigue siendo la columna de siempre (el cron y las stats la usan);
    // "parcial" es un estado visual = status 'pendiente' con paid_amount > 0.
    await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0`.catch(() => {})
    await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS minimum_due DECIMAL(10,2)`.catch(() => {})

    // Los gastos ya marcados como pagados antes de esta columna quedaron con
    // paid_amount = 0; los normalizamos una sola vez para que el saldo cierre.
    await sql`UPDATE expenses SET paid_amount = amount WHERE status = 'pagado' AND paid_amount = 0`.catch(() => {})

    await sql`
      CREATE TABLE IF NOT EXISTS cards (
        id SERIAL PRIMARY KEY,
        household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        last4 TEXT,
        closing_day INTEGER CHECK (closing_day BETWEEN 1 AND 31),
        due_day INTEGER CHECK (due_day BETWEEN 1 AND 31),
        color TEXT,
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL`.catch(() => {})
    // Mes de resumen del gasto tarjeta (primer día del mes). Junto con card_id
    // es la clave que lo une con sus items.
    await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS billing_month DATE`.catch(() => {})

    // El item se ancla a (card_id, billing_month), NO a un expense_id: las
    // cuotas futuras existen antes que el resumen del mes en que caen. Ese par
    // es la ÚNICA fuente de verdad del vínculo — no hay FK al resumen que
    // pueda quedar desincronizada.
    await sql`
      CREATE TABLE IF NOT EXISTS expense_items (
        id SERIAL PRIMARY KEY,
        household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        billing_month DATE NOT NULL,
        description TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        merchant TEXT,
        kind TEXT NOT NULL DEFAULT 'variable' CHECK (kind IN ('fijo', 'variable', 'suscripcion', 'financiero')),
        purchase_date DATE,
        purchase_group_id TEXT,
        installment_current INTEGER,
        installment_total INTEGER,
        external_ref TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'api')),
        tag TEXT,
        added_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // Idempotencia del ingreso por API: reprocesar el mismo resumen actualiza
    // en vez de duplicar. Para las cuotas autogeneradas el external_ref sale
    // determinístico de purchase_group_id + número de cuota.
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_items_dedupe
      ON expense_items(card_id, billing_month, external_ref)
    `.catch(() => {})

    // push_subscriptions: cada dispositivo/navegador guarda su suscripción
    // Web Push (VAPID) para recibir notificaciones aunque la app esté cerrada.
    await sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `

    // notification_log: historial de push enviados por usuario, con estado leído.
    // Se guarda una fila por usuario aunque el push haya ido a varios dispositivos.
    await sql`
      CREATE TABLE IF NOT EXISTS notification_log (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        read_at TIMESTAMPTZ
      )
    `

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_expenses_household_id ON expenses(household_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_expenses_due_date ON expenses(due_date)`
    await sql`CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)`
    await sql`CREATE INDEX IF NOT EXISTS idx_households_invite_code ON households(invite_code)`
    await sql`CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON push_subscriptions(user_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_notif_log_user_created ON notification_log(user_id, created_at DESC)`
    await sql`CREATE INDEX IF NOT EXISTS idx_cards_household ON cards(household_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_items_card_month ON expense_items(card_id, billing_month)`
    await sql`CREATE INDEX IF NOT EXISTS idx_expenses_card_month ON expenses(card_id, billing_month)`
    await sql`CREATE INDEX IF NOT EXISTS idx_items_group ON expense_items(purchase_group_id)`

  } catch (error) {
    console.error("[db] Error initializing database:", error)
    throw error
  }
}
