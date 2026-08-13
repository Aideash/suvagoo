/** Parse / format / mutate SVG/CSS `filter` attribute lists. */

import { formatNumericValue, parseColor, parseNumericValue } from './attributeSchema'

export type FilterSoloType =
  | 'none'
  | 'initial'
  | 'inherit'
  | 'revert'
  | 'revert-layer'
  | 'unset'

export type FilterFunctionType =
  | FilterSoloType
  | 'blur'
  | 'brightness'
  | 'contrast'
  | 'drop-shadow'
  | 'grayscale'
  | 'hue-rotate'
  | 'invert'
  | 'opacity'
  | 'saturate'
  | 'sepia'
  | 'url'

export interface FilterArg {
  number: number
  unit: string
}

export interface FilterFunction {
  type: FilterFunctionType
  values: FilterArg[]
  /** Present for drop-shadow when a color was specified. */
  color?: string
  /** Target of a `url()` entry, as authored (e.g. `#blur`). */
  reference?: string
}

export interface FilterFunctionMeta {
  hint: string
  minArgs: number
  maxArgs: number
  paramLabels: string[]
  defaultArity: number
  /** Kind of params for ranges / units in the UI; 'reference' is not numeric. */
  paramKind: 'solo' | 'length' | 'amount' | 'angle' | 'drop-shadow' | 'reference'
}

export const FILTER_SOLO_TYPES: readonly FilterSoloType[] = [
  'none',
  'initial',
  'inherit',
  'revert',
  'revert-layer',
  'unset',
]

const SOLO_SET = new Set<string>(FILTER_SOLO_TYPES)

export function isFilterSolo(type: FilterFunctionType): boolean {
  return SOLO_SET.has(type)
}

/** `url(...)` entries carry a reference instead of numeric arguments. */
export function isFilterReference(type: FilterFunctionType): boolean {
  return type === 'url'
}

export const FILTER_FUNCTION_META: Record<FilterFunctionType, FilterFunctionMeta> = {
  none: { hint: 'None', minArgs: 0, maxArgs: 0, paramLabels: [], defaultArity: 0, paramKind: 'solo' },
  initial: {
    hint: 'Initial',
    minArgs: 0,
    maxArgs: 0,
    paramLabels: [],
    defaultArity: 0,
    paramKind: 'solo',
  },
  inherit: {
    hint: 'Inherit',
    minArgs: 0,
    maxArgs: 0,
    paramLabels: [],
    defaultArity: 0,
    paramKind: 'solo',
  },
  revert: {
    hint: 'Revert',
    minArgs: 0,
    maxArgs: 0,
    paramLabels: [],
    defaultArity: 0,
    paramKind: 'solo',
  },
  'revert-layer': {
    hint: 'Revert layer',
    minArgs: 0,
    maxArgs: 0,
    paramLabels: [],
    defaultArity: 0,
    paramKind: 'solo',
  },
  unset: {
    hint: 'Unset',
    minArgs: 0,
    maxArgs: 0,
    paramLabels: [],
    defaultArity: 0,
    paramKind: 'solo',
  },
  blur: {
    hint: 'Blur',
    minArgs: 1,
    maxArgs: 1,
    paramLabels: ['radius'],
    defaultArity: 1,
    paramKind: 'length',
  },
  brightness: {
    hint: 'Brightness',
    minArgs: 1,
    maxArgs: 1,
    paramLabels: ['amount'],
    defaultArity: 1,
    paramKind: 'amount',
  },
  contrast: {
    hint: 'Contrast',
    minArgs: 1,
    maxArgs: 1,
    paramLabels: ['amount'],
    defaultArity: 1,
    paramKind: 'amount',
  },
  'drop-shadow': {
    hint: 'Drop shadow',
    minArgs: 2,
    maxArgs: 4,
    paramLabels: ['ox', 'oy', 'blur'],
    defaultArity: 3,
    paramKind: 'drop-shadow',
  },
  grayscale: {
    hint: 'Grayscale',
    minArgs: 1,
    maxArgs: 1,
    paramLabels: ['amount'],
    defaultArity: 1,
    paramKind: 'amount',
  },
  'hue-rotate': {
    hint: 'Hue rotate',
    minArgs: 1,
    maxArgs: 1,
    paramLabels: ['angle'],
    defaultArity: 1,
    paramKind: 'angle',
  },
  invert: {
    hint: 'Invert',
    minArgs: 1,
    maxArgs: 1,
    paramLabels: ['amount'],
    defaultArity: 1,
    paramKind: 'amount',
  },
  opacity: {
    hint: 'Opacity',
    minArgs: 1,
    maxArgs: 1,
    paramLabels: ['amount'],
    defaultArity: 1,
    paramKind: 'amount',
  },
  saturate: {
    hint: 'Saturate',
    minArgs: 1,
    maxArgs: 1,
    paramLabels: ['amount'],
    defaultArity: 1,
    paramKind: 'amount',
  },
  sepia: {
    hint: 'Sepia',
    minArgs: 1,
    maxArgs: 1,
    paramLabels: ['amount'],
    defaultArity: 1,
    paramKind: 'amount',
  },
  url: {
    hint: 'Filter reference',
    minArgs: 1,
    maxArgs: 1,
    paramLabels: ['reference'],
    defaultArity: 0,
    paramKind: 'reference',
  },
}

