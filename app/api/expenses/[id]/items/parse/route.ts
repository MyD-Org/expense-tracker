import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getExpenseById } from "@/lib/database"
import { parseStatementFromText, parseStatementPdf } from "@/lib/parse-statement-document"
import { initializeDatabase } from "@/lib/init-database"

export const runtime = "nodejs"

async function assertStatementExpense(id: string, householdId: number) {
  const expense = await getExpenseById(Number.parseInt(id), householdId)
  if (!expense) return { error: "El gasto no existe", status: 404 as const }
  if (!expense.card_id || !expense.billing_month) {
    return {
      error: "Este gasto no es un resumen de tarjeta. Asignale una tarjeta y un mes de resumen.",
      status: 400 as const,
    }
  }
  return { expense }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!session.user.householdId) return NextResponse.json({ error: "Sin hogar configurado" }, { status: 403 })

  try {
    await initializeDatabase()
    const check = await assertStatementExpense(params.id, session.user.householdId)
    if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status })

    const form = await request.formData()
    const file = form.get("file")
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Falta el archivo (campo 'file')" }, { status: 400 })
    }

    const mimeType = file.type || "application/octet-stream"
    if (mimeType !== "application/pdf") {
      return NextResponse.json(
        { error: "Para fotos usá JPG o PNG desde la galería." },
        { status: 400 },
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await parseStatementPdf(buffer)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error parsing statement:", error)
    return NextResponse.json({ error: error?.message || "No se pudo leer el resumen" }, { status: 400 })
  }
}
