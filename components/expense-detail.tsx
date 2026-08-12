"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  CalendarDays,
  Tag,
  ArrowRight,
  Pencil,
  Trash2,
  Layers,
  CreditCard,
  DollarSign,
  TrendingDown,
} from "lucide-react"
import type { Expense } from "@/lib/database"

interface ExpenseDetailProps {
  expense: Expense | undefined
  onClose: () => void
  onViewFull: (expense: Expense) => void
  onEdit: (expense: Expense) => void
  onDelete: (expense: Expense) => void
}

const categoryLabels = { fijo: "Gasto fijo", tarjeta: "Tarjeta de crédito", variable: "Gasto variable" } as const

const categoryMeta = {
  fijo: { icon: DollarSign, accent: "bg-blue-500/15 text-blue-400" },
  tarjeta: { icon: CreditCard, accent: "bg-amber-500/15 text-amber-400" },
  variable: { icon: TrendingDown, accent: "bg-purple-500/15 text-purple-400" },
} as const

export function ExpenseDetail({ expense, onClose, onViewFull, onEdit, onDelete }: ExpenseDetailProps) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(amount)

  const formatDate = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })
  }

  return (
    <Dialog open={!!expense} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!fixed !left-1/2 !top-[50%] !w-[calc(100vw-2rem)] !max-w-sm !-translate-x-1/2 !-translate-y-1/2 gap-0 overflow-hidden border-slate-700 bg-slate-900 p-0 sm:!max-w-sm">
        {expense && (() => {
          const meta = categoryMeta[expense.category]
          const CategoryIcon = meta.icon
          const isPaid = expense.status === "pagado"
          const paid = Number(expense.paid_amount) || 0
          const total = Number(expense.amount) || 0
          const balance = Math.max(0, total - paid)
          const isPartial = !isPaid && paid > 0
          const isStatement = expense.category === "tarjeta" && !!expense.card_id && !!expense.billing_month
          const itemCount = expense.item_count || 0
          const itemsTotal = Number(expense.items_total) || 0
          const unclassified = Math.max(0, total - itemsTotal)

          return (
            <>
              <DialogHeader className="border-b border-slate-800 px-4 py-4 sm:px-5">
                <div className="flex items-start gap-3 pr-6">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.accent}`}>
                    <CategoryIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-left text-base font-semibold leading-snug text-white">
                      {expense.description}
                    </DialogTitle>
                    <p className="mt-0.5 text-xs text-slate-500">{categoryLabels[expense.category]}</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 px-4 py-4 sm:px-5">
                <div className="flex items-end justify-between gap-3">
                  <span className="text-3xl font-bold text-white">{formatCurrency(total)}</span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      isPaid
                        ? "bg-emerald-500/15 text-emerald-300"
                        : isPartial
                          ? "bg-blue-500/15 text-blue-300"
                          : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {isPaid ? "Pagado" : isPartial ? "Pago parcial" : "Pendiente"}
                  </span>
                </div>

                {isPartial && (
                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-700/50 bg-slate-800/40 p-3 text-center text-xs">
                    <div>
                      <p className="text-slate-500">Pagaste</p>
                      <p className="font-semibold text-emerald-300">{formatCurrency(paid)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Saldo</p>
                      <p className="font-semibold text-amber-300">{formatCurrency(balance)}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-2.5 rounded-xl border border-slate-700/40 bg-slate-800/30 p-3 text-sm">
                  <Row icon={<CalendarDays className="h-3.5 w-3.5" />} label="Vencimiento" value={formatDate(expense.due_date)} />
                  <Row icon={<Tag className="h-3.5 w-3.5" />} label="Categoría" value={categoryLabels[expense.category]} />
                  {isStatement && (
                    <Row
                      icon={<Layers className="h-3.5 w-3.5" />}
                      label="Desglose"
                      value={
                        itemCount > 0
                          ? `${itemCount} ${itemCount === 1 ? "item" : "items"}${unclassified > 1 ? ` · ${formatCurrency(unclassified)} sin clasificar` : ""}`
                          : "Sin items cargados"
                      }
                    />
                  )}
                </div>

                <Button
                  onClick={() => onViewFull(expense)}
                  className="h-11 w-full gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 font-semibold text-white hover:from-blue-500 hover:to-blue-600"
                >
                  Ver detalle
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onEdit(expense)}
                    className="h-10 gap-1.5 rounded-xl border-slate-600 bg-slate-800/60 text-sm text-slate-200 hover:bg-slate-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onDelete(expense)}
                    className="h-10 gap-1.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </Button>
                </div>
              </div>
            </>
          )
        })()}
      </DialogContent>
    </Dialog>
  )
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex shrink-0 items-center gap-1.5 text-slate-400">
        {icon} {label}
      </span>
      <span className="text-right text-xs font-medium leading-snug text-slate-200 sm:text-sm">{value}</span>
    </div>
  )
}
