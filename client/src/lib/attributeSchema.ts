import { COLOR_MATRIX_TYPES } from './colorMatrixAttribute'
import { getElementSchema, isAnimationTag, normalizeTagName, type ViewBox } from './svgSchema'

export type AttributeKind =
  | 'color'
  | 'number'
  | 'length'
  | 'opacity'
  | 'percentage'
  | 'enum'
  | 'points'
  | 'path'
  | 'dual-number'
  | 'viewBox'
  | 'color-matrix-values'
  | 'transform'
  | 'filter'
  | 'filter-input'
  | 'preserveAspectRatio'
  | 'orient'
  | 'stroke-dasharray'
  | 'duration'
  | 'repeat-count'
  | 'attribute-name'
  | 'text'

export interface DualNumberLabels {
  primary: string
  secondary: string
}

export interface AttributeSchema {
  kind: AttributeKind
  enumValues?: readonly string[]
  min?: number
  max?: number
  step?: number
  dualNumber?: DualNumberLabels
  /** Units the value may carry; '' is the unitless (user space) option. */
  units?: readonly string[]
  /** Lower bound the value cannot be dragged or typed below. */
  fixedMin?: number
}

const UNITLESS: readonly string[] = ['']

const CSS_LENGTH_UNITS: readonly string[] = ['', 'px', '%', 'em', 'rem', 'pt', 'cm', 'mm', 'in']

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
  'z',
  'pointsatx',
  'pointsaty',
  'pointsatz',
  'radius',
  'targetx',
  'targety',
  'limitingconeangle',
  'markerwidth',
  'markerheight',
  'refx',
  'refy',
])

/** Subset of LENGTH_ATTRS that accepts a CSS unit; the rest are user-space numbers. */
const CSS_LENGTH_ATTRS = new Set([
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
  'textlength',
  'markerwidth',
  'markerheight',
  'refx',
  'refy',
])

const DUAL_NUMBER_ATTRS = new Set(['stddeviation', 'basefrequency'])

const DUAL_NUMBER_LABELS: Record<string, DualNumberLabels> = {
  stddeviation: { primary: 'X', secondary: 'Y' },
  basefrequency: { primary: 'X', secondary: 'Y' },
}

