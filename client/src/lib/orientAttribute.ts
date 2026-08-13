export type OrientMode = 'auto' | 'auto-start-reverse' | 'angle'

export interface OrientValue {
  mode: OrientMode
  /** Present when mode is angle; degrees, unitless. */
  angle: number
}

const KEYWORDS = new Set(['auto', 'auto-start-reverse'])

export function parseOrient(value: string): OrientValue | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (KEYWORDS.has(trimmed)) {
    return { mode: trimmed as 'auto' | 'auto-start-reverse', angle: 0 }
  }

  // Unitless number, or a number with an angle unit we strip to degrees.
  const match = /^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)(deg|rad|grad)?$/i.exec(trimmed)
  if (!match) return null

  let angle = Number.parseFloat(match[1])
  if (!Number.isFinite(angle)) return null

  const unit = (match[2] ?? '').toLowerCase()
  if (unit === 'rad') angle = (angle * 180) / Math.PI
  else if (unit === 'grad') angle = (angle * 360) / 400

  return { mode: 'angle', angle }
}

export function formatOrient(value: OrientValue): string {
  if (value.mode === 'auto') return 'auto'
  if (value.mode === 'auto-start-reverse') return 'auto-start-reverse'

  const rounded = Math.round(value.angle * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}
