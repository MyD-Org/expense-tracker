"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CreditCard, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { Card } from "@/lib/cards"

type CardDraft = { name: string; last4: string }

const emptyDraft = (): CardDraft => ({ name: "", last4: "" })

function cardToDraft(card: Card): CardDraft {
  return {
    name: card.name,
    last4: card.last4 || "",
  }
}

function draftToPayload(draft: CardDraft) {
  return {
    name: draft.name.trim(),
    last4: draft.last4.trim() || null,
  }
}

const inputCls =
  "h-10 rounded-lg border-slate-700 bg-slate-800/60 text-sm text-white placeholder-slate-500 focus:border-amber-500"

interface CardSettingsProps {
  onChanged?: () => void
}

export function CardSettings({ onChanged }: CardSettingsProps) {
  const { toast } = useToast()
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<"list" | "edit" | "create">("list")
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<CardDraft>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<Card | null>(null)
  const [archiving, setArchiving] = useState(false)

  const loadCards = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/cards")
      if (res.ok) setCards(await res.json())
    } catch {
      toast({ title: "Error", description: "No se pudieron cargar las tarjetas.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadCards()
  }, [loadCards])

  const resetToList = () => {
    setMode("list")
    setEditingId(null)
    setDraft(emptyDraft())
  }

  const startCreate = () => {
    setDraft(emptyDraft())
    setEditingId(null)
    setMode("create")
  }

  const startEdit = (card: Card) => {
    setDraft(cardToDraft(card))
    setEditingId(card.id)
    setMode("edit")
  }

  const createCard = async () => {
    if (!draft.name.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(draft)),
      })
      if (!res.ok) throw new Error()
      const card: Card = await res.json()
      setCards((p) => [...p, card].sort((a, b) => a.name.localeCompare(b.name)))
      onChanged?.()
      toast({ title: "Tarjeta creada", description: card.name })
      resetToList()
    } catch {
      toast({ title: "Error", description: "No se pudo crear la tarjeta.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const saveCard = async () => {
    if (!editingId || !draft.name.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/cards/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToPayload(draft)),
      })
      if (!res.ok) throw new Error()
      const updated: Card = await res.json()
      setCards((p) => p.map((c) => (c.id === updated.id ? updated : c)))
      onChanged?.()
      toast({ title: "Tarjeta actualizada", description: updated.name })
      resetToList()
    } catch {
      toast({ title: "Error", description: "No se pudo guardar la tarjeta.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const confirmArchive = async () => {
    if (!archiveTarget || archiving) return
    setArchiving(true)
    try {
      const res = await fetch(`/api/cards/${archiveTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      })
      if (!res.ok) throw new Error()
      setCards((p) => p.filter((c) => c.id !== archiveTarget.id))
      onChanged?.()
      toast({ title: "Tarjeta archivada", description: archiveTarget.name })
      if (editingId === archiveTarget.id) resetToList()
      setArchiveTarget(null)
    } catch {
      toast({ title: "Error", description: "No se pudo archivar la tarjeta.", variant: "destructive" })
    } finally {
      setArchiving(false)
    }
  }

  const cardMeta = (card: Card) => (card.last4 ? `···· ${card.last4}` : "")

  const draftForm = (onSave: () => void, saveLabel: string) => (
    <div className="space-y-3 rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
      <div className="space-y-1.5">
        <Label className="text-xs text-slate-400">Nombre</Label>
        <Input
          value={draft.name}
          onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
          placeholder="Ej: Visa ICBC, Mastercard Galicia…"
          className={inputCls}
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-slate-400">Últimos 4 dígitos (opcional)</Label>
        <Input
          value={draft.last4}
          onChange={(e) => setDraft((p) => ({ ...p, last4: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
          placeholder="3631"
          className={`${inputCls} max-w-[8rem]`}
        />
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        El cierre y vencimiento cambian mes a mes según el banco. Esas fechas las cargás al crear
        cada resumen, no acá.
      </p>
      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={resetToList}
          disabled={saving}
          className="h-9 flex-1 rounded-lg border-slate-600 bg-transparent text-sm text-slate-300 hover:bg-slate-800"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={onSave}
          disabled={saving || !draft.name.trim()}
          className="h-9 flex-1 rounded-lg bg-amber-600 text-sm hover:bg-amber-500 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saveLabel}
        </Button>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (mode === "create") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-400">Nueva tarjeta</p>
        {draftForm(createCard, "Crear tarjeta")}
      </div>
    )
  }

  if (mode === "edit" && editingId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-400">Editar tarjeta</p>
        {draftForm(saveCard, "Guardar")}
        {cards.find((c) => c.id === editingId) && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setArchiveTarget(cards.find((c) => c.id === editingId)!)}
            className="h-9 w-full rounded-lg border-red-900/50 bg-transparent text-sm text-red-400 hover:bg-red-950/30"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Archivar tarjeta
          </Button>
        )}
        <AlertDialog open={!!archiveTarget} onOpenChange={(open) => { if (!open) setArchiveTarget(null) }}>
          <AlertDialogContent className="border-slate-700 bg-slate-900">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">¿Archivar tarjeta?</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-300">
                "{archiveTarget?.name}" dejará de aparecer al cargar resúmenes. Los gastos ya cargados no se borran.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmArchive}
                disabled={archiving}
                className="bg-red-600 hover:bg-red-700"
              >
                {archiving ? "Archivando…" : "Archivar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Solo el nombre de cada tarjeta. El vencimiento y el total los cargás mes a mes al crear el resumen.
      </p>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700/60 py-8 text-center">
          <CreditCard className="mx-auto mb-2 h-8 w-8 text-slate-600" />
          <p className="text-sm text-slate-400">Todavía no tenés tarjetas</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {cards.map((card) => (
            <li
              key={card.id}
              className="flex items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/40 px-3 py-2.5"
            >
              <CreditCard className="h-4 w-4 shrink-0 text-amber-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{card.name}</p>
                {cardMeta(card) && (
                  <p className="truncate text-xs text-slate-500">{cardMeta(card)}</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => startEdit(card)}
                className="h-8 shrink-0 gap-1.5 px-2 text-xs text-slate-400 hover:bg-slate-700 hover:text-white"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        onClick={startCreate}
        className="h-10 w-full gap-2 rounded-xl bg-amber-600 text-sm hover:bg-amber-500"
      >
        <Plus className="h-4 w-4" />
        Agregar tarjeta
      </Button>
    </div>
  )
}
