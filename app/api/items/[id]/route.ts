import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { deleteItem, updateItem } from "@/lib/expense-items"
import { initializeDatabase } from "@/lib/init-database"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!session.user.householdId) return NextResponse.json({ error: "Sin hogar configurado" }, { status: 403 })

  try {
    await initializeDatabase()
    const item = await updateItem(Number.parseInt(params.id), session.user.householdId, await request.json())
    if (!item) return NextResponse.json({ error: "El item no existe" }, { status: 404 })
    return NextResponse.json(item)
  } catch (error) {
    console.error("Error updating item:", error)
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!session.user.householdId) return NextResponse.json({ error: "Sin hogar configurado" }, { status: 403 })

  try {
    await initializeDatabase()
    // ?scope=future borra esta cuota y todas las que vienen después.
    const allFuture = new URL(request.url).searchParams.get("scope") === "future"
    const deleted = await deleteItem(Number.parseInt(params.id), session.user.householdId, allFuture)
    if (!deleted) return NextResponse.json({ error: "El item no existe" }, { status: 404 })
    return NextResponse.json({ success: true, deleted })
  } catch (error) {
    console.error("Error deleting item:", error)
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 })
  }
}