const NUMBER_ATTRS = new Set([
  'seed',
  'numoctaves',
  'scale',
  'surfacescale',
  'diffuseconstant',
  'specularconstant',
  'specularexponent',
  'elevation',
  'azimuth',
  'k1',
  'k2',
  'k3',
  'k4',
  'bias',
  'divisor',
  'amplitude',
  'exponent',
  'slope',
  'intercept',
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
  filterUnits: ['objectBoundingBox', 'userSpaceOnUse'],
  primitiveUnits: ['objectBoundingBox', 'userSpaceOnUse'],
  markerUnits: ['strokeWidth', 'userSpaceOnUse'],
  patternUnits: ['objectBoundingBox', 'userSpaceOnUse'],
  patternContentUnits: ['objectBoundingBox', 'userSpaceOnUse'],
  overflow: ['visible', 'hidden', 'scroll', 'auto'],
  mode: [
    'normal',
    'multiply',
    'screen',
    'overlay',
    'darken',
    'lighten',
    'color-dodge',
    'color-burn',
    'hard-light',
    'soft-light',
    'difference',
    'exclusion',
    'hue',
    'saturation',
    'color',
    'luminosity',
  ],
  edgeMode: ['duplicate', 'wrap', 'none'],
  stitchTiles: ['stitch', 'noStitch'],
  xChannelSelector: ['R', 'G', 'B', 'A'],
  yChannelSelector: ['R', 'G', 'B', 'A'],
  lengthAdjust: ['spacing', 'spacingAndGlyphs'],
  method: ['align', 'stretch'],
  spacing: ['auto', 'exact'],
}

const TIME_UNITS: readonly string[] = ['s', 'ms']

/** Clock-valued attributes on the SMIL elements. */
const ANIMATION_TIME_ATTRS = new Set(['dur', 'begin', 'end', 'repeatdur'])

/**
 * Enumerations that only apply to animation elements. `fill` is here because it
 * names the post-run behaviour rather than a paint.
 */
const ANIMATION_ENUMS: Record<string, readonly string[]> = {
  fill: ['freeze', 'remove'],
  calcMode: ['discrete', 'linear', 'paced', 'spline'],
  restart: ['always', 'whenNotActive', 'never'],
  additive: ['replace', 'sum'],
  accumulate: ['none', 'sum'],
}

const TRANSFORM_ANIMATION_TYPES: readonly string[] = [
  'translate',
  'scale',
  'rotate',
  'skewX',
  'skewY',
]

export const REPEAT_COUNT_RANGE = { min: 0, max: 20, step: 1 }

/** Slider bounds for a clock value, sized to the unit it is written in. */
export function durationRangeForUnit(unit: string): { min: number; max: number; step: number } {
  if (unit === 'ms') return { min: 0, max: 5000, step: 50 }
  return { min: 0, max: 10, step: 0.1 }
}

function animationSchemaFor(name: string, tag: string): AttributeSchema | null {
  const normalized = name.toLowerCase()

  if (normalized === 'attributename') return { kind: 'attribute-name' }
  if (normalized === 'repeatcount') return { kind: 'repeat-count' }
  if (ANIMATION_TIME_ATTRS.has(normalized)) {
    return { kind: 'duration', units: TIME_UNITS, step: 0.1, fixedMin: 0 }
  }
  if (normalized === 'type' && tag === 'animatetransform') {
    return { kind: 'enum', enumValues: TRANSFORM_ANIMATION_TYPES }
  }
  if (normalized === 'path' && tag === 'animatemotion') {
    return { kind: 'path' }
  }

  const enumKey = Object.keys(ANIMATION_ENUMS).find(
    (candidate) => candidate.toLowerCase() === normalized,
  )
  if (enumKey) return { kind: 'enum', enumValues: ANIMATION_ENUMS[enumKey] }

  return null
}

const TURBULENCE_TYPES: readonly string[] = ['fractalNoise', 'turbulence']

const TRANSFER_FUNCTION_TYPES: readonly string[] = [
  'identity',
  'table',
  'discrete',
  'linear',
  'gamma',
]

const FE_FUNC_TAGS = new Set(['fefuncr', 'fefuncg', 'fefuncb', 'fefunca'])

const COMPOSITE_OPERATORS: readonly string[] = [
  'over',
  'in',
  'out',
  'atop',
  'xor',
  'lighter',
  'arithmetic',
]

const MORPHOLOGY_OPERATORS: readonly string[] = ['erode', 'dilate']

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

function enumSchemaFor(name: string): AttributeSchema | null {
  const normalized = name.toLowerCase()
  const key = Object.keys(ENUM_ATTRS).find((candidate) => candidate.toLowerCase() === normalized)
  if (!key) return null
  return { kind: 'enum', enumValues: ENUM_ATTRS[key] }
}

export function getAttributeSchema(name: string, tagName?: string): AttributeSchema {
  const normalized = name.toLowerCase()
  const tag = tagName ? normalizeTagName(tagName) : ''

  // Resolved first: several names carry a different meaning on a timing element
  // than they do on the shape being animated.
  if (tag && isAnimationTag(tag)) {
    const animation = animationSchemaFor(name, tag)
    if (animation) return animation
  }

  if (
    (normalized === 'in' || normalized === 'in2') &&
    getElementSchema(tag)?.attributes.some((attribute) => attribute.toLowerCase() === normalized)
  ) {
    return { kind: 'filter-input' }
  }

  if (normalized === 'type') {
    if (tag === 'fecolormatrix') {
      return { kind: 'enum', enumValues: COLOR_MATRIX_TYPES }
    }
    if (tag === 'feturbulence') {
      return { kind: 'enum', enumValues: TURBULENCE_TYPES }
    }
    if (FE_FUNC_TAGS.has(tag)) {
      return { kind: 'enum', enumValues: TRANSFER_FUNCTION_TYPES }
    }
  }

  if (normalized === 'operator') {
    if (tag === 'fecomposite') {
      return { kind: 'enum', enumValues: COMPOSITE_OPERATORS }
    }
    if (tag === 'femorphology') {
      return { kind: 'enum', enumValues: MORPHOLOGY_OPERATORS }
    }
  }

  if (COLOR_ATTRS.has(normalized)) {
    return { kind: 'color' }
  }
  if (OPACITY_ATTRS.has(normalized)) {
    return { kind: 'opacity', min: 0, max: 1, step: 0.05 }
  }
  const enumSchema = enumSchemaFor(name)
  if (enumSchema) {
    return enumSchema
  }
  if (PERCENTAGE_ATTRS.has(normalized)) {
    return { kind: 'percentage', min: 0, max: 100, step: 1 }
  }
  if (LENGTH_ATTRS.has(normalized)) {
    return {
      kind: 'length',
      step: 1,
      units: CSS_LENGTH_ATTRS.has(normalized) ? CSS_LENGTH_UNITS : UNITLESS,
    }
  }
  if (NUMBER_ATTRS.has(normalized)) {
    return { kind: 'number', step: 1, units: UNITLESS }
  }
  if (DUAL_NUMBER_ATTRS.has(normalized)) {
    return {
      kind: 'dual-number',
      min: 0,
      step: normalized === 'basefrequency' ? 0.01 : 0.5,
      dualNumber: DUAL_NUMBER_LABELS[normalized],
    }
  }
  if (normalized === 'points') {
    return { kind: 'points' }
  }
  if (normalized === 'd') {
    return { kind: 'path' }
  }
  if (normalized === 'viewbox') {
    return { kind: 'viewBox' }
  }
  if (normalized === 'values' && tag === 'fecolormatrix') {
    return { kind: 'color-matrix-values' }
  }
  if (
    normalized === 'transform' ||
    normalized === 'gradienttransform' ||
    normalized === 'patterntransform'
  ) {
    return { kind: 'transform' }
  }
  if (normalized === 'filter') {
    return { kind: 'filter' }
  }
  if (normalized === 'preserveaspectratio') {
    return { kind: 'preserveAspectRatio' }
  }
  if (normalized === 'orient') {
    return { kind: 'orient' }
  }
  if (normalized === 'stroke-dasharray') {
    return { kind: 'stroke-dasharray', units: CSS_LENGTH_UNITS }
  }

  return { kind: 'text' }
}

export function unitsForAttribute(name: string, tagName?: string): readonly string[] {
  return getAttributeSchema(name, tagName).units ?? UNITLESS
}

/**
 * Coordinate spaces can be far smaller than a document viewport — a marker
 * without a viewBox spans three units, `objectBoundingBox` content spans one —
 * so a whole-number step would leave the slider unusable there.
 */
export function stepForSpan(step: number, span: number): number {
  if (span >= 20) return step
  if (span >= 2) return Math.min(step, 0.1)
  return Math.min(step, 0.01)
}

export function numericRangeForAttribute(
  name: string,
  viewBox: ViewBox,
  currentValue: string,
): { min: number; max: number; step: number } {
  const schema = getAttributeSchema(name)
  const parsed = parseNumericValue(currentValue)
  const declaredStep = schema.step ?? 1

  if (schema.kind === 'opacity') {
    return { min: 0, max: 1, step: declaredStep }
  }

  if (schema.kind === 'percentage') {
    const unit = parsed?.unit ?? ''
    if (unit === '%' || !unit) {
      return { min: 0, max: 100, step: declaredStep }
    }
  }

  if (parsed?.unit === '%') {
    return { min: 0, max: 100, step: declaredStep }
  }

  const { width, height } = viewBox
  const span = Math.max(width, height, 1)
  const baseStep = stepForSpan(declaredStep, span)
  const fineStep = stepForSpan(0.5, span)
  const attr = name.toLowerCase()

  switch (attr) {
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
      return { min: 0, max: span / 2, step: fineStep }
    case 'markerwidth':
    case 'markerheight':
      return { min: 0, max: Math.max(20, span / 5), step: 0.5 }
    case 'refx':
      return { min: viewBox.minX - span, max: viewBox.minX + span * 2, step: baseStep }
    case 'refy':
      return { min: viewBox.minY - span, max: viewBox.minY + span * 2, step: baseStep }
    case 'dx':
    case 'dy':
      return { min: -span, max: span, step: baseStep }
    case 'z':
    case 'pointsatx':
    case 'pointsaty':
    case 'pointsatz':
    case 'targetx':
    case 'targety':
    case 'radius':
    case 'limitingconeangle':
      return { min: -span, max: span * 2, step: baseStep }
    case 'scale':
    case 'seed':
    case 'numoctaves':
    case 'surfacescale':
    case 'diffuseconstant':
    case 'specularconstant':
    case 'specularexponent':
    case 'elevation':
    case 'azimuth':
      return { min: 0, max: span, step: baseStep }
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

/**
 * Values with no concrete colour to edit. `transparent` is here even though the
 * browser resolves it, because treating it as rgba(0,0,0,0) makes the picker
 * hand back an alpha-0 colour that paints nothing.
 */
const NON_RESOLVABLE_COLORS = new Set([
  'none',
  'currentcolor',
  'transparent',
  'inherit',
  'initial',
  'unset',
])

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

export function dualNumericRangeForAttribute(
  name: string,
  viewBox: ViewBox,
): { min: number; max: number; step: number } {
  const schema = getAttributeSchema(name)
  const normalized = name.toLowerCase()
  const span = Math.max(viewBox.width, viewBox.height, 1)
  const step = schema.step ?? (normalized === 'basefrequency' ? 0.01 : 0.5)

  if (normalized === 'basefrequency') {
    return { min: 0, max: 1, step }
  }

  return { min: 0, max: span / 2, step: stepForSpan(step, span) }
}

export type ViewBoxField = 'minX' | 'minY' | 'width' | 'height'

/** Default AxisControl ranges for each viewBox component, derived from a snapshot. */
export function viewBoxFieldRange(
  field: ViewBoxField,
  viewBox: ViewBox,
): { min: number; max: number; step: number } {
  const span = Math.max(viewBox.width, viewBox.height, 1)
  const step = stepForSpan(1, span)
  switch (field) {
    case 'minX':
      return { min: viewBox.minX - span, max: viewBox.minX + span * 2, step }
    case 'minY':
      return { min: viewBox.minY - span, max: viewBox.minY + span * 2, step }
    case 'width':
      return { min: 0, max: Math.max(viewBox.width * 2, span), step }
    case 'height':
      return { min: 0, max: Math.max(viewBox.height * 2, span), step }
  }
}
