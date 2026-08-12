"use client"

import { useState } from "react"
import { DollarSign, CreditCard, Calendar, AlertTriangle, TrendingUp, TrendingDown, Copy, Wallet, ArrowUpRight } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { Expense } from "@/lib/database"
import { FutureCommitments } from "@/components/future-commitments"

type StatFilter = "paid" | "pending" | "upcoming" | "total"

const STAT_TITLES: Record<StatFilter, string> = {
  paid: "Gastos pagados",
  pending: "Gastos pendientes",
  upcoming: "Por vencer en 7 días",
  total: "Todos los gastos",
}

interface ExpenseDashboardProps {
  expenses: Expense[]
  stats: {
    totalExpenses: number
    totalPaid: number
    totalPending: number
    totalFixed: number
    totalVariable: number
    totalCards: number
    upcomingDue: number
  }
  onExpenseClick?: (expense: Expense) => void
  onNavigateCategory?: (category: string) => void
  selectedMonth: string
  selectedYear: string
  onMonthChange: (v: string) => void
  onYearChange: (v: string) => void
}

const MONTH_OPTIONS = [
  { value: "all", label: "Todo el año" },
  { value: "01", label: "Enero" },
  { value: "02", label: "Febrero" },
  { value: "03", label: "Marzo" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Mayo" },
  { value: "06", label: "Junio" },
  { value: "07", label: "Julio" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Septiembre" },
  { value: "10", label: "Octubre" },
  { value: "11", label: "Noviembre" },
  { value: "12", label: "Diciembre" },
] as const

export function ExpenseDashboard({
  expenses,
  stats,
  onExpenseClick,
  onNavigateCategory,
  selectedMonth,
  selectedYear,
  onMonthChange,
  onYearChange,
}: ExpenseDashboardProps) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(amount)

  const paidCount = expenses.filter((e) => e.status === "pagado").length
  const pendingCount = expenses.filter((e) => e.status === "pendiente").length
  const fixedCount = expenses.filter((e) => e.category === "fijo").length
  const variableCount = expenses.filter((e) => e.category === "variable").length
  const cardCount = expenses.filter((e) => e.category === "tarjeta").length

  const total = stats.totalPaid + stats.totalPending
  const paidPct = total > 0 ? Math.round((stats.totalPaid / total) * 100) : 0

  // Fecha local a medianoche (sin hora) para comparar solo por día
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
  // due_date viene como "YYYY-MM-DD" (o ISO con hora); se parsea como fecha LOCAL
  // para no correrla un día por la conversión a UTC.
  const parseLocalDate = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number)
    return new Date(y, m - 1, d)
  }
  // Urgentes = pendientes que vencen dentro de los próximos 7 días O que ya
  // vencieron y siguen impagos (due_date <= nextWeek, sin cota inferior).
  const upcomingExpenses = expenses.filter((e) => {
    if (e.status === "pagado") return false
    return parseLocalDate(e.due_date) <= nextWeek
  })
  const upcomingTotal = upcomingExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

  const [statFilter, setStatFilter] = useState<StatFilter | null>(null)
  const filteredList = (() => {
    if (!statFilter) return [] as Expense[]
    if (statFilter === "paid") return expenses.filter((e) => e.status === "pagado")
    if (statFilter === "pending") return expenses.filter((e) => e.status === "pendiente")
    if (statFilter === "upcoming") return upcomingExpenses
    return expenses
  })()
  const filteredTotal = filteredList.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

  const fmtDate = (s: string) =>
    parseLocalDate(s).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* ── Hero: balance total ── */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-700/40 bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 p-6 sm:p-8 shadow-2xl">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-400">
              <Wallet className="h-4 w-4" />
              <span className="text-sm font-medium">Balance del período</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Select value={selectedMonth} onValueChange={onMonthChange}>
                <SelectTrigger className="h-8 w-[112px] rounded-lg border-slate-600/60 bg-slate-900/40 px-3 text-xs font-medium text-white focus:border-blue-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-600 bg-slate-800">
                  {MONTH_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="text-white hover:bg-slate-700">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedYear} onValueChange={onYearChange}>
                <SelectTrigger className="h-8 w-[80px] rounded-lg border-slate-600/60 bg-slate-900/40 px-3 text-xs font-medium text-white focus:border-blue-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-600 bg-slate-800">
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                    <SelectItem key={y} value={y.toString()} className="text-white hover:bg-slate-700">
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-2 text-4xl sm:text-5xl font-bold tracking-tight text-white">{formatCurrency(total)}</div>
          <p className="mt-1 text-sm text-slate-400">{stats.totalExpenses} gastos registrados</p>

          {/* Barra de progreso pagado/pendiente */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Pagado {paidPct}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> Pendiente {100 - paidPct}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-700/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                style={{ width: `${paidPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Cards resumen ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Pagados"
          value={formatCurrency(stats.totalPaid)}
          hint={`${paidCount} gastos`}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="emerald"
          onClick={() => setStatFilter("paid")}
        />
        <StatCard
          label="Pendientes"
          value={formatCurrency(stats.totalPending)}
          hint={`${pendingCount} gastos`}
          icon={<Calendar className="h-5 w-5" />}
          accent="amber"
          onClick={() => setStatFilter("pending")}
        />
        <StatCard
          label="Por vencer"
          value={String(stats.upcomingDue)}
          hint="próximos 7 días"
          icon={<AlertTriangle className="h-5 w-5" />}
          accent="red"
          onClick={() => setStatFilter("upcoming")}
        />
        <StatCard
          label="Total gastos"
          value={formatCurrency(total)}
          hint={`${stats.totalExpenses} items`}
          icon={<DollarSign className="h-5 w-5" />}
          accent="blue"
          onClick={() => setStatFilter("total")}
        />
      </div>

      {/* ── Próximos vencimientos ── */}
      {upcomingExpenses.length > 0 && (
        <div className="overflow-hidden rounded-3xl border border-amber-500/20 bg-gradient-to-br from-amber-950/40 to-slate-900/60 p-5 sm:p-6 shadow-xl">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-semibold text-white">Próximos vencimientos</h3>
              <p className="text-xs text-slate-400">Vencidos y próximos 7 días</p>
            </div>
          </div>
          <div className="space-y-2">
            {upcomingExpenses.slice(0, 5).map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onNavigateCategory?.(e.category)}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-700/40 bg-slate-800/40 px-4 py-3 text-left transition-colors hover:bg-slate-800/70"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-100">{e.description}</p>
                  <p className="text-xs text-amber-300/80">Vence {fmtDate(e.due_date)}</p>
                </div>
                <span className="shrink-0 rounded-lg bg-amber-500/10 px-3 py-1.5 text-sm font-semibold text-amber-300">
                  {formatCurrency(e.amount)}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-amber-500/20 pt-3">
            <span className="text-sm text-slate-400">
              Total{upcomingExpenses.length > 5 ? ` (${upcomingExpenses.length} gastos)` : ""}
            </span>
            <span className="text-base font-bold text-amber-300">{formatCurrency(upcomingTotal)}</span>
          </div>
        </div>
      )}

      {/* ── Desglose por categoría ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <CategoryCard
          title="Gastos Fijos"
          value={formatCurrency(stats.totalFixed)}
          count={fixedCount}
          icon={<DollarSign className="h-5 w-5" />}
          accent="blue"
          onClick={() => onNavigateCategory?.("fijo")}
        />
        <CategoryCard
          title="Tarjetas"
          value={formatCurrency(stats.totalCards)}
          count={cardCount}
          icon={<CreditCard className="h-5 w-5" />}
          accent="amber"
          onClick={() => onNavigateCategory?.("tarjeta")}
        />
        <CategoryCard
          title="Gastos Variables"
          value={formatCurrency(stats.totalVariable)}
          count={variableCount}
          icon={<TrendingDown className="h-5 w-5" />}
          accent="purple"
          onClick={() => onNavigateCategory?.("variable")}
        />
      </div>

      {/* ── Cuotas ya comprometidas hacia adelante ── */}
      <FutureCommitments />

      {/* ── Gastos recientes ── */}
      <div className="overflow-hidden rounded-3xl border border-slate-700/40 bg-slate-800/40 p-5 sm:p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
            <Calendar className="h-5 w-5" />
          </span>
          <h3 className="font-semibold text-white">Gastos recientes</h3>
        </div>

        <div className="space-y-2">
          {expenses.slice(0, 5).map((e) => (
            <div
              key={e.id}
              role="button"
              tabIndex={0}
              onClick={() => onExpenseClick?.(e)}
              onKeyDown={(ev) => { if (ev.key === "Enter") onExpenseClick?.(e) }}
              className="cursor-pointer rounded-2xl border border-slate-700/40 bg-slate-800/40 px-4 py-3 transition-colors hover:bg-slate-800/70"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-100">{e.description}</p>
                  <p className="text-xs text-slate-400">
                    {fmtDate(e.due_date)} · <span className="capitalize">{e.category}</span>
                    {e.added_by_name && <span className="text-slate-500"> · {e.added_by_name}</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      e.status === "pagado"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {e.status === "pagado" ? "Pagado" : "Pendiente"}
                  </span>
                  <span className="text-sm font-semibold text-slate-200">{formatCurrency(e.amount)}</span>
                </div>
              </div>
              {e.payment_code && (
                <div className="mt-2 flex items-center gap-2 border-t border-slate-700/40 pt-2">
                  <span className="text-xs text-slate-500">Código:</span>
                  <code className="rounded bg-slate-900/80 px-2 py-0.5 font-mono text-xs text-blue-300">{e.payment_code}</code>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); navigator.clipboard.writeText(e.payment_code!) }}
                    className="text-blue-400 transition-colors hover:text-blue-300"
                    title="Copiar código"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {expenses.length === 0 && (
            <div className="py-12 text-center text-slate-400">
              <Wallet className="mx-auto mb-3 h-10 w-10 text-slate-600" />
              <p>No hay gastos todavía</p>
              <p className="text-sm text-slate-500">Agregá tu primer gasto con el botón "Nuevo Gasto"</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={statFilter !== null} onOpenChange={(open) => { if (!open) setStatFilter(null) }}>
        <DialogContent className="max-w-lg border-slate-700 bg-slate-900 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">
              {statFilter ? STAT_TITLES[statFilter] : ""}
            </DialogTitle>
            <p className="text-sm text-slate-400">
              {filteredList.length} {filteredList.length === 1 ? "gasto" : "gastos"} · {formatCurrency(filteredTotal)}
            </p>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {filteredList.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">No hay gastos en esta categoría.</p>
            )}
            {filteredList.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => { setStatFilter(null); onNavigateCategory?.(e.category) }}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-700/40 bg-slate-800/40 px-4 py-3 text-left transition-colors hover:bg-slate-800/70"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-100">{e.description}</p>
                  <p className="truncate text-xs text-slate-400">
                    {fmtDate(e.due_date)} · <span className="capitalize">{e.category}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold text-slate-100">{formatCurrency(e.amount)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      e.status === "pagado"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {e.status === "pagado" ? "Pagado" : "Pendiente"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const accentMap = {
  emerald: { ring: "border-emerald-500/20", icon: "bg-emerald-500/15 text-emerald-400", glow: "bg-emerald-500/10" },
  amber: { ring: "border-amber-500/20", icon: "bg-amber-500/15 text-amber-400", glow: "bg-amber-500/10" },
  red: { ring: "border-red-500/20", icon: "bg-red-500/15 text-red-400", glow: "bg-red-500/10" },
  blue: { ring: "border-blue-500/20", icon: "bg-blue-500/15 text-blue-400", glow: "bg-blue-500/10" },
  purple: { ring: "border-purple-500/20", icon: "bg-purple-500/15 text-purple-400", glow: "bg-purple-500/10" },
} as const

function StatCard({
  label,
  value,
  hint,
  icon,
  accent,
  onClick,
}: {
  label: string
  value: string
  hint: string
  icon: React.ReactNode
  accent: keyof typeof accentMap
  onClick?: () => void
}) {
  const a = accentMap[accent]
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => { if (onClick && e.key === "Enter") onClick() }}
      className={`group relative overflow-hidden rounded-2xl border ${a.ring} bg-slate-800/40 p-4 shadow-lg transition-all hover:bg-slate-800/70 ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full ${a.glow} blur-2xl`} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-400">{label}</span>
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${a.icon}`}>{icon}</span>
        </div>
        <div className="mt-3 text-xl sm:text-2xl font-bold text-white truncate">{value}</div>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
    </div>
  )
}

function CategoryCard({
  title,
  value,
  count,
  icon,
  accent,
  onClick,
}: {
  title: string
  value: string
  count: number
  icon: React.ReactNode
  accent: keyof typeof accentMap
  onClick?: () => void
}) {
  const a = accentMap[accent]
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => { if (onClick && e.key === "Enter") onClick() }}
      className={`group relative overflow-hidden rounded-2xl border ${a.ring} bg-slate-800/40 p-5 shadow-lg transition-all hover:bg-slate-800/70 ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full ${a.glow} blur-2xl`} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${a.icon}`}>{icon}</span>
          <ArrowUpRight className="h-4 w-4 text-slate-600 transition-colors group-hover:text-slate-400" />
        </div>
        <div className="mt-4 text-2xl font-bold text-white truncate">{value}</div>
        <p className="mt-0.5 text-sm text-slate-400">{title}</p>
        <p className="text-xs text-slate-500">{count} {count === 1 ? "gasto" : "gastos"}</p>
      </div>
    </div>
  )
}
