import type { Expense } from "@/lib/database"
import type { ExpenseItem } from "@/lib/expense-items"

// Filtros activos en la vista de Gastos al momento de exportar.
export interface ExportFilters {
  year: string
  month: string // "01".."12" | "all"
  category: string // "all" | "fijo" | "tarjeta" | "variable"
  status: string // "all" | "pagado" | "pendiente"
  search: string
}

const MONTH_NAMES: Record<string, string> = {
  "01": "Enero",
  "02": "Febrero",
  "03": "Marzo",
  "04": "Abril",
  "05": "Mayo",
  "06": "Junio",
  "07": "Julio",
  "08": "Agosto",
  "09": "Septiembre",
  "10": "Octubre",
  "11": "Noviembre",
  "12": "Diciembre",
}

const CATEGORY_LABELS: Record<string, string> = {
  all: "todas",
  fijo: "fijo",
  tarjeta: "tarjeta",
  variable: "variable",
}

// "YYYY-MM-DD" (o ISO con hora) parseado como fecha LOCAL, igual que en el
// resto de la app, para no correr el día por la conversión a UTC.
const parseLocalDate = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d)
}

const toLocalISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

const round2 = (n: number) => Math.round(n * 100) / 100

export function describePeriod(filters: ExportFilters): string {
  return filters.month === "all"
    ? `Todo el año ${filters.year}`
    : `${MONTH_NAMES[filters.month] ?? filters.month} ${filters.year}`
}

/**
 * Arma el objeto que se exporta como JSON. Además de la lista de gastos incluye
 * un resumen agregado y una descripción del esquema, para que un agente de IA
 * pueda interpretar los datos sin contexto adicional.
 */
export function buildExportPayload(
  expenses: Expense[],
  filters: ExportFilters,
  itemsByExpenseId?: Record<number, ExpenseItem[]>,
) {
  const now = new Date()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const amountOf = (e: Expense) => Number(e.amount) || 0
  const sum = (list: Expense[]) => round2(list.reduce((acc, e) => acc + amountOf(e), 0))

  const pagados = expenses.filter((e) => e.status === "pagado")
  const pendientes = expenses.filter((e) => e.status === "pendiente")
  const vencidos = pendientes.filter((e) => parseLocalDate(e.due_date) < today)

  const byKey = (key: (e: Expense) => string) => {
    const acc: Record<string, { cantidad: number; total: number }> = {}
    for (const e of expenses) {
      const k = key(e)
      if (!acc[k]) acc[k] = { cantidad: 0, total: 0 }
      acc[k].cantidad++
      acc[k].total = round2(acc[k].total + amountOf(e))
    }
    return acc
  }

  return {
    esquema: {
      moneda: "ARS (pesos argentinos)",
      categoria: "fijo = gasto recurrente mensual · tarjeta = resumen de tarjeta de crédito · variable = gasto ocasional",
      estado: "pagado | pendiente",
      vencimiento: "fecha límite de pago, formato YYYY-MM-DD",
      nota: "Los montos ya están en unidades de moneda (no en centavos).",
      pagado_y_saldo: "pagado = cuánto se pagó del monto; saldo = lo que falta. Un gasto con pagado > 0 y saldo > 0 es un pago parcial.",
      items:
        "Solo en gastos de categoría 'tarjeta': el desglose del resumen. El monto del gasto es el TOTAL a pagar y es el único que cuenta como egreso; los items explican en qué se fue ese total, NO se suman aparte.",
      items_sin_clasificar:
        "monto del resumen que no está cubierto por items (impuestos, sellados, consumos no cargados). monto − suma de items.",
      tipo_de_item: "fijo = recurrente · variable = ocasional · suscripcion = servicio mensual · financiero = intereses y refinanciación",
    },
    exportacion: {
      generado_el: now.toISOString(),
      fecha_de_referencia: toLocalISODate(today),
      periodo: describePeriod(filters),
      filtros_aplicados: {
        anio: filters.year,
        mes: filters.month === "all" ? "todos" : (MONTH_NAMES[filters.month] ?? filters.month),
        categoria: CATEGORY_LABELS[filters.category] ?? filters.category,
        estado: filters.status === "all" ? "todos" : filters.status,
        busqueda: filters.search || null,
      },
    },
    resumen: {
      cantidad_gastos: expenses.length,
      total: sum(expenses),
      total_pagado: sum(pagados),
      total_pendiente: sum(pendientes),
      cantidad_pagados: pagados.length,
      cantidad_pendientes: pendientes.length,
      cantidad_vencidos_impagos: vencidos.length,
      total_vencido_impago: sum(vencidos),
      gasto_promedio: expenses.length ? round2(sum(expenses) / expenses.length) : 0,
      por_categoria: byKey((e) => e.category),
      por_mes: byKey((e) => e.due_date.slice(0, 7)),
    },
    gastos: expenses.map((e) => ({
      id: e.id,
      descripcion: e.description,
      monto: amountOf(e),
      categoria: e.category,
      estado: e.status,
      vencimiento: e.due_date.slice(0, 10),
      dias_hasta_vencimiento: Math.round((parseLocalDate(e.due_date).getTime() - today.getTime()) / 86400000),
      notas: e.notes || null,
      codigo_de_pago: e.payment_code || null,
      cargado_por: e.added_by_name || null,
      tiene_comprobante: Boolean(e.has_receipt),
      tiene_factura: Boolean(e.has_invoice),
      creado_el: e.created_at,
      pagado: Number(e.paid_amount) || 0,
      saldo: round2(amountOf(e) - (Number(e.paid_amount) || 0)),
      pago_minimo: e.minimum_due != null ? Number(e.minimum_due) : null,
      // Desglose del resumen de tarjeta. El total del gasto sigue siendo el
      // número a pagar; estos items son en qué se fue ese total.
      items: (itemsByExpenseId?.[e.id] || []).map((i) => ({
        descripcion: i.description,
        monto: Number(i.amount) || 0,
        tipo: i.kind,
        comercio: i.merchant || null,
        fecha_de_compra: i.purchase_date || null,
        cuota: i.installment_total ? `${i.installment_current}/${i.installment_total}` : null,
        etiqueta: i.tag || null,
      })),
      items_sin_clasificar: itemsByExpenseId?.[e.id]
        ? round2(
            amountOf(e) - itemsByExpenseId[e.id].reduce((acc, i) => acc + (Number(i.amount) || 0), 0),
          )
        : null,
    })),
  }
}

