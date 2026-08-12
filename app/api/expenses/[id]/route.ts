import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getExpenseById, updateExpense, deleteExpense, type ExpenseInput } from "@/lib/database"
import { initializeDatabase } from "@/lib/init-database"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!session.user.householdId) return NextResponse.json({ error: "Sin hogar configurado" }, { status: 403 })

  try {
    await initializeDatabase()
    const expense = await getExpenseById(Number.parseInt(params.id), session.user.householdId)
    if (!expense) return NextResponse.json({ error: "El gasto no existe" }, { status: 404 })
    return NextResponse.json(expense)
  } catch (error) {
    console.error("Error fetching expense:", error)
    return NextResponse.json({ error: "Failed to fetch expense" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!session.user.householdId) return NextResponse.json({ error: "Sin hogar configurado" }, { status: 403 })

  try {
    await initializeDatabase()
    const expenseId = Number.parseInt(params.id)
    const expenseData: Partial<ExpenseInput> = await request.json()
    const updatedExpense = await updateExpense(expenseId, session.user.householdId, expenseData)
    return NextResponse.json(updatedExpense)
  } catch (error) {
    console.error("Error updating expense:", error)
    return NextResponse.json({ error: "Failed to update expense" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!session.user.householdId) return NextResponse.json({ error: "Sin hogar configurado" }, { status: 403 })

  try {
    await initializeDatabase()
    const expenseId = Number.parseInt(params.id)
    const deleted = await deleteExpense(expenseId, session.user.householdId)
    if (!deleted) {
      return NextResponse.json({ error: "El gasto no existe" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting expense:", error)
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 })
  }
}
