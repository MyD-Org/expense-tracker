import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions, verifyIngestToken } from "@/lib/auth"
import { getCards, createCard } from "@/lib/cards"
import { initializeDatabase } from "@/lib/init-database"

async function resolveHousehold(request: NextRequest) {
  const ingest = verifyIngestToken(request)
  if (ingest) return ingest
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.householdId) return null
  return { householdId: session.user.householdId, userId: session.user.id }
}

export async function GET(request: NextRequest) {
  const auth = await resolveHousehold(request)
  if (!auth) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  try {
    await initializeDatabase()
    return NextResponse.json(await getCards(auth.householdId))
  } catch (error) {
    console.error("Error fetching cards:", error)
    return NextResponse.json({ error: "Failed to fetch cards" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await resolveHousehold(request)
  if (!auth) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  try {
    await initializeDatabase()
    const body = await request.json()
    if (!body?.name?.trim()) {
      return NextResponse.json({ error: "Falta el nombre de la tarjeta" }, { status: 400 })
    }
    const card = await createCard(auth.householdId, {
      name: body.name.trim(),
      last4: body.last4,
      closing_day: body.closing_day,
      due_day: body.due_day,
      color: body.color,
    })
    return NextResponse.json(card, { status: 201 })
  } catch (error: any) {
    console.error("Error creating card:", error)
    return NextResponse.json({ error: "Failed to create card", details: error.message }, { status: 500 })
  }
}
