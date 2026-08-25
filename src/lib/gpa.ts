import { getSetting, setSetting } from './db'
import type { Course } from './types'

/**
 * GPA tracker — percentage marks converted to grade points via an editable
 * band table. Bands live in settings as JSON so users can match their own
 * institution's scale; `computeGpa` is the only math the UI needs.
 */

export interface GradeBand {
  letter: string
  minPct: number // lowest percentage that earns this band
  points: number // grade points on a 4.0 scale
}

export const GPA_BANDS_KEY = 'gpa.bands'

export const DEFAULT_BANDS: GradeBand[] = [
  { letter: 'A+', minPct: 90, points: 4.0 },
  { letter: 'A', minPct: 85, points: 3.7 },
  { letter: 'A-', minPct: 80, points: 3.3 },
  { letter: 'B+', minPct: 75, points: 3.0 },
  { letter: 'B', minPct: 70, points: 2.7 },
  { letter: 'B-', minPct: 65, points: 2.3 },
  { letter: 'C+', minPct: 60, points: 2.0 },
  { letter: 'C', minPct: 55, points: 1.7 },
  { letter: 'C-', minPct: 50, points: 1.3 },
  { letter: 'D', minPct: 40, points: 1.0 },
  { letter: 'F', minPct: 0, points: 0 },
]

export async function loadBands(): Promise<GradeBand[]> {
  const raw = await getSetting(GPA_BANDS_KEY)
  if (!raw) return DEFAULT_BANDS
  try {
    const parsed = JSON.parse(raw) as GradeBand[]
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_BANDS
    return parsed.filter((b) => typeof b?.letter === 'string' && isFinite(b?.minPct) && isFinite(b?.points))
  } catch {
    return DEFAULT_BANDS
  }
}

export function saveBands(bands: GradeBand[]): Promise<void> {
  const clean = [...bands]
    .sort((a, b) => b.minPct - a.minPct)
    .map((b) => ({ letter: b.letter.trim() || '?', minPct: clampNum(b.minPct, 0, 100), points: clampNum(b.points, 0, 10) }))
  return setSetting(GPA_BANDS_KEY, JSON.stringify(clean))
}

/** Band for a mark; bands must be sorted descending by minPct. */
export function bandFor(pct: number, bands: GradeBand[]): GradeBand | undefined {
  return [...bands].sort((a, b) => b.minPct - a.minPct).find((b) => pct >= b.minPct)
}

export interface GpaResult {
  gpa: number | null
  gradedCount: number
  totalCredits: number
}

export function computeGpa(courses: Course[], bands: GradeBand[]): GpaResult {
  let pointsSum = 0
  let creditSum = 0
  let gradedCount = 0
  for (const c of courses) {
    if (c.deleted || c.markPct == null || !c.credits || c.credits <= 0) continue
    const band = bandFor(c.markPct, bands)
    if (!band) continue
    pointsSum += band.points * c.credits
    creditSum += c.credits
    gradedCount++
  }
  return { gpa: creditSum > 0 ? Math.round((pointsSum / creditSum) * 100) / 100 : null, gradedCount, totalCredits: creditSum }
}

function clampNum(v: number, lo: number, hi: number): number {
  if (!isFinite(v)) return lo
  return Math.min(hi, Math.max(lo, v))
}
