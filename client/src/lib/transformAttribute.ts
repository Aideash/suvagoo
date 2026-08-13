/** Parse / format / mutate SVG/CSS `transform` attribute lists. */

export type TransformFunctionType =
  | 'none'
  | 'matrix'
  | 'translate'
  | 'translateX'
  | 'translateY'
  | 'translateZ'
  | 'scale'
  | 'scaleX'
  | 'scaleY'
  | 'scaleZ'
  | 'rotate'
  | 'rotateX'
  | 'rotateY'
  | 'rotateZ'
  | 'skew'
  | 'skewX'
  | 'skewY'

export interface TransformFunction {
  type: TransformFunctionType
  values: number[]
}

export interface TransformFunctionMeta {
  hint: string
  /** Minimum accepted arity when parsing. */
  minArgs: number
  /** Maximum accepted arity when parsing. */
  maxArgs: number
  /** Labels for editable params (length = defaultArity). */
  paramLabels: string[]
  /** Default number of values when creating. */
  defaultArity: number
}

export const TRANSFORM_FUNCTION_META: Record<TransformFunctionType, TransformFunctionMeta> = {
  none: { hint: 'None', minArgs: 0, maxArgs: 0, paramLabels: [], defaultArity: 0 },
  matrix: {
    hint: 'Matrix',
    minArgs: 6,
    maxArgs: 6,
    paramLabels: ['a', 'b', 'c', 'd', 'e', 'f'],
    defaultArity: 6,
  },
  translate: {
    hint: 'Translate',
    minArgs: 1,
    maxArgs: 3,
    paramLabels: ['tx', 'ty', 'tz'],
    defaultArity: 2,
  },
  translateX: { hint: 'Translate X', minArgs: 1, maxArgs: 1, paramLabels: ['tx'], defaultArity: 1 },
  translateY: { hint: 'Translate Y', minArgs: 1, maxArgs: 1, paramLabels: ['ty'], defaultArity: 1 },
  translateZ: { hint: 'Translate Z', minArgs: 1, maxArgs: 1, paramLabels: ['tz'], defaultArity: 1 },
  scale: {
    hint: 'Scale',
    minArgs: 1,
    maxArgs: 3,
    paramLabels: ['sx', 'sy', 'sz'],
    defaultArity: 2,
  },
  scaleX: { hint: 'Scale X', minArgs: 1, maxArgs: 1, paramLabels: ['sx'], defaultArity: 1 },
  scaleY: { hint: 'Scale Y', minArgs: 1, maxArgs: 1, paramLabels: ['sy'], defaultArity: 1 },
  scaleZ: { hint: 'Scale Z', minArgs: 1, maxArgs: 1, paramLabels: ['sz'], defaultArity: 1 },
  rotate: {
    hint: 'Rotate',
    minArgs: 1,
    maxArgs: 3,
    paramLabels: ['angle', 'cx', 'cy'],
    defaultArity: 1,
  },
  rotateX: { hint: 'Rotate X', minArgs: 1, maxArgs: 1, paramLabels: ['angle'], defaultArity: 1 },
  rotateY: { hint: 'Rotate Y', minArgs: 1, maxArgs: 1, paramLabels: ['angle'], defaultArity: 1 },
  rotateZ: { hint: 'Rotate Z', minArgs: 1, maxArgs: 1, paramLabels: ['angle'], defaultArity: 1 },
  skew: {
    hint: 'Skew',
    minArgs: 1,
    maxArgs: 2,
    paramLabels: ['ax', 'ay'],
    defaultArity: 2,
  },
  skewX: { hint: 'Skew X', minArgs: 1, maxArgs: 1, paramLabels: ['ax'], defaultArity: 1 },
  skewY: { hint: 'Skew Y', minArgs: 1, maxArgs: 1, paramLabels: ['ay'], defaultArity: 1 },
}

/** All types offered in the Add menu (including none). */
export const ALL_ADDABLE_FUNCTIONS: TransformFunctionType[] = [
  'none',
  'translate',
  'translateX',
  'translateY',
  'translateZ',
  'scale',
  'scaleX',
  'scaleY',
  'scaleZ',
  'rotate',
  'rotateX',
  'rotateY',
  'rotateZ',
  'skew',
  'skewX',
  'skewY',
  'matrix',
]

type CompositeGroup = {
  composite: TransformFunctionType
  components: readonly TransformFunctionType[]
  /** Default for missing component when absorbing. */
  missingDefault: number
}

