"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ExpenseDetailView } from "@/components/expense-detail-view"
import { ExpenseForm } from "@/components/expense-form"
import { LoadingScreen } from "@/components/loading-screen"
import { DeleteExpenseDialog } from "@/components/delete-expense-dialog"
import type { DeleteScope, Expense, ExpenseInput } from "@/lib/database"
import { useToast } from "@/hooks/use-toast"

export default function ExpenseDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { toast } = useToast()

  const [expense, setExpense] = useState<Expense | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/expenses/${params.id}`)
      if (res.status === 404) {
        setNotFound(true)
        setExpense(null)
        return
      }
      if (!res.ok) throw new Error()
      setExpense(await res.json())
      setNotFound(false)
    } catch {
      toast({ title: "Error", description: "No se pudo cargar el gasto.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [params.id, toast])

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (session?.user?.householdId) load()
    else if (session) setLoading(false)
  }, [session?.user?.householdId, session, load])

  const handleEdit = async (data: ExpenseInput) => {
    if (!expense) return
    try {
      const res = await fetch(`/api/expenses/${expense.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setExpense(updated)
      setIsEditOpen(false)
      toast({ title: "Gasto actualizado", description: "Los cambios se guardaron correctamente." })
    } catch {
      toast({ title: "Error", description: "No se pudo actualizar el gasto.", variant: "destructive" })
    }
  }

  const handleDelete = async (scope: DeleteScope) => {
    if (!expense || deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/expenses/${expense.id}?scope=${scope}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      const { deleted } = await res.json().catch(() => ({ deleted: 1 }))
      toast({ title: deleted > 1 ? `Se eliminaron ${deleted} meses` : "Gasto eliminado" })
      router.push("/")
    } catch {
      toast({ title: "Error", description: "No se pudo eliminar el gasto.", variant: "destructive" })
    } finally {
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  if (status === "loading" || loading) return <LoadingScreen />

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-center">
        <p className="text-slate-300">Este gasto no existe o ya fue eliminado.</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Volver al inicio
        </button>
      </div>
    )
  }

  if (!expense) return null

  return (
    <>
      <ExpenseDetailView
        expense={expense}
        variant="page"
        onBack={() => router.back()}
        onEdit={() => setIsEditOpen(true)}
        onDelete={() => setDeleteOpen(true)}
        onRefresh={load}
      />

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="!left-1/2 !top-1/2 !max-h-[90dvh] !w-[calc(100vw-2rem)] !max-w-lg !-translate-x-1/2 !-translate-y-1/2 overflow-y-auto border-slate-700 bg-slate-900 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-white">Editar gasto</DialogTitle>
          </DialogHeader>
          <ExpenseForm
            expense={expense}
            onSubmit={handleEdit}
            onCancel={() => setIsEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <DeleteExpenseDialog
        expense={expense}
        open={deleteOpen}
        deleting={deleting}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
      />
    </>
  )
}