/** All types offered in the Add menu (solos + functions; duplicates allowed). */
export const ALL_ADDABLE_FUNCTIONS: FilterFunctionType[] = [
  ...FILTER_SOLO_TYPES,
  'blur',
  'brightness',
  'contrast',
  'drop-shadow',
  'grayscale',
  'hue-rotate',
  'invert',
  'opacity',
  'saturate',
  'sepia',
  'url',
]

const TYPE_BY_LOWER = new Map<string, FilterFunctionType>(
  (Object.keys(FILTER_FUNCTION_META) as FilterFunctionType[]).map((t) => [t.toLowerCase(), t]),
)

export const FILTER_LENGTH_UNITS: readonly string[] = ['px', '', 'em', 'rem', 'pt', 'cm', 'mm', 'in']
export const FILTER_AMOUNT_UNITS: readonly string[] = ['', '%']
export const FILTER_ANGLE_UNITS: readonly string[] = ['deg', 'rad', 'turn', 'grad']

export const FILTER_LENGTH_RANGE = { min: 0, max: 50, step: 0.5 } as const
export const FILTER_AMOUNT_RANGE = { min: 0, max: 2, step: 0.01 } as const
export const FILTER_AMOUNT_PERCENT_RANGE = { min: 0, max: 200, step: 1 } as const
export const FILTER_ANGLE_RANGE = { min: 0, max: 360, step: 1 } as const
export const FILTER_OFFSET_RANGE = { min: -50, max: 50, step: 0.5 } as const

function isColorKeyword(raw: string): boolean {
  return /^(transparent|currentcolor)$/i.test(raw.trim())
}

