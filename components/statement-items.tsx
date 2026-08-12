"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Plus, Trash2, Layers, Upload, X, Check, Pencil } from "lucide-react"
import type { Expense } from "@/lib/database"
import type { ExpenseItem, ItemKind } from "@/lib/expense-items"
import type { ParsedStatementItem } from "@/lib/parse-statement-text"

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}

function isImageFile(file: File) {
  return file.type.startsWith("image/")
}

const KIND_META: Record<ItemKind, { label: string; dot: string; text: string }> = {
  fijo: { label: "Fijo", dot: "bg-blue-500", text: "text-blue-300" },
  variable: { label: "Variable", dot: "bg-purple-500", text: "text-purple-300" },
  suscripcion: { label: "Suscripción", dot: "bg-cyan-500", text: "text-cyan-300" },
  financiero: { label: "Financiero", dot: "bg-red-500", text: "text-red-300" },
}

interface Breakdown {
  byKind: Record<ItemKind, number>
  itemsTotal: number
  itemCount: number
  unclassified: number
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)

const OVERFLOW_THRESHOLD = 1

export function StatementItems({
  expense,
  onChanged,
  variant = "compact",
}: {
  expense: Expense
  onChanged?: () => void
  /** compact = modal · full = página de detalle con más espacio */
  variant?: "compact" | "full"
}) {
  const [items, setItems] = useState<ExpenseItem[]>([])
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  /** null = colapsado · add | edit = formulario · import = subir PDF */
  const [panel, setPanel] = useState<null | "add" | "edit" | "import">(null)
  const [editingItemId, setEditingItemId] = useState<number | null>(null)

  // Alta rápida
  const [desc, setDesc] = useState("")
  const [amount, setAmount] = useState("")
  const [kind, setKind] = useState<ItemKind>("variable")
  const [installments, setInstallments] = useState("1")
  const [amountIsTotal, setAmountIsTotal] = useState(false)
  const [tag, setTag] = useState("")
  const descRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Importación desde PDF / imagen
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState<ParsedStatementItem[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [parseHint, setParseHint] = useState<string | null>(null)
  const [ocrProgress, setOcrProgress] = useState<number | null>(null)

  // Etiquetas ya usadas en este resumen, para no reescribirlas ni que se
  // desdoblen en "Mascotas" y "mascotas".
  const knownTags = [...new Set(items.map((i) => i.tag).filter(Boolean) as string[])]

  const load = async () => {
    try {
      const res = await fetch(`/api/expenses/${expense.id}/items`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "No se pudo cargar el desglose")
        return
      }
      setError(null)
      setItems(data.items)
      setBreakdown(data.breakdown)
    } catch {
      setError("No se pudo cargar el desglose")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    load()
  }, [expense.id])

  const resetForm = () => {
    setDesc("")
    setAmount("")
    setKind("variable")
    setInstallments("1")
    setAmountIsTotal(false)
    setTag("")
    setEditingItemId(null)
  }

  const closePanel = () => {
    setPanel(null)
    resetForm()
  }

  const openAddForm = () => {
    if (deletingId != null) return
    resetForm()
    setPanel("add")
    setTimeout(() => descRef.current?.focus(), 50)
  }

  const openEditForm = (item: ExpenseItem) => {
    if (deletingId != null) return
    setEditingItemId(item.id)
    setDesc(item.description)
    setAmount(String(item.amount))
    setKind(item.kind)
    setTag(item.tag || "")
    setInstallments("1")
    setAmountIsTotal(false)
    setPanel("edit")
    setTimeout(() => descRef.current?.focus(), 50)
  }

  const submitForm = async () => {
    const value = Number.parseFloat(amount)
    if (!desc.trim() || Number.isNaN(value) || value <= 0 || saving) return
    setSaving(true)
    setError(null)
    try {
      if (panel === "edit" && editingItemId) {
        const res = await fetch(`/api/items/${editingItemId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: desc.trim(),
            amount: value,
            kind,
            tag: tag.trim() || null,
          }),
        })
        if (!res.ok) throw new Error()
        closePanel()
      } else {
        const total = Math.max(1, Number.parseInt(installments) || 1)
        const res = await fetch(`/api/expenses/${expense.id}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: desc.trim(),
            amount: value,
            kind,
            tag: tag.trim() || null,
            installment_total: total,
            amount_is_total: total > 1 ? amountIsTotal : false,
          }),
        })
        if (!res.ok) throw new Error()
        setDesc("")
        setAmount("")
        setInstallments("1")
        descRef.current?.focus()
      }
      await load()
      onChanged?.()
    } catch {
      setError(panel === "edit" ? "No se pudo guardar el item" : "No se pudo agregar el item")
    } finally {
      setSaving(false)
    }
  }

  const removeItem = async (item: ExpenseItem) => {
    if (deletingId != null) return
    setDeletingId(item.id)
    setError(null)
    try {
      const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      await load()
      onChanged?.()
    } catch {
      setError("No se pudo eliminar el item")
    } finally {
      setDeletingId(null)
    }
  }

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (file.size > 4 * 1024 * 1024) {
      setError("El archivo no puede superar 4 MB")
      return
    }

    setParsing(true)
    setError(null)
    setParseHint(null)
    setOcrProgress(null)

    try {
      let data: { items: ParsedStatementItem[]; statement_total?: number | null }

      if (isPdfFile(file)) {
        const form = new FormData()
        form.append("file", file)
        const res = await fetch(`/api/expenses/${expense.id}/items/parse`, { method: "POST", body: form })
        data = await res.json()
        if (!res.ok) throw new Error(data.error || "No se pudo leer el PDF")
      } else if (isImageFile(file)) {
        setParseHint("Leyendo foto…")
        const { ocrImageFile } = await import("@/lib/statement-ocr")
        const text = await ocrImageFile(file, setOcrProgress)
        setOcrProgress(null)
        const res = await fetch(`/api/expenses/${expense.id}/items/parse-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        })
        data = await res.json()
        if (!res.ok) throw new Error(data.error || "No se pudo leer la foto")
      } else {
        throw new Error("Formato no soportado. Usá PDF o imagen (JPG, PNG).")
      }

      if (!data.items?.length) {
        setParseHint("No encontramos consumos. Probá otra página, una foto más nítida, o cargá a mano.")
        setPreview(null)
        return
      }

      setPreview(data.items)
      setSelected(new Set(data.items.map((_, i) => i)))
      setPanel("import")
      if (data.statement_total) {
        setParseHint(`Detectamos ${data.items.length} consumos. Total del resumen: ${fmt(data.statement_total)}`)
      } else {
        setParseHint(`Detectamos ${data.items.length} consumos. Revisá antes de importar.`)
      }
    } catch (err: any) {
      setError(err.message || "No se pudo leer el resumen")
    } finally {
      setParsing(false)
      setOcrProgress(null)
    }
  }

  const cancelPreview = () => {
    setPreview(null)
    setSelected(new Set())
    setParseHint(null)
    setPanel(null)
  }

  const toggleSelected = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const importSelected = async () => {
    if (!preview?.length || importing) return
    const toImport = preview.filter((_, i) => selected.has(i))
    if (!toImport.length) return

    setImporting(true)
    setError(null)
    try {
      const res = await fetch(`/api/expenses/${expense.id}/items/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: toImport }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "No se pudo importar")
      }
      cancelPreview()
      await load()
      onChanged?.()
    } catch (err: any) {
      setError(err.message || "No se pudo importar")
    } finally {
      setImporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (error && !breakdown) {
    return (
      <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-4 text-center text-sm text-slate-400">
        {error}
      </div>
    )
  }

  const total = Number(expense.amount) || 0
  const segments = breakdown
    ? ([
        ...(Object.entries(breakdown.byKind) as [ItemKind, number][])
          .filter(([, v]) => v > 0)
          .map(([k, v]) => ({ key: k, label: KIND_META[k].label, value: v, color: KIND_META[k].dot })),
        ...(breakdown.unclassified > 0
          ? [{ key: "sin", label: "Sin clasificar", value: breakdown.unclassified, color: "bg-slate-600" }]
          : []),
      ] as const)
    : []

  const selectedImportTotal = preview
    ? preview.reduce((s, item, i) => (selected.has(i) ? s + item.amount : s), 0)
    : 0
  const previewImportTotal = preview?.reduce((s, item) => s + item.amount, 0) ?? 0
  const itemsTotalNow = breakdown?.itemsTotal ?? 0
  const unclassifiedAfterImport = total - itemsTotalNow - selectedImportTotal

  return (
    <div className="min-w-0 space-y-3 overflow-hidden">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Layers className="h-4 w-4 text-amber-400" />
          Desglose del resumen
        </h4>
        <span className="text-xs text-slate-500">
          {breakdown?.itemCount || 0} {breakdown?.itemCount === 1 ? "item" : "items"}
        </span>
      </div>

      {/* Barra apilada: en qué se va el total del resumen */}
      {total > 0 && (
        <div className="space-y-2">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-800">
            {segments.map((s) => (
              <div key={s.key} className={s.color} style={{ width: `${Math.max(0, (s.value / total) * 100)}%` }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {segments.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className={`h-2 w-2 rounded-full ${s.color}`} />
                {s.label} {fmt(s.value)}
              </span>
            ))}
          </div>
          {breakdown && breakdown.unclassified < -OVERFLOW_THRESHOLD && (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300">
              Los items suman {fmt(breakdown.itemsTotal)}, más que el total del resumen ({fmt(total)}). Revisá si cargaste
              algo de más o si el total quedó desactualizado.
            </p>
          )}
        </div>
      )}

      {/* Lista de items */}
      <div
        className={
          variant === "full"
            ? "space-y-1.5"
            : "max-h-36 space-y-1.5 overflow-y-auto overscroll-contain sm:max-h-44"
        }
      >
        {variant === "full" && items.length > 0 && (
          <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_6rem_5.5rem_6rem_4.5rem] md:gap-3 md:px-3 md:pb-1 md:text-[10px] md:font-medium md:uppercase md:tracking-wide md:text-slate-500">
            <span>Descripción</span>
            <span className="text-center">Etiqueta</span>
            <span className="text-center">Tipo</span>
            <span className="text-right">Monto</span>
            <span className="sr-only">Acciones</span>
          </div>
        )}

        {items.map((item) => {
          const isDeleting = deletingId === item.id
          const isActiveInForm = editingItemId === item.id && panel === "edit"
          const isDesktopRow = variant === "full"
          return (
            <div key={item.id} className="space-y-1.5">
              <div
                className={`group rounded-xl border transition-opacity ${
                  isDeleting
                    ? "border-red-500/30 bg-red-950/20 opacity-60"
                    : isActiveInForm
                      ? "border-blue-500/40 bg-blue-950/20"
                      : "border-slate-700/40 bg-slate-800/40"
                } flex items-center gap-2 px-2.5 py-2 sm:gap-2.5 sm:px-3 sm:py-2.5 ${
                  isDesktopRow ? "md:grid md:grid-cols-[minmax(0,1fr)_6rem_5.5rem_6rem_4.5rem] md:items-center md:gap-3" : ""
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2 md:col-span-1">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${KIND_META[item.kind].dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm text-slate-200 ${isDesktopRow ? "md:break-words" : "truncate"}`}>
                        {item.description}
                      </p>
                      {item.tag && (
                        <span className="shrink-0 rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-300 md:hidden">
                          {item.tag}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-slate-500 md:hidden">
                      {isDeleting ? "Eliminando…" : KIND_META[item.kind].label}
                      {!isDeleting && (item.installment_total || 0) > 1 && ` · cuota ${item.installment_current}/${item.installment_total}`}
                    </p>
                  </div>
                </div>

                <span className="hidden truncate text-center text-xs text-slate-400 md:block">
                  {item.tag || "—"}
                </span>
                <span className="hidden text-center text-xs text-slate-400 md:block">
                  {KIND_META[item.kind].label}
                  {(item.installment_total || 0) > 1 && (
                    <span className="block text-[10px] text-slate-500">
                      cuota {item.installment_current}/{item.installment_total}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-semibold text-slate-100 md:text-right">{fmt(Number(item.amount))}</span>

                <div className="flex shrink-0 items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => (isActiveInForm ? closePanel() : openEditForm(item))}
                    disabled={deletingId != null}
                    className={`shrink-0 transition-colors disabled:opacity-40 ${
                      isActiveInForm ? "text-blue-400" : "text-slate-600 hover:text-blue-400"
                    }`}
                    title={isActiveInForm ? "Cancelar edición" : "Editar"}
                  >
                    {isActiveInForm ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item)}
                    disabled={deletingId != null}
                    className="shrink-0 text-slate-600 transition-colors hover:text-red-400 disabled:pointer-events-none disabled:opacity-40"
                    title="Eliminar item"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-red-400" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {isActiveInForm && (
                <ItemFormPanel
                  mode="edit"
                  desc={desc}
                  setDesc={setDesc}
                  amount={amount}
                  setAmount={setAmount}
                  kind={kind}
                  setKind={setKind}
                  tag={tag}
                  setTag={setTag}
                  installments={installments}
                  setInstallments={setInstallments}
                  amountIsTotal={amountIsTotal}
                  setAmountIsTotal={setAmountIsTotal}
                  knownTags={knownTags}
                  editingItem={item}
                  saving={saving}
                  descRef={descRef}
                  onSubmit={submitForm}
                  onClose={closePanel}
                />
              )}
            </div>
          )
        })}

        {breakdown && breakdown.unclassified > 0 && (
          <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-slate-700/50 px-3 py-2.5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-slate-600" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-slate-400">Sin clasificar</p>
              <p className="text-[11px] text-slate-600">Impuestos, sellados y lo que falte cargar</p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-slate-400">{fmt(breakdown.unclassified)}</span>
          </div>
        )}
      </div>

      {/* Acciones colapsadas */}
      {!preview && panel == null && (
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={openAddForm}
            className="h-9 flex-1 gap-1.5 rounded-xl bg-blue-600 text-sm hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Agregar consumo
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPanel("import")}
            className="h-9 flex-1 gap-1.5 rounded-xl border-amber-500/40 bg-amber-500/10 text-sm text-amber-300 hover:bg-amber-500/20"
          >
            <Upload className="h-4 w-4" />
            Importar PDF
          </Button>
        </div>
      )}

      {/* Importar desde PDF / foto */}
      {!preview && panel === "import" && (
        <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-950/10 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-amber-300">Importar resumen</p>
            <button type="button" onClick={closePanel} className="text-slate-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFilePick}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 py-2.5 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
          >
            {parsing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {ocrProgress != null ? `Leyendo foto… ${ocrProgress}%` : "Leyendo resumen…"}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Elegir PDF o foto
              </>
            )}
          </button>
          {parseHint && (
            <p className="mt-2 text-center text-[11px] text-amber-300">{parseHint}</p>
          )}
        </div>
      )}

      {preview ? (
        <div
          className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-blue-500/30 bg-blue-950/20 ${
            variant === "full" ? "max-h-[min(70dvh,32rem)]" : "max-h-[min(50dvh,20rem)]"
          }`}
        >
          <div className="shrink-0 space-y-1 border-b border-blue-500/20 p-3 pb-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-blue-200">{preview.length} consumos detectados</p>
              <button
                type="button"
                onClick={cancelPreview}
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                title="Cancelar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {parseHint && <p className="text-[11px] leading-snug text-slate-400">{parseHint}</p>}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pt-1">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Total a importar</p>
                <p className="text-lg font-bold text-white">{fmt(selectedImportTotal)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500">
                  Detectado: {fmt(previewImportTotal)} · {selected.size}/{preview.length} sel.
                </p>
                {total > 0 && (
                  <p className="text-[10px] text-slate-500">
                    Resumen {fmt(total)} · Sin clasificar {fmt(Math.max(0, unclassifiedAfterImport))}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2 pt-1">
            {preview.map((item, idx) => (
              <label
                key={idx}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors ${
                  selected.has(idx)
                    ? "border-blue-500/40 bg-slate-800/60"
                    : "border-slate-700/40 bg-slate-900/40 opacity-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(idx)}
                  onChange={() => toggleSelected(idx)}
                  className="mt-0.5 shrink-0 rounded border-slate-600"
                />
                <span className="min-w-0 flex-1 break-words text-slate-200">{item.description}</span>
                <span className="shrink-0 whitespace-nowrap text-xs font-medium text-slate-300 sm:text-sm">
                  {fmt(item.amount)}
                </span>
              </label>
            ))}
          </div>
          <div className="flex shrink-0 gap-2 border-t border-blue-500/20 p-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={cancelPreview}
              className="h-9 min-w-0 flex-1 rounded-lg border-slate-600 bg-transparent text-sm text-slate-300"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={importSelected}
              disabled={importing || selected.size === 0}
              className="h-9 min-w-0 flex-1 gap-1 rounded-lg bg-blue-600 text-sm hover:bg-blue-500 disabled:opacity-40"
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="h-4 w-4 shrink-0" />
                  <span className="truncate">Importar {selected.size}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Formulario de alta — abajo de la lista */}
      {!preview && panel === "add" && (
        <ItemFormPanel
          mode="add"
          desc={desc}
          setDesc={setDesc}
          amount={amount}
          setAmount={setAmount}
          kind={kind}
          setKind={setKind}
          tag={tag}
          setTag={setTag}
          installments={installments}
          setInstallments={setInstallments}
          amountIsTotal={amountIsTotal}
          setAmountIsTotal={setAmountIsTotal}
          knownTags={knownTags}
          saving={saving}
          descRef={descRef}
          onSubmit={submitForm}
          onClose={closePanel}
        />
      )}

      {error && <p className="break-words text-center text-xs text-red-400">{error}</p>}
    </div>
  )
}

function ItemFormPanel({
  mode,
  desc,
  setDesc,
  amount,
  setAmount,
  kind,
  setKind,
  tag,
  setTag,
  installments,
  setInstallments,
  amountIsTotal,
  setAmountIsTotal,
  knownTags,
  editingItem,
  saving,
  descRef,
  onSubmit,
  onClose,
}: {
  mode: "add" | "edit"
  desc: string
  setDesc: (v: string) => void
  amount: string
  setAmount: (v: string) => void
  kind: ItemKind
  setKind: (v: ItemKind) => void
  tag: string
  setTag: (v: string) => void
  installments: string
  setInstallments: (v: string) => void
  amountIsTotal: boolean
  setAmountIsTotal: (v: boolean) => void
  knownTags: string[]
  editingItem?: ExpenseItem
  saving: boolean
  descRef: RefObject<HTMLInputElement | null>
  onSubmit: () => void
  onClose: () => void
}) {
  return (
    <div
      className={`space-y-2 rounded-xl border p-2.5 ${
        mode === "edit"
          ? "border-blue-500/30 bg-blue-950/15"
          : "border-slate-700/40 bg-slate-900/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2 pb-1">
        <p className="text-xs font-medium text-slate-300">
          {mode === "edit" ? "Editar consumo" : "Nuevo consumo"}
        </p>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          ref={descRef}
          placeholder="Descripción"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          className="h-9 min-w-0 flex-1 rounded-lg border-slate-700 bg-slate-900/60 text-sm text-white placeholder-slate-600"
        />
        <Input
          placeholder="Monto"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          className="h-9 w-full rounded-lg border-slate-700 bg-slate-900/60 text-sm text-white placeholder-slate-600 sm:w-28 sm:shrink-0"
        />
      </div>

      <div className="space-y-1.5">
        <Input
          placeholder="Etiqueta (Comida, Mascotas, Regalos...)"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          list="item-tags"
          className="h-9 w-full rounded-lg border-slate-700 bg-slate-900/60 text-sm text-white placeholder-slate-600"
        />
        <datalist id="item-tags">
          {knownTags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        {knownTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {knownTags.slice(0, 6).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTag(t)}
                className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                  tag === t ? "bg-blue-500/20 text-blue-300" : "bg-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={kind} onValueChange={(v) => setKind(v as ItemKind)}>
          <SelectTrigger className="h-9 w-full min-w-0 rounded-lg border-slate-700 bg-slate-900/60 text-sm text-white sm:flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-slate-600 bg-slate-800" position="popper" sideOffset={4}>
            {(Object.keys(KIND_META) as ItemKind[]).map((k) => (
              <SelectItem key={k} value={k} className="text-white hover:bg-slate-700">
                {KIND_META[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mode === "add" ? (
          <Select value={installments} onValueChange={setInstallments}>
            <SelectTrigger className="h-9 w-full min-w-0 rounded-lg border-slate-700 bg-slate-900/60 text-sm text-white sm:w-24 sm:shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-56 border-slate-600 bg-slate-800" position="popper" sideOffset={4}>
              <SelectItem value="1" className="text-white hover:bg-slate-700">1 pago</SelectItem>
              {[2, 3, 6, 9, 12, 18, 24].map((n) => (
                <SelectItem key={n} value={String(n)} className="text-white hover:bg-slate-700">
                  {n} cuotas
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex h-9 items-center rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 text-xs text-slate-500 sm:w-24 sm:shrink-0">
            {(editingItem?.installment_total || 0) > 1
              ? `Cuota ${editingItem?.installment_current}/${editingItem?.installment_total}`
              : "1 pago"}
          </div>
        )}
        <Button
          type="button"
          onClick={onSubmit}
          disabled={saving || !desc.trim() || !amount}
          className="h-9 w-full shrink-0 rounded-lg bg-blue-600 px-4 text-sm hover:bg-blue-500 disabled:opacity-40 sm:w-auto"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : mode === "edit" ? (
            "Guardar"
          ) : (
            <>
              <Plus className="h-4 w-4 sm:mr-0" />
              <span className="sm:hidden">Agregar</span>
            </>
          )}
        </Button>
      </div>

      {mode === "add" && Number.parseInt(installments) > 1 && (
        <>
          <div className="flex gap-1 rounded-lg bg-slate-800/60 p-1 text-[11px]">
            <button
              type="button"
              onClick={() => setAmountIsTotal(false)}
              className={`flex-1 rounded px-2 py-1 transition-colors ${
                !amountIsTotal ? "bg-slate-700 text-white" : "text-slate-400"
              }`}
            >
              El monto es por cuota
            </button>
            <button
              type="button"
              onClick={() => setAmountIsTotal(true)}
              className={`flex-1 rounded px-2 py-1 transition-colors ${
                amountIsTotal ? "bg-slate-700 text-white" : "text-slate-400"
              }`}
            >
              Es el total de la compra
            </button>
          </div>
          <p className="px-1 text-[11px] text-slate-500">
            Se cargan {installments} cuotas, una en cada resumen a partir de este.
          </p>
        </>
      )}
    </div>
  )
}
