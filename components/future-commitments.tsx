"use client"

import { useEffect, useState } from "react"
import { CalendarClock, ChevronDown } from "lucide-react"

interface Commitment {
  billing_month: string
  card_id: number
  card_name: string
  total: number
  count: number
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)

const monthLabel = (billingMonth: string) => {
  const [y, m] = billingMonth.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" })
}

/**
 * Cuotas ya comprometidas para los meses que vienen: lo que vas a pagar sí o sí
 * antes de comprar nada nuevo.
 */
export function FutureCommitments() {
  const [rows, setRows] = useState<Commitment[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch("/api/commitments?months=12")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => {})
  }, [])

  if (!rows.length) return null

  // Agrupamos por mes, sumando todas las tarjetas.
  const byMonth = new Map<string, { total: number; count: number; cards: Commitment[] }>()
  for (const r of rows) {
    const entry = byMonth.get(r.billing_month) || { total: 0, count: 0, cards: [] }
    entry.total += r.total
    entry.count += r.count
    entry.cards.push(r)
    byMonth.set(r.billing_month, entry)
  }
  const months = [...byMonth.entries()]
  const grandTotal = months.reduce((s, [, v]) => s + v.total, 0)
  const peak = Math.max(...months.map(([, v]) => v.total))

  return (
    <div className="rounded-2xl border border-slate-700/40 bg-slate-800/30 p-4">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-slate-200">Comprometido en cuotas</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-base font-bold text-amber-300">{fmt(grandTotal)}</span>
          <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      <p className="mt-1 text-xs text-slate-500">
        Próximos {months.length} {months.length === 1 ? "mes" : "meses"} · ya está gastado
      </p>

      {open && (
        <div className="mt-3 space-y-2">
          {months.map(([month, v]) => (
            <div key={month} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="capitalize text-slate-300">{monthLabel(month)}</span>
                <span className="font-semibold text-slate-100">{fmt(v.total)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-amber-500/70" style={{ width: `${(v.total / peak) * 100}%` }} />
              </div>
              <p className="text-[11px] text-slate-500">
                {v.count} {v.count === 1 ? "cuota" : "cuotas"} · {v.cards.map((c) => c.card_name).join(", ")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
