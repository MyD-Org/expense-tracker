"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import type { DeleteScope, Expense } from "@/lib/database"

interface DeleteExpenseDialogProps {
  expense: Expense | null
  open: boolean
  deleting?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (scope: DeleteScope) => void
}

/**
 * Confirmación de borrado. Para gastos fijos pregunta, como Google Calendar,
 * si borrar solo este mes o este y los siguientes.
 */
export function DeleteExpenseDialog({ expense, open, deleting, onOpenChange, onConfirm }: DeleteExpenseDialogProps) {
  const [scope, setScope] = useState<DeleteScope>("this")
  const isRecurring = expense?.category === "fijo"

  useEffect(() => {
    if (open) setScope("this")
  }, [open])

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-slate-700 bg-slate-900">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">
            {isRecurring ? "Eliminar gasto fijo" : "¿Eliminar gasto?"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-slate-300">
            {isRecurring
              ? `"${expense?.description}" se repite todos los meses. ¿Qué querés eliminar?`
              : `¿Estás segura de que querés eliminar "${expense?.description}"? Esta acción no se puede deshacer.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isRecurring && (
          <RadioGroup value={scope} onValueChange={(v) => setScope(v as DeleteScope)} className="gap-3 py-1">
            <div className="flex items-center gap-3">
              <RadioGroupItem value="this" id="delete-scope-this" className="border-slate-500 text-blue-400" />
              <Label htmlFor="delete-scope-this" className="text-slate-200">Solo este gasto</Label>
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="following" id="delete-scope-following" className="border-slate-500 text-blue-400" />
              <Label htmlFor="delete-scope-following" className="text-slate-200">Este y los siguientes</Label>
            </div>
          </RadioGroup>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel className="border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirm(isRecurring ? scope : "this")}
            disabled={deleting}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
