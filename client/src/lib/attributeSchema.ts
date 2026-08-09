import { parseViewBoxFromContent, type ViewBox } from './svgSchema'

export type AttributeKind =
  'color' | 'number' | 'length' | 'opacity' | 'percentage' | 'enum' | 'points' | 'text'

export interface AttributeSchema {
  kind: AttributeKind
  enumValues?: readonly string[]
  min?: number
  max?: number
  step?: number
}

const COLOR_ATTRS = new Set([
  'fill',
  'stroke',
  'stop-color',
  'color',
  'flood-color',
  'lighting-color',
])

const OPACITY_ATTRS = new Set([
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'stop-opacity',
  'flood-opacity',
])

const PERCENTAGE_ATTRS = new Set(['offset', 'startOffset'])

const LENGTH_ATTRS = new Set([
  'x',
  'y',
  'width',
  'height',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x1',
  'y1',
  'x2',
  'y2',
  'fx',
  'fy',
  'dx',
  'dy',
  'stroke-width',
  'font-size',
  'textLength',
  'pathLength',
  'rotate',
])

const ENUM_ATTRS: Record<string, readonly string[]> = {
  display: ['inline', 'none'],
  visibility: ['visible', 'hidden', 'collapse'],
  'pointer-events': [
    'bounding-box',
    'visiblePainted',
    'visibleFill',
    'visibleStroke',
    'visible',
    'painted',
    'fill',
    'stroke',
    'all',
    'none',
  ],
  'fill-rule': ['nonzero', 'evenodd'],
  'clip-rule': ['nonzero', 'evenodd'],
  'stroke-linecap': ['butt', 'round', 'square'],
  'stroke-linejoin': ['miter', 'round', 'bevel'],
  'text-anchor': ['start', 'middle', 'end'],
  'dominant-baseline': [
    'auto',
    'text-bottom',
    'alphabetic',
    'ideographic',
    'middle',
    'central',
    'mathematical',
    'hanging',
    'text-top',
  ],
  gradientUnits: ['objectBoundingBox', 'userSpaceOnUse'],
  spreadMethod: ['pad', 'reflect', 'repeat'],
  maskUnits: ['objectBoundingBox', 'userSpaceOnUse'],
  maskContentUnits: ['objectBoundingBox', 'userSpaceOnUse'],
  clipPathUnits: ['objectBoundingBox', 'userSpaceOnUse'],
  lengthAdjust: ['spacing', 'spacingAndGlyphs'],
  method: ['align', 'stretch'],
  spacing: ['auto', 'exact'],
}

export interface ParsedNumeric {
  number: number
  unit: string
}

export function parseNumericValue(value: string): ParsedNumeric | null {
  const trimmed = value.trim()
  const match = /^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)(.*)$/i.exec(trimmed)
  if (!match) return null
  const number = Number.parseFloat(match[1])
  if (!Number.isFinite(number)) return null
  return { number, unit: match[2] ?? '' }
}

export function formatNumericValue(number: number, unit: string): string {
  const rounded = Math.round(number * 1000) / 1000
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded)
  return `${text}${unit}`
}

export function getAttributeSchema(name: string): AttributeSchema {
  const normalized = name.toLowerCase()

  if (COLOR_ATTRS.has(normalized)) {
    return { kind: 'color' }
  }
  if (OPACITY_ATTRS.has(normalized)) {
    return { kind: 'opacity', min: 0, max: 1, step: 0.05 }
  }
  if (ENUM_ATTRS[normalized]) {
    return { kind: 'enum', enumValues: ENUM_ATTRS[normalized] }
  }
  if (PERCENTAGE_ATTRS.has(normalized)) {
    return { kind: 'percentage', min: 0, max: 100, step: 1 }
  }
  if (LENGTH_ATTRS.has(normalized)) {
    return { kind: 'length', step: 1 }
  }
  if (normalized === 'points') {
    return { kind: 'points' }
  }

  return { kind: 'text' }
}

