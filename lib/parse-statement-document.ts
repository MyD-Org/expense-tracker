import { createRequire } from "module"
import { parseStatementText, type ParsedStatementItem, type ParsedStatementResult } from "@/lib/parse-statement-text"

export type { ParsedStatementItem, ParsedStatementResult }

const MAX_BYTES = 4 * 1024 * 1024
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])

// pdf-parse v1 es CJS; createRequire evita que webpack lo empaquete mal.
const require = createRequire(import.meta.url)
const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text?: string }>

async function extractPdfText(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer)
  return (result.text || "").trim()
}

/** PDF digital → texto → parser local (gratis, sin IA). */
export async function parseStatementPdf(buffer: Buffer): Promise<ParsedStatementResult> {
  if (buffer.length > MAX_BYTES) {
    throw new Error(`El archivo supera ${MAX_BYTES / 1024 / 1024} MB`)
  }
  let text: string
  try {
    text = await extractPdfText(buffer)
  } catch (err: any) {
    console.error("PDF extract error:", err)
    throw new Error("No se pudo abrir el PDF. Probá con una foto del resumen.")
  }
  if (text.length < 40) {
    throw new Error(
      "No se pudo leer texto del PDF (puede ser escaneado). Subí una foto del resumen en su lugar.",
    )
  }
  const result = parseStatementText(text)
  if (!result.items.length) {
    throw new Error(
      "No encontramos consumos en el PDF. Probá con una foto del resumen o cargá los items a mano.",
    )
  }
  return result
}

/** Texto ya extraído (OCR en el navegador o PDF). */
export function parseStatementFromText(text: string): ParsedStatementResult {
  const result = parseStatementText(text)
  if (!result.items.length) {
    throw new Error("No encontramos consumos en el texto. Probá con otra foto más nítida.")
  }
  return result
}

export function isImageMime(mimeType: string) {
  return IMAGE_TYPES.has(mimeType)
}
