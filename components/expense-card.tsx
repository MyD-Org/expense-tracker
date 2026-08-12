"use client"

import { Button } from "@/components/ui/button"
import { CreditCard, DollarSign, TrendingDown, Check, Copy, Trash2, Pencil, Clock, CheckCircle2, Loader2 } from "lucide-react"
import { useState } from "react"
import type { Expense } from "@/lib/database"

interface ExpenseCardProps {
  expense: Expense
  onStatusChange: (id: number, status: Expense["status"]) => void | Promise<void>
  onEdit: (expense: Expense) => void
  onDelete: (id: number) => void
  onView?: (expense: Expense) => void
}

const categoryMeta = {
  fijo: { icon: DollarSign, label: "Fijo", accent: "bg-blue-500/15 text-blue-400" },
  tarjeta: { icon: CreditCard, label: "Tarjeta", accent: "bg-amber-500/15 text-amber-400" },
  variable: { icon: TrendingDown, label: "Variable", accent: "bg-purple-500/15 text-purple-400" },
} as const

export function ExpenseCard({ expense, onStatusChange, onEdit, onDelete, onView }: ExpenseCardProps) {
  const [copied, setCopied] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)

  const handleStatusToggle = async (status: Expense["status"]) => {
    if (changingStatus) return
    try {
      setChangingStatus(true)
      await onStatusChange(expense.id, status)
    } finally {
      setChangingStatus(false)
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(amount)

  // due_date puede venir como "YYYY-MM-DD" o ISO con hora; parseamos como fecha
  // LOCAL para evitar el corrimiento UTC → -3h que muestra el día anterior.
  const parseLocalDate = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number)
    return new Date(y, m - 1, d)
  }
  const formatDate = (s: string) => parseLocalDate(s).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })

  const handleCopyCode = async () => {
    if (!expense.payment_code) return
    try {
      await navigator.clipboard.writeText(expense.payment_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const isPaid = expense.status === "pagado"
  const paid = Number(expense.paid_amount) || 0
  const total = Number(expense.amount) || 0
  const balance = Math.max(0, total - paid)
  // "Parcial" es un saldo a medio pagar, no un estado guardado en la base.
  const isPartial = !isPaid && paid > 0
  const isStatement = expense.category === "tarjeta" && !!expense.card_id && (expense.item_count || 0) > 0
  const unclassified = total - (Number(expense.items_total) || 0)
  const meta = categoryMeta[expense.category]
  const CategoryIcon = meta.icon

  // ¿Está vencido o por vencer?
  const due = parseLocalDate(expense.due_date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysLeft = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const overdue = !isPaid && daysLeft < 0
  const soon = !isPaid && daysLeft >= 0 && daysLeft <= 3

  return (
    <div
      onClick={() => onView?.(expense)}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border bg-slate-800/40 p-5 shadow-lg transition-all hover:bg-slate-800/70 ${
        overdue ? "border-red-500/30" : soon ? "border-amber-500/30" : "border-slate-700/40"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.accent}`}>
            <CategoryIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-100">{expense.description}</h3>
            <span className="text-xs text-slate-500">{meta.label}</span>
          </div>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
            isPaid
              ? "bg-emerald-500/15 text-emerald-300"
              : isPartial
                ? "bg-blue-500/15 text-blue-300"
                : "bg-amber-500/15 text-amber-300"
          }`}
        >
          {isPaid ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {isPaid ? "Pagado" : isPartial ? "Parcial" : "Pendiente"}
        </span>
      </div>

      {/* Monto + fecha */}
      <div className="mt-4 flex items-end justify-between">
        <span className="text-2xl font-bold text-white">{formatCurrency(expense.amount)}</span>
        <span
          className={`text-xs font-medium ${overdue ? "text-red-400" : soon ? "text-amber-400" : "text-slate-400"}`}
        >
          {overdue ? `Venció ${formatDate(expense.due_date)}` : `Vence ${formatDate(expense.due_date)}`}
        </span>
      </div>

      {/* Saldo, cuando hay un pago parcial encima */}
      {isPartial && (
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-slate-500">Pagaste {formatCurrency(paid)}</span>
          <span className="font-semibold text-amber-300">Saldo {formatCurrency(balance)}</span>
        </div>
      )}

      {/* Desglose del resumen */}
      {isStatement && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-md bg-slate-700/50 px-2 py-0.5 text-slate-300">
            {expense.item_count} {expense.item_count === 1 ? "item" : "items"}
          </span>
          {unclassified > 1 && (
            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-slate-500">
              {formatCurrency(unclassified)} sin clasificar
            </span>
          )}
        </div>
      )}

      {expense.added_by_name && (
        <p className="mt-1 text-xs text-slate-500">Agregado por {expense.added_by_name}</p>
      )}

      {/* Código de pago */}
      {expense.payment_code && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2">
          <span className="text-xs text-slate-500">Código:</span>
          <code className="flex-1 truncate font-mono text-xs text-blue-300">{expense.payment_code}</code>
          <button onClick={(e) => { e.stopPropagation(); handleCopyCode() }} className="shrink-0 text-blue-400 transition-colors hover:text-blue-300" title="Copiar">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}

      {/* Acciones — solo para gastos pendientes. Un gasto pagado queda
          "cerrado": no se edita ni se borra desde la card. Notas y adjuntos
          se ven solo en el detalle (tocando la tarjeta). */}
      {!isPaid && (
        <div className="mt-4 flex items-center gap-2">
          <Button
            size="sm"
            disabled={changingStatus}
            onClick={(e) => { e.stopPropagation(); handleStatusToggle("pagado") }}
            className="flex-1 rounded-lg bg-emerald-600 text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
          >
            {changingStatus ? (
              <span className="flex items-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</span>
            ) : (
              <span className="flex items-center gap-1.5"><Check className="h-4 w-4" /> Marcar pagado</span>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => { e.stopPropagation(); onEdit(expense) }}
            className="rounded-lg border-slate-700 bg-slate-800/60 px-3 text-slate-300 hover:bg-slate-700 hover:text-white"
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => { e.stopPropagation(); onDelete(expense.id) }}
            className="rounded-lg border-slate-700 bg-slate-800/60 px-3 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
