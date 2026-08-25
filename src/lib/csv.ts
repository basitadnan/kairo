/** Minimal RFC-4180 CSV helpers used by Settings → export. */

function escapeCell(value: string | number | undefined): string {
  const s = value == null ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

export function toCsv(rows: (string | number | undefined)[][]): string {
  return rows.map((r) => r.map(escapeCell).join(',')).join('\r\n')
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
