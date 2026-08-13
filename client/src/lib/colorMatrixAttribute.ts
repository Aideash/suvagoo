import { formatNumericValue, parseNumericValue } from './attributeSchema'

export const COLOR_MATRIX_TYPES = [
  'matrix',
  'saturate',
  'hueRotate',
  'luminanceToAlpha',
] as const

export type ColorMatrixType = (typeof COLOR_MATRIX_TYPES)[number]

export const IDENTITY_COLOR_MATRIX: readonly number[] = [
  1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0,
] as const

export const COLOR_MATRIX_COLS = 5
export const COLOR_MATRIX_ROWS = 4
export const COLOR_MATRIX_LENGTH = COLOR_MATRIX_COLS * COLOR_MATRIX_ROWS

/** Column headers: R G B A bias(1). */
export const COLOR_MATRIX_COL_LABELS = ['R', 'G', 'B', 'A', '1'] as const
/** Row headers: output channels R' G' B' A'. */
export const COLOR_MATRIX_ROW_LABELS = ["R'", "G'", "B'", "A'"] as const

export const MATRIX_COEFF_RANGE = { min: -2, max: 2, step: 0.01 } as const
export const SATURATE_RANGE = { min: 0, max: 2, step: 0.01 } as const
export const HUE_ROTATE_RANGE = { min: -180, max: 180, step: 1 } as const

export function normalizeColorMatrixType(raw: string | undefined | null): ColorMatrixType {
  const t = (raw ?? 'matrix').trim().toLowerCase()
  if (t === 'saturate') return 'saturate'
  if (t === 'huerotate') return 'hueRotate'
  if (t === 'luminancetoalpha') return 'luminanceToAlpha'
  return 'matrix'
}

function parseNumberTokens(value: string): number[] | null {
  const tokens = value.trim().split(/[\s,]+/).filter(Boolean)
  if (!tokens.length) return null
  const numbers: number[] = []
  for (const token of tokens) {
    const parsed = parseNumericValue(token)
    if (!parsed || parsed.unit) return null
    if (!Number.isFinite(parsed.number)) return null
    numbers.push(parsed.number)
  }
  return numbers
}

/** Snap like eccentricity: divide by inverse quantum to avoid float print artifacts. */
export function snapMatrixCoeff(value: number, step: number): number {
  if (!Number.isFinite(value) || step <= 0) return 0
  const inverse = Math.round(1 / step)
  if (inverse <= 0) return value
  return Math.round(value * inverse) / inverse
}

export function formatColorMatrixNumbers(values: readonly number[]): string {
  const parts = values.map((n) => formatNumericValue(n, ''))
  // Group as 5-wide rows for matrix readability when length is 20.
  if (parts.length === COLOR_MATRIX_LENGTH) {
    const rows: string[] = []
    for (let r = 0; r < COLOR_MATRIX_ROWS; r++) {
      const start = r * COLOR_MATRIX_COLS
      rows.push(parts.slice(start, start + COLOR_MATRIX_COLS).join(' '))
    }
    return rows.join('  ')
  }
  return parts.join(' ')
}

export function parseColorMatrixValues(
  value: string,
  type: ColorMatrixType,
): number[] | null {
  if (type === 'luminanceToAlpha') {
    const trimmed = value.trim()
    if (!trimmed) return []
    // Non-empty values are ignored by the SVG type, but still try to parse for honesty.
    return parseNumberTokens(trimmed)
  }

  const numbers = parseNumberTokens(value)
  if (!numbers) return null

  if (type === 'matrix') {
    return numbers.length === COLOR_MATRIX_LENGTH ? numbers : null
  }

  // saturate / hueRotate expect a single number.
  return numbers.length === 1 ? numbers : null
}

export function defaultColorMatrixValues(type: ColorMatrixType): number[] {
  switch (type) {
    case 'saturate':
      return [1]
    case 'hueRotate':
      return [0]
    case 'luminanceToAlpha':
      return []
    case 'matrix':
    default:
      return [...IDENTITY_COLOR_MATRIX]
  }
}

export function expectedValueCount(type: ColorMatrixType): number | null {
  switch (type) {
    case 'matrix':
      return COLOR_MATRIX_LENGTH
    case 'saturate':
    case 'hueRotate':
      return 1
    case 'luminanceToAlpha':
      return null
  }
}

export type ColorMatrixField = {
  id: string
  label: string
  index: number
}

/** Flat field list for NumericGroupControl, row-major. */
export function colorMatrixFields(): ColorMatrixField[] {
  const fields: ColorMatrixField[] = []
  for (let r = 0; r < COLOR_MATRIX_ROWS; r++) {
    for (let c = 0; c < COLOR_MATRIX_COLS; c++) {
      const index = r * COLOR_MATRIX_COLS + c
      fields.push({
        id: `m${r}${c}`,
        label: `${COLOR_MATRIX_ROW_LABELS[r]}${COLOR_MATRIX_COL_LABELS[c]}`,
        index,
      })
    }
  }
  return fields
}
