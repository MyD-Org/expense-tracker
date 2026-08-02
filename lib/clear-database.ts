import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function clearAllExpenses() {
  try {
    console.log("Clearing all expenses from database...")
    
    // Delete all expenses. neon() devuelve las filas del RETURNING, así que
    // la cantidad borrada sale de la longitud del array.
    const deleted = await sql`DELETE FROM expenses RETURNING id`

    console.log(`Deleted ${deleted.length} expenses from database`)
    return deleted.length
  } catch (error) {
    console.error("Error clearing database:", error)
    throw error
  }
}
