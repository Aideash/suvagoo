export const PRESERVE_ASPECT_RATIO_ALIGNS = [
  'none',
  'xMinYMin',
  'xMidYMin',
  'xMaxYMin',
  'xMinYMid',
  'xMidYMid',
  'xMaxYMid',
  'xMinYMax',
  'xMidYMax',
  'xMaxYMax',
] as const

export type PreserveAspectRatioAlign = (typeof PRESERVE_ASPECT_RATIO_ALIGNS)[number]

export type MeetOrSlice = 'meet' | 'slice'

export interface PreserveAspectRatio {
  align: PreserveAspectRatioAlign
  /** Null when the meetOrSlice token was omitted (SVG default is meet). */
  meetOrSlice: MeetOrSlice | null
}

const ALIGN_SET = new Set<string>(PRESERVE_ASPECT_RATIO_ALIGNS)

export function parsePreserveAspectRatio(value: string): PreserveAspectRatio | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const tokens = trimmed.split(/\s+/).filter(Boolean)
  if (tokens.length === 0 || tokens.length > 2) return null

  const align = tokens[0]
  if (!ALIGN_SET.has(align)) return null

  if (align === 'none') {
    if (tokens.length > 1) return null
    return { align: 'none', meetOrSlice: null }
  }

  if (tokens.length === 1) {
    return { align: align as PreserveAspectRatioAlign, meetOrSlice: null }
  }

  const meetOrSlice = tokens[1]
  if (meetOrSlice !== 'meet' && meetOrSlice !== 'slice') return null
  return { align: align as PreserveAspectRatioAlign, meetOrSlice }
}

export function formatPreserveAspectRatio(value: PreserveAspectRatio): string {
  if (value.align === 'none') return 'none'
  if (value.meetOrSlice == null) return value.align
  return `${value.align} ${value.meetOrSlice}`
}