export function toJSON(
  expenses: Expense[],
  filters: ExportFilters,
  itemsByExpenseId?: Record<number, ExpenseItem[]>,
): string {
  return JSON.stringify(buildExportPayload(expenses, filters, itemsByExpenseId), null, 2)
}

const CSV_COLUMNS = [
  "id",
  "descripcion",
  "monto",
  "moneda",
  "categoria",
  "estado",
  "vencimiento",
  "notas",
  "codigo_de_pago",
  "cargado_por",
] as const

const csvCell = (value: unknown) => {
  const s = value === null || value === undefined ? "" : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCSV(expenses: Expense[]): string {
  const rows = expenses.map((e) =>
    [
      e.id,
      e.description,
      Number(e.amount) || 0,
      "ARS",
      e.category,
      e.status,
      e.due_date.slice(0, 10),
      e.notes || "",
      e.payment_code || "",
      e.added_by_name || "",
    ]
      .map(csvCell)
      .join(","),
  )
  return [CSV_COLUMNS.join(","), ...rows].join("\r\n")
}

export function buildFileName(filters: ExportFilters, extension: "json" | "csv"): string {
  const period = filters.month === "all" ? filters.year : `${filters.year}-${filters.month}`
  const parts = ["gastos", period]
  if (filters.category !== "all") parts.push(filters.category)
  if (filters.status !== "all") parts.push(filters.status)
  return `${parts.join("_")}.${extension}`
}

/** Prompt sugerido para pegar junto al export en el chat con el agente. */
export function buildPrompt(filters: ExportFilters): string {
  return [
    `Adjunto la exportación de mis gastos de ${describePeriod(filters)} (moneda ARS).`,
    "Necesito que:",
    "1. Los clasifiques por tipo de gasto (servicios, vivienda, transporte, salud, ocio, etc.).",
    "2. Me digas en qué se me va la plata: top de categorías y de conceptos, con % sobre el total.",
    "3. Detectes gastos recurrentes, aumentos respecto de meses anteriores y cualquier cosa fuera de lo normal.",
    "4. Me armes una previsión del próximo mes y del total pendiente por vencer.",
    "5. Cierres con 3 recomendaciones concretas para recortar gasto.",
  ].join("\n")
}