function isColorValue(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) return false
  if (isColorKeyword(trimmed)) return true
  if (/^#/i.test(trimmed)) return /^#[0-9a-f]{3,8}$/i.test(trimmed)
  if (/^(rgba?|hsla?)\(/i.test(trimmed)) return true
  return parseColor(trimmed) != null
}

/**
 * Consume a color token starting at `start` in `source`.
 * Handles #hex, rgb()/hsl() with nested commas, and named/keyword colors.
 */
function consumeColor(source: string, start: number): { color: string; next: number } | null {
  let i = start
  while (i < source.length && /\s/.test(source[i])) i++
  if (i >= source.length) return null

  if (source[i] === '#') {
    const match = /^#[0-9a-f]{3,8}/i.exec(source.slice(i))
    if (!match) return null
    return { color: match[0], next: i + match[0].length }
  }

  if (/^(rgba?|hsla?)\(/i.test(source.slice(i))) {
    let depth = 0
    let j = i
    for (; j < source.length; j++) {
      if (source[j] === '(') depth++
      else if (source[j] === ')') {
        depth--
        if (depth === 0) {
          j++
          break
        }
      }
    }
    if (depth !== 0) return null
    return { color: source.slice(i, j).trim(), next: j }
  }

  const nameMatch = /^[A-Za-z][A-Za-z0-9-]*/.exec(source.slice(i))
  if (nameMatch && isColorValue(nameMatch[0])) {
    return { color: nameMatch[0], next: i + nameMatch[0].length }
  }

  return null
}

function consumeLength(source: string, start: number): { arg: FilterArg; next: number } | null {
  let i = start
  while (i < source.length && /[\s,]/.test(source[i])) i++
  if (i >= source.length) return null

  const match = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:[a-z%]*)?/i.exec(source.slice(i))
  if (!match) return null
  const parsed = parseNumericValue(match[0])
  if (!parsed) return null
  return { arg: { number: parsed.number, unit: parsed.unit }, next: i + match[0].length }
}

function parseDropShadowArgs(argsRaw: string): { values: FilterArg[]; color?: string } | null {
  const trimmed = argsRaw.trim()
  if (!trimmed) return null

  const values: FilterArg[] = []
  let color: string | undefined
  let i = 0

  while (i < trimmed.length) {
    while (i < trimmed.length && /[\s,]/.test(trimmed[i])) i++
    if (i >= trimmed.length) break

    // Prefer length when the token looks numeric; otherwise try color.
    const length = consumeLength(trimmed, i)
    if (length && !/^[A-Za-z#]/.test(trimmed[i])) {
      values.push(length.arg)
      i = length.next
      continue
    }

    const colorToken = consumeColor(trimmed, i)
    if (colorToken) {
      if (color != null) return null
      color = colorToken.color
      i = colorToken.next
      continue
    }

    // Numeric token that failed the letter check path still counts as length.
    if (length) {
      values.push(length.arg)
      i = length.next
      continue
    }

    return null
  }

  if (values.length < 2 || values.length > 3) return null
  return color != null ? { values, color } : { values }
}

function parseSimpleArgs(
  argsRaw: string,
  meta: FilterFunctionMeta,
): FilterArg[] | null {
  const tokens = argsRaw.length === 0 ? [] : argsRaw.split(/[\s,]+/).filter(Boolean)
  if (tokens.length < meta.minArgs || tokens.length > meta.maxArgs) return null
  const values: FilterArg[] = []
  for (const token of tokens) {
    const parsed = parseNumericValue(token)
    if (!parsed) return null
    values.push({ number: parsed.number, unit: parsed.unit })
  }
  return values
}

/** The target inside `url(...)`, unquoted. Null when there is nothing to point at. */
function parseReferenceArg(argsRaw: string): string | null {
  const quoted = /^(['"])([\s\S]*)\1$/.exec(argsRaw)
  const target = (quoted ? quoted[2] : argsRaw).trim()
  return target || null
}

/**
 * Parse a filter list. Returns null if invalid.
 * Empty string → []. Solo keyword → [{ type: solo }].
 * Unknown functions → null (edit as plain text).
 */
export function parseFilterList(value: string): FilterFunction[] | null {
  const trimmed = value.trim()
  if (!trimmed) return []

  const solo = TYPE_BY_LOWER.get(trimmed.toLowerCase())
  if (solo && isFilterSolo(solo)) {
    return [{ type: solo, values: [] }]
  }

  const functions: FilterFunction[] = []
  let i = 0

  while (i < trimmed.length) {
    while (i < trimmed.length && /[\s,]/.test(trimmed[i])) i++
    if (i >= trimmed.length) break

    const nameMatch = /^[A-Za-z][A-Za-z0-9-]*/.exec(trimmed.slice(i))
    if (!nameMatch) return null
    const name = nameMatch[0]
    const type = TYPE_BY_LOWER.get(name.toLowerCase())
    if (!type || isFilterSolo(type)) return null
    i += name.length

    while (i < trimmed.length && /\s/.test(trimmed[i])) i++
    if (trimmed[i] !== '(') return null
    i++

    // Find matching close paren (drop-shadow colors may contain nested parens).
    let depth = 1
    const argsStart = i
    while (i < trimmed.length && depth > 0) {
      if (trimmed[i] === '(') depth++
      else if (trimmed[i] === ')') depth--
      if (depth > 0) i++
    }
    if (depth !== 0) return null
    const argsRaw = trimmed.slice(argsStart, i).trim()
    i++ // skip ')'

    if (isFilterReference(type)) {
      const reference = parseReferenceArg(argsRaw)
      if (!reference) return null
      functions.push({ type, values: [], reference })
      continue
    }

    const meta = FILTER_FUNCTION_META[type]

    if (type === 'drop-shadow') {
      const parsed = parseDropShadowArgs(argsRaw)
      if (!parsed) return null
      functions.push({
        type,
        values: parsed.values,
        ...(parsed.color != null ? { color: parsed.color } : {}),
      })
      continue
    }

    const values = parseSimpleArgs(argsRaw, meta)
    if (!values) return null
    functions.push({ type, values })
  }

  return functions
}

function formatArg(arg: FilterArg): string {
  return formatNumericValue(arg.number, arg.unit)
}

function formatFunctionArgs(fn: FilterFunction): string {
  if (isFilterSolo(fn.type)) return ''
  if (isFilterReference(fn.type)) return fn.reference ?? ''
  if (fn.type === 'drop-shadow') {
    const parts = fn.values.map(formatArg)
    if (fn.color) parts.push(fn.color)
    return parts.join(' ')
  }
  return fn.values.map(formatArg).join(', ')
}

export function formatFilterList(functions: FilterFunction[]): string {
  if (functions.length === 0) return ''
  if (functions.length === 1 && isFilterSolo(functions[0].type)) {
    return functions[0].type
  }
  return functions
    .filter((fn) => !isFilterSolo(fn.type))
    .map((fn) => `${fn.type}(${formatFunctionArgs(fn)})`)
    .join(' ')
}

export function formatFunctionSummary(fn: FilterFunction): string {
  if (isFilterSolo(fn.type)) return '—'
  if (isFilterReference(fn.type)) return fn.reference ?? '—'
  if (fn.type === 'drop-shadow') {
    const parts = fn.values.map(formatArg)
    if (fn.color) parts.push(fn.color)
    return parts.join(' ') || '—'
  }
  if (fn.values.length === 0) return '—'
  return formatFunctionArgs(fn)
}

export function createDefaultFunction(type: FilterFunctionType, reference = ''): FilterFunction {
  if (isFilterSolo(type)) return { type, values: [] }
  if (isFilterReference(type)) return { type, values: [], reference }
  if (type === 'blur') return { type, values: [{ number: 0, unit: 'px' }] }
  if (type === 'brightness' || type === 'contrast' || type === 'opacity' || type === 'saturate') {
    return { type, values: [{ number: 1, unit: '' }] }
  }
  if (type === 'grayscale' || type === 'invert' || type === 'sepia') {
    return { type, values: [{ number: 0, unit: '' }] }
  }
  if (type === 'hue-rotate') return { type, values: [{ number: 0, unit: 'deg' }] }
  if (type === 'drop-shadow') {
    return {
      type,
      values: [
        { number: 2, unit: 'px' },
        { number: 2, unit: 'px' },
        { number: 2, unit: 'px' },
      ],
      color: '#000000',
    }
  }
  return { type, values: [] }
}

/** Always offer all solos and functions (duplicates allowed). */
export function availableAddFunctions(_functions: FilterFunction[]): FilterFunctionType[] {
  return [...ALL_ADDABLE_FUNCTIONS]
}

/**
 * Add a function. Solos wipe the list; adding a function strips solos.
 */
export function addFunction(
  functions: FilterFunction[],
  type: FilterFunctionType,
  reference?: string,
): { functions: FilterFunction[]; selectedIndex: number } {
  if (isFilterSolo(type)) {
    return { functions: [{ type, values: [] }], selectedIndex: 0 }
  }

  const next = [
    ...functions.filter((fn) => !isFilterSolo(fn.type)),
    createDefaultFunction(type, reference),
  ]
  return { functions: next, selectedIndex: next.length - 1 }
}

export function removeFunction(functions: FilterFunction[], index: number): FilterFunction[] {
  if (index < 0 || index >= functions.length) return functions
  return functions.filter((_, i) => i !== index)
}

export function moveFunction(
  functions: FilterFunction[],
  from: number,
  to: number,
): FilterFunction[] {
  if (from < 0 || from >= functions.length || to < 0 || to >= functions.length) {
    return functions
  }
  if (from === to) return functions
  const next = [...functions]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function updateFunctionValueAt(
  functions: FilterFunction[],
  index: number,
  valueIndex: number,
  arg: FilterArg,
): FilterFunction[] {
  const fn = functions[index]
  if (!fn || isFilterSolo(fn.type) || isFilterReference(fn.type)) return functions
  const values = [...fn.values]
  while (values.length <= valueIndex) {
    const unit =
      fn.type === 'hue-rotate'
        ? 'deg'
        : fn.type === 'blur' || fn.type === 'drop-shadow'
          ? 'px'
          : ''
    const number =
      fn.type === 'brightness' ||
      fn.type === 'contrast' ||
      fn.type === 'opacity' ||
      fn.type === 'saturate'
        ? 1
        : 0
    values.push({ number, unit })
  }
  values[valueIndex] = arg
  const next = [...functions]
  next[index] = { ...fn, values }
  return next
}

export function updateFunctionColor(
  functions: FilterFunction[],
  index: number,
  color: string,
): FilterFunction[] {
  const fn = functions[index]
  if (!fn || fn.type !== 'drop-shadow') return functions
  const next = [...functions]
  next[index] = { ...fn, color }
  return next
}

export function updateFunctionReference(
  functions: FilterFunction[],
  index: number,
  reference: string,
): FilterFunction[] {
  const fn = functions[index]
  if (!fn || !isFilterReference(fn.type)) return functions
  const next = [...functions]
  next[index] = { ...fn, reference }
  return next
}

/** Ensure editable param slots exist for the UI (pad defaults). */
export function ensureEditableValues(fn: FilterFunction): FilterArg[] {
  if (isFilterSolo(fn.type) || isFilterReference(fn.type)) return []
  if (fn.type === 'drop-shadow') {
    return [
      fn.values[0] ?? { number: 0, unit: 'px' },
      fn.values[1] ?? { number: 0, unit: 'px' },
      fn.values[2] ?? { number: 0, unit: 'px' },
    ]
  }
  const meta = FILTER_FUNCTION_META[fn.type]
  const values = [...fn.values]
  while (values.length < meta.defaultArity) {
    values.push(createDefaultFunction(fn.type).values[values.length] ?? { number: 0, unit: '' })
  }
  return values
}
