import * as pdfjsLib from 'pdfjs-dist'
// Vite bundles the worker as its own asset; this keeps pdf.js off the main thread.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const MAX_DIM = 1600
const JPEG_QUALITY = 0.85
export const MAX_PAGES = 5

/** Draw any loaded image onto a capped canvas and return a JPEG data URL. */
function canvasToJpeg(source: CanvasImageSource, w: number, h: number): string {
  const scale = Math.min(1, MAX_DIM / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

async function fileToImageElement(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Could not read that image.'))
      img.src = url
    })
    return img
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
}

/** Any image file → normalized JPEG data URL ready for vision models. */
export async function imageFileToPage(file: File): Promise<string> {
  const img = await fileToImageElement(file)
  return canvasToJpeg(img, img.naturalWidth, img.naturalHeight)
}

/** PDF file → one JPEG data URL per page (up to MAX_PAGES). */
export async function pdfFileToPages(file: File): Promise<string[]> {
  const buf = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buf }).promise
  const pages: string[] = []
  const count = Math.min(doc.numPages, MAX_PAGES)
  for (let i = 1; i <= count; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    pages.push(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
  }
  return pages
}

/** Route any accepted file down the right pipeline. */
export async function fileToPages(file: File): Promise<string[]> {
  if (file.type === 'application/pdf') return pdfFileToPages(file)
  if (file.type.startsWith('image/')) return [await imageFileToPage(file)]
  throw new Error('Pick an image or a PDF.')
}

/**
 * Draws a realistic exam-schedule sheet on a canvas so the flow can be tried
 * without hunting for a file. With a real provider configured this genuinely parses.
 */
export function makeSampleExamSheet(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1000
  canvas.height = 700
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 1000, 700)

  ctx.fillStyle = '#1a1a1a'
  ctx.font = 'bold 34px Arial'
  ctx.fillText('SPRINGFIELD UNIVERSITY', 60, 80)
  ctx.font = '24px Arial'
  ctx.fillText('Final Examination Schedule - Spring 2026', 60, 120)

  ctx.font = '22px Arial'
  const rows: Array<[string, string, string, string]> = [
    ['Date', 'Time', 'Course', 'Room'],
    ['Mon 12 Oct', '09:00 AM', 'Marketing MKT201', 'Hall A'],
    ['Tue 13 Oct', '02:00 PM', 'Data Structures CS210', 'Hall B'],
    ['Thu 15 Oct', '09:00 AM', 'Physics PHY101', 'Hall A'],
    ['Fri 16 Oct', '11:30 AM', 'Financial Accounting ACC150', 'Hall C'],
  ]
  let y = 190
  for (const [c1, c2, c3, c4] of rows) {
    const bold = y === 190
    ctx.font = bold ? 'bold 22px Arial' : '22px Arial'
    ctx.fillText(c1, 70, y)
    ctx.fillText(c2, 300, y)
    ctx.fillText(c3, 450, y)
    ctx.fillText(c4, 800, y)
    y += bold ? 40 : 56
  }

  ctx.fillStyle = '#666666'
  ctx.font = '18px Arial'
  ctx.fillText('Report to your room 15 minutes before the start time.', 60, y + 10)
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}