export function numericRangeForAttribute(
  name: string,
  viewBox: ViewBox,
  currentValue: string,
): { min: number; max: number; step: number } {
  const schema = getAttributeSchema(name)
  const parsed = parseNumericValue(currentValue)
  const baseStep = schema.step ?? 1

  if (schema.kind === 'opacity') {
    return { min: 0, max: 1, step: baseStep }
  }

  if (schema.kind === 'percentage') {
    const unit = parsed?.unit ?? ''
    if (unit === '%' || !unit) {
      return { min: 0, max: 100, step: baseStep }
    }
  }

  const { width, height } = viewBox
  const span = Math.max(width, height, 1)

  switch (name) {
    case 'width':
    case 'rx':
      return { min: 0, max: width * 2, step: baseStep }
    case 'height':
    case 'ry':
      return { min: 0, max: height * 2, step: baseStep }
    case 'r':
      return { min: 0, max: Math.min(width, height) / 2, step: baseStep }
    case 'x':
    case 'x1':
    case 'x2':
    case 'cx':
    case 'fx':
      return { min: viewBox.minX - span, max: viewBox.minX + span * 2, step: baseStep }
    case 'y':
    case 'y1':
    case 'y2':
    case 'cy':
    case 'fy':
      return { min: viewBox.minY - span, max: viewBox.minY + span * 2, step: baseStep }
    case 'stroke-width':
    case 'font-size':
      return { min: 0, max: span / 2, step: 0.5 }
    case 'dx':
    case 'dy':
      return { min: -span, max: span, step: baseStep }
    default:
      if (parsed) {
        const magnitude = Math.max(Math.abs(parsed.number), 1)
        return {
          min: parsed.number - magnitude * 2,
          max: parsed.number + magnitude * 2,
          step: baseStep,
        }
      }
      return { min: 0, max: span, step: baseStep }
  }
}

export interface ParsedColor {
  r: number
  g: number
  b: number
  /** 0–1 */
  a: number
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function clampAlpha(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function byteToHex(n: number): string {
  return clampByte(n).toString(16).padStart(2, '0')
}

export function parseColor(value: string): ParsedColor | null {
  const trimmed = value.trim()

  const hex8 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(trimmed)
  if (hex8) {
    return {
      r: Number.parseInt(hex8[1], 16),
      g: Number.parseInt(hex8[2], 16),
      b: Number.parseInt(hex8[3], 16),
      a: Number.parseInt(hex8[4], 16) / 255,
    }
  }

  const hex6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(trimmed)
  if (hex6) {
    return {
      r: Number.parseInt(hex6[1], 16),
      g: Number.parseInt(hex6[2], 16),
      b: Number.parseInt(hex6[3], 16),
      a: 1,
    }
  }

  const hex3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed)
  if (hex3) {
    return {
      r: Number.parseInt(hex3[1] + hex3[1], 16),
      g: Number.parseInt(hex3[2] + hex3[2], 16),
      b: Number.parseInt(hex3[3] + hex3[3], 16),
      a: 1,
    }
  }

  const rgbaMatch =
    /^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)(?:\s*,\s*([\d.]+%?))?\s*\)$/i.exec(
      trimmed,
    )
  if (rgbaMatch) {
    const parseChannel = (raw: string, asAlpha = false) => {
      if (raw.endsWith('%')) {
        const pct = Number.parseFloat(raw) / 100
        return asAlpha ? clampAlpha(pct) : clampByte(pct * 255)
      }
      const num = Number.parseFloat(raw)
      if (!Number.isFinite(num)) return asAlpha ? 1 : 0
      return asAlpha ? clampAlpha(num) : clampByte(num)
    }
    return {
      r: parseChannel(rgbaMatch[1]),
      g: parseChannel(rgbaMatch[2]),
      b: parseChannel(rgbaMatch[3]),
      a: rgbaMatch[4] != null ? parseChannel(rgbaMatch[4], true) : 1,
    }
  }

  return resolveBrowserColor(trimmed)
}

const namedColorCache = new Map<string, ParsedColor | null>()

const NON_RESOLVABLE_COLORS = new Set(['none', 'currentcolor', 'inherit', 'initial', 'unset'])

/** Resolve named CSS colors, hsl(), etc. via the browser's parser. */
function resolveBrowserColor(value: string): ParsedColor | null {
  if (typeof document === 'undefined') return null

  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('url(')) return null

  const lower = trimmed.toLowerCase()
  if (NON_RESOLVABLE_COLORS.has(lower)) return null

  if (namedColorCache.has(lower)) {
    return namedColorCache.get(lower) ?? null
  }

  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    namedColorCache.set(lower, null)
    return null
  }

  const invalidProbe = 'rgba(0, 0, 0, 0)'
  ctx.fillStyle = invalidProbe
  ctx.fillStyle = trimmed
  if (ctx.fillStyle === invalidProbe) {
    namedColorCache.set(lower, null)
    return null
  }

  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  const parsed: ParsedColor = { r, g, b, a: a / 255 }
  namedColorCache.set(lower, parsed)
  return parsed
}

export function formatColor(color: ParsedColor): string {
  const { r, g, b, a } = color
  if (a >= 1) {
    return `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`
  }
  return `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}${byteToHex(a * 255)}`
}

export function parseColorToHex(value: string): string | null {
  const parsed = parseColor(value)
  if (!parsed) return null
  return `#${byteToHex(parsed.r)}${byteToHex(parsed.g)}${byteToHex(parsed.b)}`
}

export function parseColorAlpha(value: string): number {
  return parseColor(value)?.a ?? 1
}

export function viewBoxFromContent(content: string): ViewBox {
  return parseViewBoxFromContent(content)
}