const COMPOSITE_GROUPS: readonly CompositeGroup[] = [
  {
    composite: 'translate',
    components: ['translateX', 'translateY', 'translateZ'],
    missingDefault: 0,
  },
  {
    composite: 'scale',
    components: ['scaleX', 'scaleY', 'scaleZ'],
    missingDefault: 1,
  },
  {
    composite: 'rotate',
    components: ['rotateX', 'rotateY', 'rotateZ'],
    missingDefault: 0,
  },
  {
    composite: 'skew',
    components: ['skewX', 'skewY'],
    missingDefault: 0,
  },
]

const TYPE_BY_LOWER = new Map<string, TransformFunctionType>(
  (Object.keys(TRANSFORM_FUNCTION_META) as TransformFunctionType[]).map((t) => [
    t.toLowerCase(),
    t,
  ]),
)

function formatCoord(n: number): string {
  const rounded = Math.round(n * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

function parseNumberToken(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Strip common CSS units; store unitless user units / degrees.
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(?:px|pt|em|rem|%|deg|rad|turn|grad)?$/i.exec(
    trimmed,
  )
  if (!match) return null
  const n = Number.parseFloat(match[1])
  return Number.isFinite(n) ? n : null
}

/**
 * Parse a transform list. Returns null if invalid.
 * Empty string → []. Literal `none` → [{ type: 'none', values: [] }].
 */
export function parseTransformList(value: string): TransformFunction[] | null {
  const trimmed = value.trim()
  if (!trimmed) return []

  if (/^none$/i.test(trimmed)) {
    return [{ type: 'none', values: [] }]
  }

  const functions: TransformFunction[] = []
  let i = 0

  while (i < trimmed.length) {
    while (i < trimmed.length && /[\s,]/.test(trimmed[i])) i++
    if (i >= trimmed.length) break

    const nameMatch = /^[A-Za-z]+/.exec(trimmed.slice(i))
    if (!nameMatch) return null
    const name = nameMatch[0]
    const type = TYPE_BY_LOWER.get(name.toLowerCase())
    if (!type || type === 'none') return null
    i += name.length

    while (i < trimmed.length && /\s/.test(trimmed[i])) i++
    if (trimmed[i] !== '(') return null
    i++

    const close = trimmed.indexOf(')', i)
    if (close < 0) return null
    const argsRaw = trimmed.slice(i, close).trim()
    i = close + 1

    const meta = TRANSFORM_FUNCTION_META[type]
    const argTokens = argsRaw.length === 0 ? [] : argsRaw.split(/[\s,]+/).filter(Boolean)
    if (argTokens.length < meta.minArgs || argTokens.length > meta.maxArgs) return null

    const values: number[] = []
    for (const token of argTokens) {
      const n = parseNumberToken(token)
      if (n == null) return null
      values.push(n)
    }

    functions.push({ type, values })
  }

  // Uniqueness: duplicate function names are invalid for our editor model.
  const seen = new Set<TransformFunctionType>()
  for (const fn of functions) {
    if (seen.has(fn.type)) return null
    seen.add(fn.type)
  }

  return functions
}

function formatFunctionArgs(fn: TransformFunction): string {
  if (fn.type === 'none') return ''
  if (fn.type === 'translate') {
    const tx = fn.values[0] ?? 0
    const ty = fn.values[1] ?? 0
    const tz = fn.values[2]
    if (tz != null && tz !== 0) {
      return `${formatCoord(tx)}, ${formatCoord(ty)}, ${formatCoord(tz)}`
    }
    if (fn.values.length === 1) return formatCoord(tx)
    return `${formatCoord(tx)}, ${formatCoord(ty)}`
  }
  if (fn.type === 'scale') {
    const sx = fn.values[0] ?? 1
    const sy = fn.values[1]
    const sz = fn.values[2]
    if (sz != null && sz !== 1) {
      return `${formatCoord(sx)}, ${formatCoord(sy ?? sx)}, ${formatCoord(sz)}`
    }
    if (sy == null || sy === sx) return formatCoord(sx)
    return `${formatCoord(sx)}, ${formatCoord(sy)}`
  }
  if (fn.type === 'rotate') {
    const angle = fn.values[0] ?? 0
    if (fn.values.length >= 3) {
      return `${formatCoord(angle)}, ${formatCoord(fn.values[1])}, ${formatCoord(fn.values[2])}`
    }
    return formatCoord(angle)
  }
  if (fn.type === 'skew') {
    const ax = fn.values[0] ?? 0
    const ay = fn.values[1]
    if (ay == null || ay === 0) return formatCoord(ax)
    return `${formatCoord(ax)}, ${formatCoord(ay)}`
  }
  return fn.values.map(formatCoord).join(', ')
}

export function formatTransformList(functions: TransformFunction[]): string {
  if (functions.length === 0) return ''
  if (functions.length === 1 && functions[0].type === 'none') return 'none'
  return functions
    .filter((fn) => fn.type !== 'none')
    .map((fn) => `${fn.type}(${formatFunctionArgs(fn)})`)
    .join(' ')
}

export function formatFunctionSummary(fn: TransformFunction): string {
  if (fn.type === 'none') return '—'
  if (fn.values.length === 0) return '—'
  return formatFunctionArgs(fn)
}

export function createDefaultFunction(type: TransformFunctionType): TransformFunction {
  const meta = TRANSFORM_FUNCTION_META[type]
  if (type === 'none') return { type: 'none', values: [] }
  if (type === 'matrix') return { type: 'matrix', values: [1, 0, 0, 1, 0, 0] }
  if (type === 'scale' || type === 'scaleX' || type === 'scaleY' || type === 'scaleZ') {
    return { type, values: Array.from({ length: meta.defaultArity }, () => 1) }
  }
  return { type, values: Array.from({ length: meta.defaultArity }, () => 0) }
}

function findGroupForComposite(type: TransformFunctionType): CompositeGroup | undefined {
  return COMPOSITE_GROUPS.find((g) => g.composite === type)
}

function findGroupForComponent(type: TransformFunctionType): CompositeGroup | undefined {
  return COMPOSITE_GROUPS.find((g) => g.components.includes(type))
}

/** Types currently present (for uniqueness / add-menu filtering). */
export function presentTypes(functions: TransformFunction[]): Set<TransformFunctionType> {
  return new Set(functions.map((fn) => fn.type))
}

/**
 * Functions available in the Add dropdown given the current list:
 * - omit already-present types
 * - while a composite is present, hide its components
 */
export function availableAddFunctions(
  functions: TransformFunction[],
): TransformFunctionType[] {
  const present = presentTypes(functions)
  const hiddenComponents = new Set<TransformFunctionType>()
  for (const group of COMPOSITE_GROUPS) {
    if (present.has(group.composite)) {
      for (const c of group.components) hiddenComponents.add(c)
    }
  }

  return ALL_ADDABLE_FUNCTIONS.filter((type) => {
    if (present.has(type)) return false
    if (hiddenComponents.has(type)) return false
    return true
  })
}

/**
 * Absorb component functions into a composite.
 * For rotate: prefer rotateZ angle, else rotateY, else rotateX (2D rotate mapping).
 */
export function absorbIntoComposite(
  functions: TransformFunction[],
  compositeType: TransformFunctionType,
): TransformFunction[] {
  const group = findGroupForComposite(compositeType)
  if (!group) return functions

  const byType = new Map(functions.map((fn) => [fn.type, fn]))
  const remaining = functions.filter(
    (fn) => fn.type !== compositeType && !group.components.includes(fn.type),
  )

  let values: number[]

  if (compositeType === 'rotate') {
    const rz = byType.get('rotateZ')
    const ry = byType.get('rotateY')
    const rx = byType.get('rotateX')
    const existing = byType.get('rotate')
    const angle =
      rz?.values[0] ?? ry?.values[0] ?? rx?.values[0] ?? existing?.values[0] ?? group.missingDefault
    if (existing && existing.values.length >= 3) {
      values = [angle, existing.values[1], existing.values[2]]
    } else {
      values = [angle]
    }
  } else {
    values = group.components.map((componentType) => {
      const component = byType.get(componentType)
      return component?.values[0] ?? group.missingDefault
    })
    // Drop trailing defaults for cleaner translate/scale/skew when Z unused.
    if (compositeType === 'translate' || compositeType === 'scale') {
      while (values.length > 2 && values[values.length - 1] === group.missingDefault) {
        values.pop()
      }
      if (compositeType === 'scale' && values.length === 2 && values[0] === values[1]) {
        values = [values[0]]
      }
      if (compositeType === 'translate' && values.length === 1) {
        values = [values[0], 0]
      }
    }
    if (compositeType === 'skew') {
      while (values.length > 1 && values[values.length - 1] === 0) {
        values.pop()
      }
      if (values.length === 0) values = [0]
    }
  }

  const composite: TransformFunction = { type: compositeType, values }
  // Insert composite where the first absorbed/replaced item was, else append.
  const firstIndex = functions.findIndex(
    (fn) => fn.type === compositeType || group.components.includes(fn.type),
  )
  if (firstIndex < 0) {
    return [...remaining, composite]
  }
  // Rebuild preserving relative order of non-absorbed items; place composite at firstIndex slot among originals.
  const result: TransformFunction[] = []
  let placed = false
  for (let i = 0; i < functions.length; i++) {
    const fn = functions[i]
    if (fn.type === compositeType || group.components.includes(fn.type)) {
      if (!placed) {
        result.push(composite)
        placed = true
      }
      continue
    }
    result.push(fn)
  }
  if (!placed) result.push(composite)
  return result
}

/**
 * Add a function with none-wipe / none-replace and composite absorption rules.
 * Returns the new list and the index of the added/selected function.
 */
export function addFunction(
  functions: TransformFunction[],
  type: TransformFunctionType,
): { functions: TransformFunction[]; selectedIndex: number } {
  if (type === 'none') {
    return { functions: [{ type: 'none', values: [] }], selectedIndex: 0 }
  }

  let next = functions.filter((fn) => fn.type !== 'none')

  // If this type is already present, no-op (caller should filter Add menu).
  if (next.some((fn) => fn.type === type)) {
    return {
      functions: next,
      selectedIndex: next.findIndex((fn) => fn.type === type),
    }
  }

  const group = findGroupForComposite(type)
  if (group) {
    const hasComponents = next.some((fn) => group.components.includes(fn.type))
    if (hasComponents) {
      next = absorbIntoComposite(next, type)
      return {
        functions: next,
        selectedIndex: next.findIndex((fn) => fn.type === type),
      }
    }
  }

  // Adding a component while composite exists should not happen (Add menu hides them).
  // Guard: if composite present, ignore component add.
  const asComponent = findGroupForComponent(type)
  if (asComponent && next.some((fn) => fn.type === asComponent.composite)) {
    return {
      functions: next,
      selectedIndex: next.findIndex((fn) => fn.type === asComponent.composite),
    }
  }

  const created = createDefaultFunction(type)
  next = [...next, created]
  return { functions: next, selectedIndex: next.length - 1 }
}

export function removeFunction(
  functions: TransformFunction[],
  index: number,
): TransformFunction[] {
  if (index < 0 || index >= functions.length) return functions
  return functions.filter((_, i) => i !== index)
}

export function moveFunction(
  functions: TransformFunction[],
  from: number,
  to: number,
): TransformFunction[] {
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
  functions: TransformFunction[],
  index: number,
  valueIndex: number,
  value: number,
): TransformFunction[] {
  const fn = functions[index]
  if (!fn || fn.type === 'none') return functions
  const values = [...fn.values]
  // Extend if editing optional params (e.g. rotate cx/cy, translate tz).
  while (values.length <= valueIndex) {
    const fill =
      fn.type === 'scale' || fn.type.startsWith('scale')
        ? 1
        : fn.type === 'rotate' && values.length === 0
          ? 0
          : 0
    values.push(fill)
  }
  values[valueIndex] = value
  const next = [...functions]
  next[index] = { ...fn, values }
  return next
}

/** Ensure editable param slots exist for the UI (pad defaults). */
export function ensureEditableValues(fn: TransformFunction): number[] {
  const meta = TRANSFORM_FUNCTION_META[fn.type]
  if (fn.type === 'none') return []
  if (fn.type === 'matrix') {
    const identity = [1, 0, 0, 1, 0, 0]
    return identity.map((fallback, i) => fn.values[i] ?? fallback)
  }
  if (fn.type === 'translate') {
    return [fn.values[0] ?? 0, fn.values[1] ?? 0, ...(fn.values[2] != null ? [fn.values[2]] : [])]
  }
  if (fn.type === 'scale') {
    const sx = fn.values[0] ?? 1
    return [sx, fn.values[1] ?? sx, ...(fn.values[2] != null ? [fn.values[2]] : [])]
  }
  if (fn.type === 'rotate') {
    if (fn.values.length >= 3) return [fn.values[0] ?? 0, fn.values[1] ?? 0, fn.values[2] ?? 0]
    return [fn.values[0] ?? 0]
  }
  if (fn.type === 'skew') {
    return [fn.values[0] ?? 0, fn.values[1] ?? 0]
  }
  const values = [...fn.values]
  while (values.length < meta.defaultArity) {
    values.push(fn.type.startsWith('scale') ? 1 : 0)
  }
  return values
}

export const MATRIX_FIELDS = [
  { id: 'a', label: 'a' },
  { id: 'b', label: 'b' },
  { id: 'c', label: 'c' },
  { id: 'd', label: 'd' },
  { id: 'e', label: 'e' },
  { id: 'f', label: 'f' },
] as const

export const MATRIX_TRANSFORM_RANGE = { min: -10, max: 10, step: 0.01 } as const
export const ANGLE_TRANSFORM_RANGE = { min: -180, max: 180, step: 1 } as const
export const SCALE_TRANSFORM_RANGE = { min: -3, max: 3, step: 0.01 } as const
