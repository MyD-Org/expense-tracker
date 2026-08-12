/** OCR gratuito en el navegador (Tesseract.js, español). */
export async function ocrImageFile(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const { createWorker } = await import("tesseract.js")
  const worker = await createWorker("spa", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        onProgress?.(Math.round(m.progress * 100))
      }
    },
  })
  try {
    const { data } = await worker.recognize(file)
    return (data.text || "").trim()
  } finally {
    await worker.terminate()
  }
}

export function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}

export function isImageFile(file: File) {
  return file.type.startsWith("image/")
}
