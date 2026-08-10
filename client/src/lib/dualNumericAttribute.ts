import { formatNumericValue, parseNumericValue } from './attributeSchema'

export interface DualNumeric {
  primary: number
  /** When null, the attribute is a single number (isotropic / uniform). */
  secondary: number | null
}

export function parseDualNumeric(value: string): DualNumeric | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const tokens = trimmed.split(/[\s,]+/).filter(Boolean)
  if (!tokens.length) return null

  const numbers: number[] = []
  for (const token of tokens) {
    const parsed = parseNumericValue(token)
    if (!parsed || parsed.unit) return null
    if (!Number.isFinite(parsed.number)) return null
    numbers.push(parsed.number)
  }

  if (numbers.length === 1) {
    return { primary: numbers[0], secondary: null }
  }

  return { primary: numbers[0], secondary: numbers[1] }
}

export function formatDualNumeric(value: DualNumeric): string {
  if (value.secondary == null) {
    return formatNumericValue(value.primary, '')
  }
  return `${formatNumericValue(value.primary, '')} ${formatNumericValue(value.secondary, '')}`
}

export function isDualNumericValue(value: string): boolean {
  const parsed = parseDualNumeric(value)
  return parsed?.secondary != null
}
