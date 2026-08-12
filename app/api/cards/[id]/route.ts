import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { updateCard } from "@/lib/cards"
import { initializeDatabase } from "@/lib/init-database"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!session.user.householdId) return NextResponse.json({ error: "Sin hogar configurado" }, { status: 403 })

  try {
    await initializeDatabase()
    const body = await request.json()
    const card = await updateCard(Number.parseInt(params.id), session.user.householdId, body)
    if (!card) return NextResponse.json({ error: "La tarjeta no existe" }, { status: 404 })
    return NextResponse.json(card)
  } catch (error) {
    console.error("Error updating card:", error)
    return NextResponse.json({ error: "Failed to update card" }, { status: 500 })
  }
}
