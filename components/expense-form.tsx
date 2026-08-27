"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Home, CreditCard, TrendingDown, Repeat, Paperclip, FileText, X, Loader2, ChevronDown } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { Expense, ExpenseInput } from "@/lib/database"
import type { Card } from "@/lib/cards"

const MAX_RECEIPT_MB = 4

interface ExpenseFormProps {
  expense?: Expense
  onSubmit: (expense: ExpenseInput) => void | Promise<void>
  onCancel: () => void
  onManageCards?: () => void
  cardsRefreshKey?: number
}

const categories = [
  { value: "fijo", label: "Fijo", icon: Home, accent: "blue" },
  { value: "tarjeta", label: "Tarjeta", icon: CreditCard, accent: "amber" },
  { value: "variable", label: "Variable", icon: TrendingDown, accent: "purple" },
] as const

export function ExpenseForm({ expense, onSubmit, onCancel, onManageCards, cardsRefreshKey = 0 }: ExpenseFormProps) {
  const { toast } = useToast()
  const [formData, setFormData] = useState({
    description: expense?.description || "",
    amount: expense?.amount?.toString() || "",
    category: expense?.category || ("fijo" as const),
    // Por defecto "pagado": lo habitual es cargar el gasto una vez ya abonado.
    // Al editar se respeta el estado que ya tenía.
    status: expense?.status || ("pagado" as const),
    due_date: expense?.due_date ? expense.due_date.split("T")[0] : new Date().toLocaleDateString("en-CA"),
    notes: expense?.notes || "",
    propagation_months: "12" as string,
    payment_code: expense?.payment_code || "",
  })

  // Tarjeta: un gasto "tarjeta" es el resumen de una tarjeta en un mes.
  // Ese par (tarjeta, mes) es lo que engancha el resumen con sus items.
  const [cards, setCards] = useState<Card[]>([])
  const [cardId, setCardId] = useState<string>(expense?.card_id ? String(expense.card_id) : "")
  const [billingMonth, setBillingMonth] = useState<string>(
    expense?.billing_month ? expense.billing_month.slice(0, 7) : "",
  )
  const [minimumDue, setMinimumDue] = useState<string>(
    expense?.minimum_due != null ? String(expense.minimum_due) : "",
  )

  useEffect(() => {
    if (formData.category !== "tarjeta") return
    fetch("/api/cards")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCards)
      .catch(() => {})
  }, [formData.category, cardsRefreshKey])

  // El mes de resumen por defecto es el del vencimiento cargado.
  useEffect(() => {
    if (formData.category === "tarjeta" && !billingMonth && formData.due_date) {
      setBillingMonth(formData.due_date.slice(0, 7))
    }
  }, [formData.category, formData.due_date])

  // Adjuntos: comprobante de pago y factura
  const [receipt, setReceipt] = useState<{ data: string | null; name: string | null }>({ data: null, name: null })
  const [invoice, setInvoice] = useState<{ data: string | null; name: string | null }>({ data: null, name: null })
  const [submitting, setSubmitting] = useState(false)
  // Sección secundaria colapsada: mantiene el form corto en el celu. Se abre
  // sola al editar un gasto que ya tiene notas / código / adjuntos cargados.
  const [showDetails, setShowDetails] = useState(
    !!(expense && (expense.notes || expense.payment_code || expense.has_receipt || expense.has_invoice)),
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.description || !formData.amount || !formData.due_date) return
    if (submitting) return

    const expenseData: ExpenseInput = {
      description: formData.description,
      amount: Number.parseFloat(formData.amount),
      category: formData.category,
      status: formData.status,
      due_date: formData.due_date,
      notes: formData.notes || undefined,
      payment_code: formData.payment_code || undefined,
    }

    if (formData.category === "tarjeta") {
      if (cardId) expenseData.card_id = Number.parseInt(cardId)
      // El mes se guarda como el día 1: es la clave que une resumen e items.
      if (billingMonth) expenseData.billing_month = `${billingMonth}-01`
      if (minimumDue) expenseData.minimum_due = Number.parseFloat(minimumDue)
    }

    // Solo enviar adjuntos si se eligió uno nuevo
    if (receipt.data) {
      expenseData.receipt_data = receipt.data
      expenseData.receipt_name = receipt.name
    }
    if (invoice.data) {
      expenseData.invoice_data = invoice.data
      expenseData.invoice_name = invoice.name
    }

    if (!expense && formData.category === "fijo") {
      expenseData.propagation_months =
        formData.propagation_months === "indefinido"
          ? "indefinido"
          : formData.propagation_months
            ? Number.parseInt(formData.propagation_months)
            : 12
    }

    try {
      setSubmitting(true)
      await onSubmit(expenseData)
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls =
    "h-11 rounded-xl border-slate-700 bg-slate-800/60 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-blue-500/20"

  return (
    <form onSubmit={handleSubmit} className="no-scrollbar max-h-[65vh] space-y-5 overflow-y-auto overflow-x-hidden pr-1">
      {/* Descripción */}
      <div className="space-y-1.5">
        <Label htmlFor="description" className="text-sm text-slate-300">Descripción</Label>
        <Input
          id="description"
          value={formData.description}
          onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
          placeholder="Ej: ICBC, Luz, Cochera..."
          className={inputCls}
          required
          autoFocus
        />
      </div>

      {/* Monto */}
      <div className="space-y-1.5">
        <Label htmlFor="amount" className="text-sm text-slate-300">Monto</Label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">$</span>
          <Input
            id="amount"
            type="number"
            step="0.01"
            value={formData.amount}
            onChange={(e) => setFormData((p) => ({ ...p, amount: e.target.value }))}
            placeholder="0"
            className={`${inputCls} pl-8 text-lg font-semibold`}
            required
          />
        </div>
      </div>

      {/* Categoría — selector visual */}
      <div className="space-y-1.5">
        <Label className="text-sm text-slate-300">Categoría</Label>
        <div className="grid grid-cols-3 gap-2">
          {categories.map(({ value, label, icon: Icon }) => {
            const active = formData.category === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setFormData((p) => ({ ...p, category: value }))}
                className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 transition-all ${
                  active
                    ? "border-blue-500 bg-blue-500/15 text-blue-300"
                    : "border-slate-700 bg-slate-800/40 text-slate-400 hover:bg-slate-800/70"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tarjeta y mes de resumen (solo category='tarjeta') */}
      {formData.category === "tarjeta" && (
        <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-950/10 p-4">
          <div className="flex items-center gap-2 text-slate-300">
            <CreditCard className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium">Resumen de tarjeta</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-slate-400">Tarjeta</Label>
                {onManageCards && (
                  <button
                    type="button"
                    onClick={onManageCards}
                    className="text-[11px] text-amber-400 hover:text-amber-300"
                  >
                    Gestionar →
                  </button>
                )}
              </div>
              <Select value={cardId} onValueChange={setCardId}>
                <SelectTrigger className={`${inputCls} w-full`}>
                  <SelectValue placeholder={cards.length ? "Elegir" : "Sin tarjetas"} />
                </SelectTrigger>
                <SelectContent className="border-slate-600 bg-slate-800">
                  {cards.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)} className="text-white hover:bg-slate-700">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cards.length === 0 && onManageCards && (
                <p className="text-[11px] text-slate-500">
                  Primero cargá tus tarjetas en{" "}
                  <button type="button" onClick={onManageCards} className="text-amber-400 hover:text-amber-300">
                    Mis tarjetas
                  </button>
                  .
                </p>
              )}
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="billingMonth" className="text-xs text-slate-400">Mes del resumen</Label>
              <Input
                id="billingMonth"
                type="month"
                value={billingMonth}
                onChange={(e) => setBillingMonth(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="minimumDue" className="text-xs text-slate-400">Pago mínimo (opcional)</Label>
            <Input
              id="minimumDue"
              type="number"
              step="0.01"
              value={minimumDue}
              onChange={(e) => setMinimumDue(e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </div>

          <p className="text-xs text-slate-500">
            El monto de arriba es el <strong className="text-slate-400">total a pagar</strong> del resumen. El desglose
            item por item se carga desde el detalle, una vez guardado.
          </p>
        </div>
      )}

      {/* Propagación (solo gasto fijo nuevo) */}
      {formData.category === "fijo" && !expense && (
        <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-800/40 p-4">
          <div className="flex items-center gap-2 text-slate-300">
            <Repeat className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-medium">Repetir mensualmente</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="1"
              max="60"
              value={formData.propagation_months === "indefinido" ? "" : formData.propagation_months}
              onChange={(e) => setFormData((p) => ({ ...p, propagation_months: e.target.value }))}
              placeholder="12"
              className="h-10 w-20 rounded-lg border-slate-600 bg-slate-700/60 text-center text-white"
            />
            <span className="text-sm text-slate-400">meses</span>
            <button
              type="button"
              onClick={() =>
                setFormData((p) => ({ ...p, propagation_months: p.propagation_months === "indefinido" ? "12" : "indefinido" }))
              }
              className={`ml-auto rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                formData.propagation_months === "indefinido"
                  ? "bg-blue-500/20 text-blue-300"
                  : "bg-slate-700/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              Indefinido
            </button>
          </div>
          <p className="text-xs text-slate-500">Se crea una copia de este gasto cada mes.</p>
        </div>
      )}

      {/* Estado + Fecha en fila */}
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 space-y-1.5">
          <Label className="text-sm text-slate-300">Estado</Label>
          <Select value={formData.status} onValueChange={(v: any) => setFormData((p) => ({ ...p, status: v }))}>
            <SelectTrigger className={`${inputCls} w-full`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-slate-600 bg-slate-800">
              <SelectItem value="pendiente" className="text-white hover:bg-slate-700">Pendiente</SelectItem>
              <SelectItem value="pagado" className="text-white hover:bg-slate-700">Pagado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="dueDate" className="text-sm text-slate-300">
            {formData.category === "tarjeta" ? "Vencimiento del resumen" : "Vencimiento"}
          </Label>
          <Input
            id="dueDate"
            type="date"
            value={formData.due_date}
            onChange={(e) => setFormData((p) => ({ ...p, due_date: e.target.value }))}
            className={`${inputCls} w-full min-w-0 block`}
            required
          />
        </div>
      </div>

      {/* Más detalles — colapsable. Notas, código y adjuntos son secundarios:
          se ocultan por defecto para que el form entre sin scrollear tanto. */}
      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/70"
      >
        <span className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-400" />
          Más detalles <span className="text-slate-500">(notas, código, adjuntos)</span>
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${showDetails ? "rotate-180" : ""}`} />
      </button>

      {showDetails && (
        <>
          {/* Notas */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-sm text-slate-300">Notas <span className="text-slate-500">(opcional)</span></Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Notas adicionales..."
              rows={2}
              className="rounded-xl border-slate-700 bg-slate-800/60 text-white placeholder-slate-500 focus:border-blue-500"
            />
          </div>

          {/* Código de pago */}
          <div className="space-y-1.5">
            <Label htmlFor="payment_code" className="text-sm text-slate-300">Código de pago <span className="text-slate-500">(opcional)</span></Label>
            <Input
              id="payment_code"
              value={formData.payment_code}
              onChange={(e) => setFormData((p) => ({ ...p, payment_code: e.target.value }))}
              placeholder="CBU, Alias, QR..."
              className={inputCls}
            />
          </div>

          {/* Adjuntos */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AttachmentField
              label="Comprobante de pago"
              value={receipt}
              onChange={setReceipt}
              hasExisting={!!expense?.has_receipt}
              onTooBig={() => toast({ title: "Archivo muy grande", description: `No puede superar ${MAX_RECEIPT_MB} MB.`, variant: "destructive" })}
            />
            <AttachmentField
              label="Factura"
              value={invoice}
              onChange={setInvoice}
              hasExisting={!!expense?.has_invoice}
              onTooBig={() => toast({ title: "Archivo muy grande", description: `No puede superar ${MAX_RECEIPT_MB} MB.`, variant: "destructive" })}
            />
          </div>
        </>
      )}

      {/* Botones */}
      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 py-5 font-semibold text-white shadow-lg transition-all hover:from-blue-500 hover:to-blue-600 active:scale-[0.98] disabled:from-slate-600 disabled:to-slate-600 disabled:opacity-70 disabled:active:scale-100"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {expense ? "Guardando..." : "Creando..."}
            </span>
          ) : (
            expense ? "Guardar cambios" : "Crear gasto"
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-xl border-slate-700 bg-slate-800/60 px-6 py-5 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50"
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}

type AttachmentValue = { data: string | null; name: string | null }

function AttachmentField({
  label,
  value,
  onChange,
  hasExisting,
  onTooBig,
}: {
  label: string
  value: AttachmentValue
  onChange: (v: AttachmentValue) => void
  hasExisting: boolean
  onTooBig: () => void
}) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_RECEIPT_MB * 1024 * 1024) {
      onTooBig()
      e.target.value = ""
      return
    }
    const reader = new FileReader()
    reader.onload = () => onChange({ data: reader.result as string, name: file.name })
    reader.readAsDataURL(file)
  }

  const showFile = value.name || hasExisting

  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-slate-300">{label} <span className="text-slate-500">(opcional)</span></Label>
      {showFile ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5">
          <FileText className="h-4 w-4 shrink-0 text-blue-400" />
          <span className="flex-1 truncate text-sm text-slate-200">
            {value.name || "Archivo guardado"}
            {!value.data && hasExisting && <span className="ml-1 text-xs text-slate-500">(guardado)</span>}
          </span>
          {value.data ? (
            <button type="button" onClick={() => onChange({ data: null, name: null })} className="shrink-0 text-slate-400 transition-colors hover:text-red-400" title="Quitar">
              <X className="h-4 w-4" />
            </button>
          ) : (
            <label className="shrink-0 cursor-pointer text-blue-400 transition-colors hover:text-blue-300" title="Reemplazar">
              <Paperclip className="h-4 w-4" />
              <input type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" />
            </label>
          )}
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-800/40 px-3 py-3 text-sm text-slate-400 transition-colors hover:border-blue-500 hover:text-slate-200">
          <Paperclip className="h-4 w-4" />
          Subir foto o PDF
          <input type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" />
        </label>
      )}
    </div>
  )
}
