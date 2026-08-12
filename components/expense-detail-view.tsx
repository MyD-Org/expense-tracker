"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Pencil,
  Copy,
  Check,
  FileText,
  ReceiptText,
  Download,
  Loader2,
  CalendarDays,
  Tag,
  CircleDot,
  User,
  Trash2,
  Wallet,
  ArrowLeft,
} from "lucide-react"
import type { Expense } from "@/lib/database"
import { dataUrlToObjectUrl } from "@/lib/data-url"
import { StatementItems } from "@/components/statement-items"

const categoryLabels = { fijo: "Gasto fijo", tarjeta: "Tarjeta de crédito", variable: "Gasto variable" } as const

export interface ExpenseDetailViewProps {
  expense: Expense
  variant?: "page" | "modal"
  onBack?: () => void
  onEdit: (expense: Expense) => void
  onDelete: (expense: Expense) => void
  onRefresh?: () => void
}

export function ExpenseDetailView({
  expense,
  variant = "page",
  onBack,
  onEdit,
  onDelete,
  onRefresh,
}: ExpenseDetailViewProps) {
  const [copied, setCopied] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [payAmount, setPayAmount] = useState("")
  const [paying, setPaying] = useState(false)
  const [loadingDoc, setLoadingDoc] = useState<"receipt" | "invoice" | null>(null)
  const [doc, setDoc] = useState<{ data: string; isPdf: boolean; name: string; title: string } | null>(null)

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(amount)

  const formatDate = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })
  }

  const viewDoc = async (kind: "receipt" | "invoice") => {
    setLoadingDoc(kind)
    try {
      const res = await fetch(`/api/expenses/${expense.id}/${kind}`)
      if (!res.ok) throw new Error()
      const { data, name } = await res.json()
      const isPdf = data.startsWith("data:application/pdf")
      const url = dataUrlToObjectUrl(data)
      setDoc({ data: url, isPdf, name: name || "documento", title: kind === "receipt" ? "Comprobante de pago" : "Factura" })
    } catch {
      /* noop */
    } finally {
      setLoadingDoc(null)
    }
  }

  const closeDoc = () => {
    if (doc) URL.revokeObjectURL(doc.data)
    setDoc(null)
  }

  const registerPayment = async (amount: number) => {
    if (paying) return
    setPaying(true)
    try {
      const res = await fetch(`/api/expenses/${expense.id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, replace: false }),
      })
      if (!res.ok) throw new Error()
      setPayOpen(false)
      setPayAmount("")
      onRefresh?.()
    } catch {
      /* noop */
    } finally {
      setPaying(false)
    }
  }

  const isPaid = expense.status === "pagado"
  const total = Number(expense.amount) || 0
  const paid = Number(expense.paid_amount) || 0
  const balance = Math.max(0, total - paid)
  const isPartial = !isPaid && paid > 0
  const isStatement = expense.category === "tarjeta" && !!expense.card_id && !!expense.billing_month
  const isPage = variant === "page"

  const summaryCard = (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4 sm:p-5">
      <p className="text-sm text-slate-400">{expense.description}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className={`font-bold text-white ${isPage ? "text-3xl sm:text-4xl" : "text-3xl"}`}>{formatCurrency(total)}</span>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
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

      {(isPartial || isStatement) && !isPaid && (
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-700/50 pt-3 text-center">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Total</p>
            <p className="text-sm font-semibold text-slate-200">{formatCurrency(total)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Pagaste</p>
            <p className="text-sm font-semibold text-emerald-300">{formatCurrency(paid)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Saldo</p>
            <p className="text-sm font-semibold text-amber-300">{formatCurrency(balance)}</p>
          </div>
        </div>
      )}
    </div>
  )

  const paymentBlock = !isPaid && (
    <div className="space-y-2 rounded-2xl border border-slate-700/40 bg-slate-900/40 p-3 sm:p-4">
      {!payOpen ? (
        <Button
          onClick={() => {
            setPayOpen(true)
            setPayAmount(String(Math.round(balance)))
          }}
          className="w-full gap-2 rounded-xl bg-emerald-600 py-4 font-semibold text-white hover:bg-emerald-500"
        >
          <Wallet className="h-4 w-4" /> Registrar pago
        </Button>
      ) : (
        <>
          <div className="flex gap-2">
            <Input
              autoFocus
              inputMode="decimal"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && registerPayment(Number.parseFloat(payAmount) || 0)}
              className="h-10 flex-1 rounded-xl border-slate-700 bg-slate-900/60 text-white"
            />
            <Button
              onClick={() => registerPayment(Number.parseFloat(payAmount) || 0)}
              disabled={paying || !payAmount}
              className="h-10 rounded-xl bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pagar"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <QuickAmount label="Todo el saldo" onClick={() => setPayAmount(String(Math.round(balance)))} />
            {expense.minimum_due != null && (
              <QuickAmount
                label={`Mínimo ${formatCurrency(Number(expense.minimum_due))}`}
                onClick={() => setPayAmount(String(Math.round(Number(expense.minimum_due))))}
              />
            )}
            <QuickAmount label="Cancelar" onClick={() => setPayOpen(false)} />
          </div>
          <p className="px-1 text-[11px] text-slate-500">
            Si pagás menos que el saldo, el resto se refinancia y vuelve el mes que viene con intereses.
          </p>
        </>
      )}
    </div>
  )

  const metaBlock = (
    <div className="space-y-3 rounded-2xl border border-slate-700/40 bg-slate-900/30 p-4 text-sm">
      <Row icon={<Tag className="h-4 w-4" />} label="Categoría" value={categoryLabels[expense.category]} />
      <Row icon={<CalendarDays className="h-4 w-4" />} label="Vencimiento" value={formatDate(expense.due_date)} />
      <Row icon={<CircleDot className="h-4 w-4" />} label="Estado" value={isPaid ? "Pagado" : "Pendiente"} />
      {expense.added_by_name && (
        <Row icon={<User className="h-4 w-4" />} label="Agregado por" value={expense.added_by_name} />
      )}
      {expense.notes && (
        <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-3">
          <p className="text-xs text-slate-500">Notas</p>
          <p className="mt-0.5 text-slate-200">{expense.notes}</p>
        </div>
      )}
      {expense.payment_code && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-700/40 bg-slate-800/40 p-3">
          <span className="text-xs text-slate-500">Código:</span>
          <code className="flex-1 truncate font-mono text-xs text-blue-300">{expense.payment_code}</code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(expense.payment_code!)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="text-blue-400 hover:text-blue-300"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  )

  const docsBlock = (expense.has_receipt || expense.has_invoice) && (
    <div className="flex flex-wrap gap-2">
      {expense.has_receipt && (
        <button
          onClick={() => viewDoc("receipt")}
          disabled={loadingDoc !== null}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs font-medium text-blue-300 hover:bg-blue-500/10 disabled:opacity-50"
        >
          {loadingDoc === "receipt" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          {loadingDoc === "receipt" ? "Abriendo..." : "Comprobante"}
        </button>
      )}
      {expense.has_invoice && (
        <button
          onClick={() => viewDoc("invoice")}
          disabled={loadingDoc !== null}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-xs font-medium text-purple-300 hover:bg-purple-500/10 disabled:opacity-50"
        >
          {loadingDoc === "invoice" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ReceiptText className="h-3.5 w-3.5" />}
          {loadingDoc === "invoice" ? "Abriendo..." : "Factura"}
        </button>
      )}
    </div>
  )

  const actionsBlock = (
    <div className={`flex flex-col gap-2 ${isPage ? "sm:flex-row" : ""}`}>
      <Button
        onClick={() => onEdit(expense)}
        className={`gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 font-semibold text-white hover:from-blue-500 hover:to-blue-600 ${isPage ? "flex-1 py-4" : "w-full py-5"}`}
      >
        <Pencil className="h-4 w-4" /> Editar gasto
      </Button>
      <Button
        variant="ghost"
        onClick={() => onDelete(expense)}
        className={`gap-2 rounded-xl font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 ${isPage ? "flex-1 py-4" : "w-full py-4"}`}
      >
        <Trash2 className="h-4 w-4" /> Eliminar gasto
      </Button>
    </div>
  )

  const statementBlock = isStatement && (
    <div className={isPage ? "rounded-2xl border border-slate-700/50 bg-slate-900/40 p-4 sm:p-5" : "border-t border-slate-700/50 pt-4"}>
      <StatementItems expense={expense} onChanged={onRefresh} variant={isPage ? "full" : "compact"} />
    </div>
  )

  const body = isPage ? (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
      {isStatement ? (
        <div className="space-y-6 pb-24 md:pb-0">
          {/* Resumen arriba — en tablet/desktop va en fila compacta */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {summaryCard}
            {paymentBlock}
            {metaBlock}
            {docsBlock}
          </div>

          {/* Lista de consumos abajo, ancho completo */}
          <div className="min-w-0">{statementBlock}</div>

          <div className="hidden md:block">{actionsBlock}</div>
          <div className="sticky bottom-0 -mx-4 border-t border-slate-800/80 bg-slate-950/95 px-4 py-3 backdrop-blur-md md:hidden sm:-mx-6 sm:px-6">
            {actionsBlock}
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-lg space-y-4 pb-4">
          {summaryCard}
          {paymentBlock}
          {metaBlock}
          {docsBlock}
          {actionsBlock}
        </div>
      )}
    </div>
  ) : (
    <div className="min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
      {summaryCard}
      {paymentBlock}
      <div className="space-y-3 text-sm">{metaBlock}</div>
      {statementBlock}
      {docsBlock}
    </div>
  )

  return (
    <>
      {isPage ? (
        <div className="min-h-screen bg-slate-950 pb-6 sm:pb-8">
          <header className="sticky top-0 z-10 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
            <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                  aria-label="Volver"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              ) : (
                <Link
                  href="/"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                  aria-label="Volver al inicio"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-white">{expense.description}</p>
                <p className="text-xs text-slate-500">{categoryLabels[expense.category]}</p>
              </div>
            </div>
          </header>
          {body}
        </div>
      ) : (
        body
      )}

      {/* Visor de documento */}
      {doc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={closeDoc}
          role="presentation"
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">{doc.title}</h3>
            </div>
            <div className={doc.isPdf ? "overflow-hidden rounded-xl" : "max-h-[70vh] overflow-auto rounded-xl bg-slate-950/60 p-2"}>
              {doc.isPdf ? (
                <iframe src={doc.data} className="block h-[70vh] w-full border-0" title={doc.title} />
              ) : (
                <img src={doc.data} alt={doc.title} className="mx-auto h-auto max-w-full rounded-lg" />
              )}
            </div>
            <a
              href={doc.data}
              download={doc.name}
              className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700"
            >
              <Download className="h-4 w-4" /> Descargar
            </a>
          </div>
        </div>
      )}
    </>
  )
}

function QuickAmount({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-[11px] text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
    >
      {label}
    </button>
  )
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-slate-400">
        {icon} {label}
      </span>
      <span className="text-right font-medium text-slate-200">{value}</span>
    </div>
  )
}
