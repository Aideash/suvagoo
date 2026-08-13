import { formatNumericValue, parseNumericValue } from './attributeSchema'

export interface DashEntry {
  number: number
  unit: string
}

/** Units a dash length may carry; mirrors the CSS length units in attributeSchema. */
const ALLOWED_UNITS: ReadonlySet<string> = new Set([
  '',
  'px',
  '%',
  'em',
  'rem',
  'pt',
  'cm',
  'mm',
  'in',
])

/**
 * Parse an SVG `stroke-dasharray` value into dash/space entries.
 * Empty or `none` yields an empty list. Returns null if any token is invalid,
 * negative, or carries an unsupported unit.
 */
export function parseDashArray(value: string): DashEntry[] | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.toLowerCase() === 'none') return []

  const tokens = trimmed.split(/[\s,]+/).filter(Boolean)
  const entries: DashEntry[] = []
  for (const token of tokens) {
    const parsed = parseNumericValue(token)
    if (!parsed) return null
    if (!Number.isFinite(parsed.number) || parsed.number < 0) return null
    if (!ALLOWED_UNITS.has(parsed.unit)) return null
    entries.push({ number: parsed.number, unit: parsed.unit })
  }
  return entries
}

/** Serialize entries to a space-joined `stroke-dasharray` value; empty list -> ''. */
export function formatDashArray(entries: DashEntry[]): string {
  return entries.map((entry) => formatNumericValue(entry.number, entry.unit)).join(' ')
}

/** Display label for a single entry, e.g. `4`, `2px`, `10%`. */
export function formatDashEntry(entry: DashEntry): string {
  return formatNumericValue(entry.number, entry.unit)
}

export function updateEntry(
  entries: DashEntry[],
  index: number,
  patch: Partial<DashEntry>,
): DashEntry[] {
  if (index < 0 || index >= entries.length) return entries
  const next = [...entries]
  next[index] = { ...next[index], ...patch }
  return next
}

export function insertEntry(entries: DashEntry[], index: number, entry: DashEntry): DashEntry[] {
  const next = [...entries]
  const clamped = Math.max(0, Math.min(index, next.length))
  next.splice(clamped, 0, entry)
  return next
}

export function removeEntry(entries: DashEntry[], index: number): DashEntry[] {
  if (index < 0 || index >= entries.length) return entries
  return entries.filter((_, i) => i !== index)
}

export function moveEntry(entries: DashEntry[], from: number, to: number): DashEntry[] {
  if (from < 0 || from >= entries.length || to < 0 || to >= entries.length || from === to) {
    return entries
  }
  const next = [...entries]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Even indices paint the stroke (dash); odd indices are gaps (space). */
export function dashRole(index: number): 'dash' | 'space' {
  return index % 2 === 0 ? 'dash' : 'space'
}

/**
 * An odd-length list is repeated by SVG so each length acts as both a dash and
 * a gap — i.e. the dash/space roles reverse on each cycle.
 */
export function patternReverses(count: number): boolean {
  return count > 0 && count % 2 === 1
}
