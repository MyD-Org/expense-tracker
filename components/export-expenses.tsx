"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, Copy, Download, FileJson, FileSpreadsheet, Share2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import type { Expense } from "@/lib/database"
import type { ExpenseItem } from "@/lib/expense-items"
import {
  buildFileName,
  buildPrompt,
  describePeriod,
  toCSV,
  toJSON,
  type ExportFilters,
} from "@/lib/export-expenses"

type Format = "json" | "csv"

interface ExportExpensesProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expenses: Expense[]
  filters: ExportFilters
}

// Clipboard API no está disponible fuera de https (ni en algunos WebViews);
// caemos a un textarea temporal + execCommand.
async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {}
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function ExportExpenses({ open, onOpenChange, expenses, filters }: ExportExpensesProps) {
  const [format, setFormat] = useState<Format>("json")
  const [copied, setCopied] = useState<"data" | "prompt" | null>(null)
  const { toast } = useToast()

  // El desglose de los resúmenes de tarjeta vive en otra tabla; lo traemos al
  // abrir el diálogo para que el JSON salga completo. Suelen ser 1 o 2 resúmenes
  // por período, así que son pocos pedidos.
  const [itemsByExpense, setItemsByExpense] = useState<Record<number, ExpenseItem[]>>({})

  useEffect(() => {
    if (!open) return
    const statements = expenses.filter((e) => e.category === "tarjeta" && e.card_id && (e.item_count || 0) > 0)
    if (!statements.length) {
      setItemsByExpense({})
      return
    }
    let cancelled = false
    Promise.all(
      statements.map((e) =>
        fetch(`/api/expenses/${e.id}/items`)
          .then((r) => (r.ok ? r.json() : { items: [] }))
          .then((d) => [e.id, d.items as ExpenseItem[]] as const)
          .catch(() => [e.id, [] as ExpenseItem[]] as const),
      ),
    ).then((entries) => {
      if (!cancelled) setItemsByExpense(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [open, expenses])

  const content = useMemo(
    () => (format === "json" ? toJSON(expenses, filters, itemsByExpense) : toCSV(expenses)),
    [format, expenses, filters, itemsByExpense],
  )
  const fileName = buildFileName(filters, format)
  const prompt = buildPrompt(filters)

  const total = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(amount)

  const flashCopied = (what: "data" | "prompt") => {
    setCopied(what)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleCopy = async () => {
    if (await copyText(content)) {
      flashCopied("data")
      toast({ title: "Copiado", description: `${expenses.length} gastos en ${format.toUpperCase()}. Pegalo en el chat con tu agente.` })
    } else {
      toast({ title: "No se pudo copiar", description: "Probá con Descargar.", variant: "destructive" })
    }
  }

  const handleCopyPrompt = async () => {
    if (await copyText(prompt)) {
      flashCopied("prompt")
      toast({ title: "Prompt copiado", description: "Pegalo antes del export." })
    } else {
      toast({ title: "No se pudo copiar", description: "Seleccioná el texto a mano.", variant: "destructive" })
    }
  }

  const handleDownload = () => {
    // El BOM hace que Excel abra el CSV con acentos correctos.
    const blob = new Blob([format === "csv" ? "﻿" + content : content], {
      type: format === "json" ? "application/json;charset=utf-8" : "text/csv;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast({ title: "Descargado", description: fileName })
  }

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function"

  const handleShare = async () => {
    const file = new File([content], fileName, {
      type: format === "json" ? "application/json" : "text/csv",
    })
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName })
      } else {
        await navigator.share({ title: fileName, text: content })
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        toast({ title: "No se pudo compartir", description: "Probá con Copiar o Descargar.", variant: "destructive" })
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[calc(100vw-2rem)] !max-w-lg !left-1/2 !top-1/2 !-translate-x-1/2 !-translate-y-1/2 max-h-[88vh] overflow-y-auto border-slate-700 bg-slate-900 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-white card-title">Exportar gastos</DialogTitle>
          <p className="text-sm text-slate-400">
            {describePeriod(filters)} · {expenses.length} {expenses.length === 1 ? "gasto" : "gastos"} ·{" "}
            <span className="font-semibold text-slate-200">{formatCurrency(total)}</span>
          </p>
        </DialogHeader>

        {/* min-w-0: sin esto la vista previa (líneas largas) estira el diálogo
            más allá del ancho de la pantalla en el celular. */}
        <div className="min-w-0 space-y-4">
          {/* Formato */}
          <div className="grid grid-cols-2 gap-2">
            <FormatOption
              active={format === "json"}
              onClick={() => setFormat("json")}
              icon={<FileJson className="h-4 w-4" />}
              title="JSON"
              hint="Para el agente de IA"
            />
            <FormatOption
              active={format === "csv"}
              onClick={() => setFormat("csv")}
              icon={<FileSpreadsheet className="h-4 w-4" />}
              title="CSV"
              hint="Para planilla de cálculo"
            />
          </div>

          {format === "json" && (
            <p className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-slate-400">
              El JSON incluye los totales por categoría y por mes, y una descripción del esquema para que el agente
              interprete los datos sin contexto extra.
            </p>
          )}

          {/* Vista previa */}
          <pre className="max-h-48 w-full min-w-0 overflow-auto rounded-xl border border-slate-700/60 bg-slate-950/70 p-3 text-[11px] leading-relaxed text-slate-300">
            {content.slice(0, 2000)}
            {content.length > 2000 ? "\n…" : ""}
          </pre>

          {/* Acciones */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              onClick={handleCopy}
              disabled={expenses.length === 0}
              className="gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 font-semibold text-white hover:from-blue-500 hover:to-blue-600"
            >
              {copied === "data" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied === "data" ? "Copiado" : "Copiar"}
            </Button>
            <Button
              onClick={handleDownload}
              disabled={expenses.length === 0}
              variant="outline"
              className="gap-2 rounded-xl border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <Download className="h-4 w-4" />
              Descargar
            </Button>
            {canShare && (
              <Button
                onClick={handleShare}
                disabled={expenses.length === 0}
                variant="outline"
                className="gap-2 rounded-xl border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white sm:col-span-2"
              >
                <Share2 className="h-4 w-4" />
                Compartir
              </Button>
            )}
          </div>

          {/* Prompt sugerido */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
                  <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                  Prompt sugerido
                </p>
                <p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-slate-400">
                  {prompt}
                </p>
              </div>
              <Button
                onClick={handleCopyPrompt}
                size="sm"
                variant="ghost"
                className="shrink-0 gap-1.5 text-blue-400 hover:bg-slate-700 hover:text-blue-300"
              >
                {copied === "prompt" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                Copiar
              </Button>
            </div>
          </div>

          {expenses.length === 0 && (
            <p className="text-center text-sm text-slate-500">No hay gastos con los filtros actuales.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FormatOption({
  active,
  onClick,
  icon,
  title,
  hint,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  hint: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
        active
          ? "border-blue-500/60 bg-blue-500/10 text-white"
          : "border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800/70"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </span>
      <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>
    </button>
  )
}
