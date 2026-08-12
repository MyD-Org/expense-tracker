import type { ItemKind } from "@/lib/expense-items"

export interface ParsedStatementItem {
  description: string
  amount: number
  kind?: ItemKind
  merchant?: string | null
  purchase_date?: string | null
  installment_current?: number | null
  installment_total?: number | null
}

export interface ParsedStatementResult {
  items: ParsedStatementItem[]
  statement_total?: number | null
}

const IGNORE =
  /\b(total|saldo anterior|pago m[ií]nimo|impuesto|iva|iibb|sellos?|percepci[oó]n|cargo|inter[eé]s|punitorio|db\.?\s*iva|cr\.?\s|r[eé]gimen|ley\s+\d|resumen|vencimiento|limite|disponible|tna|tem|cf\.?t|cuotas?\s+a\s+vencer|plan\s+v)\b/i

const CUOTA = /(?:cuota\s*)?(\d{1,2})\s*[\/de]\s*(\d{1,2})/i
const DATE = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/
/** Monto argentino al final de línea: 45.200,50 o $ 1.234,56 */
const AMOUNT_END = /(?:\$?\s*)([\d.]+,\d{2}|\d+\.\d{2})\s*$/

function parseArAmount(raw: string): number | null {
  const s = raw.replace(/\$/g, "").trim()
  if (!s) return null
  if (s.includes(",")) {
    const n = Number.parseFloat(s.replace(/\./g, "").replace(",", "."))
    return Number.isFinite(n) && n > 0 ? round2(n) : null
  }
  const n = Number.parseFloat(s)
  return Number.isFinite(n) && n > 0 ? round2(n) : null
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function toIsoDate(d: string, m: string, y: string): string | null {
  const year = y.length === 2 ? 2000 + Number.parseInt(y) : Number.parseInt(y)
  const month = Number.parseInt(m)
  const day = Number.parseInt(d)
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function inferKind(desc: string): ParsedStatementItem["kind"] {
  const d = desc.toLowerCase()
  if (/netflix|spotify|disney|hbo|amazon prime|youtube|apple\.com|google\*|microsoft\*|adobe|chatgpt|openai/i.test(d))
    return "suscripcion"
  if (/seguro|life|medife|osde|swiss medical|galeno/i.test(d)) return "fijo"
  if (/inter[eé]s|financiaci[oó]n|refinanc|punitorio|cargo financiero/i.test(d)) return "financiero"
  return "variable"
}

function parseLine(line: string): ParsedStatementItem | null {
  const trimmed = line.replace(/\s+/g, " ").trim()
  if (trimmed.length < 6 || IGNORE.test(trimmed)) return null

  const amountMatch = trimmed.match(AMOUNT_END)
  if (!amountMatch) return null

  const amount = parseArAmount(amountMatch[1])
  if (!amount || amount < 50) return null // filtra centavos sueltos / ruido

  let rest = trimmed.slice(0, amountMatch.index).trim()
  let purchase_date: string | null = null

  const dateMatch = rest.match(DATE)
  if (dateMatch) {
    purchase_date = toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3])
    rest = rest.slice(dateMatch[0].length).trim()
  }

  let installment_current: number | null = null
  let installment_total: number | null = null
  const cuotaMatch = rest.match(CUOTA)
  if (cuotaMatch) {
    installment_current = Number.parseInt(cuotaMatch[1])
    installment_total = Number.parseInt(cuotaMatch[2])
    rest = rest.replace(cuotaMatch[0], "").trim()
  }

  const description = rest.replace(/[^\w\s*./\-&áéíóúñÁÉÍÓÚÑ]/g, " ").replace(/\s+/g, " ").trim()
  if (description.length < 2) return null
  if (/^\d+$/.test(description)) return null

  return {
    description: description.slice(0, 200),
    amount,
    kind: inferKind(description),
    purchase_date,
    installment_current,
    installment_total,
  }
}

/** Detecta "total a pagar" en encabezados del resumen. */
function extractStatementTotal(text: string): number | null {
  const patterns = [
    /total\s+a\s+pagar[:\s]*\$?\s*([\d.]+,\d{2})/i,
    /saldo\s+actual[:\s]*\$?\s*([\d.]+,\d{2})/i,
    /total\s+pesos[:\s]*\$?\s*([\d.]+,\d{2})/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) {
      const n = parseArAmount(m[1])
      if (n && n > 1000) return n
    }
  }
  return null
}

/** Parser gratuito basado en texto (PDF digital u OCR). Sin IA. */
export function parseStatementText(text: string): ParsedStatementResult {
  const lines = text.split(/\r?\n/)
  const seen = new Set<string>()
  const items: ParsedStatementItem[] = []

  for (const line of lines) {
    const item = parseLine(line)
    if (!item) continue
    const key = `${item.description.toLowerCase()}|${item.amount}|${item.installment_current ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push(item)
  }

  // Algunos PDFs pegan fecha+monto en una sola línea partida raro: reintentar
  // uniendo líneas cortas con la siguiente si no hubo resultados.
  if (items.length === 0 && text.length > 200) {
    const merged: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const a = lines[i].trim()
      const b = lines[i + 1]?.trim() ?? ""
      if (a && b && !AMOUNT_END.test(a) && AMOUNT_END.test(`${a} ${b}`)) {
        merged.push(`${a} ${b}`)
        i++
      } else if (a) {
        merged.push(a)
      }
    }
    for (const line of merged) {
      const item = parseLine(line)
      if (!item) continue
      const key = `${item.description.toLowerCase()}|${item.amount}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push(item)
    }
  }

  items.sort((a, b) => b.amount - a.amount)

  return {
    items,
    statement_total: extractStatementTotal(text),
  }
}
