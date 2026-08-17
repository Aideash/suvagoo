import type { Point2D } from './pointsAttribute'

export type PathCommandType = 'M' | 'L' | 'H' | 'V' | 'C' | 'S' | 'Q' | 'T' | 'A' | 'Z'

export interface PathCommand {
  type: PathCommandType
  relative: boolean
  values: number[]
}

export type PathParamCount = number | 'repeat2' | 'repeat1' | 'repeat4' | 'repeat6' | 'repeat7'

export interface PathCommandMeta {
  hint: string
  shortHint: string
  paramCount: PathParamCount
  paramLabels?: string[]
}

export const PATH_COMMAND_META: Record<PathCommandType, PathCommandMeta> = {
  M: { hint: 'Move to', shortHint: 'Move', paramCount: 'repeat2', paramLabels: ['x', 'y'] },
  L: { hint: 'Line to', shortHint: 'Line', paramCount: 'repeat2', paramLabels: ['x', 'y'] },
  H: { hint: 'Horizontal to', shortHint: 'Horiz', paramCount: 'repeat1', paramLabels: ['x'] },
  V: { hint: 'Vertical to', shortHint: 'Vert', paramCount: 'repeat1', paramLabels: ['y'] },
  C: {
    hint: 'Cubic curve',
    shortHint: 'Cubic',
    paramCount: 'repeat6',
    paramLabels: ['x1', 'y1', 'x2', 'y2', 'x', 'y'],
  },
  S: {
    hint: 'Smooth cubic',
    shortHint: 'Smooth',
    paramCount: 'repeat4',
    paramLabels: ['x2', 'y2', 'x', 'y'],
  },
  Q: {
    hint: 'Quadratic curve',
    shortHint: 'Quad',
    paramCount: 'repeat4',
    paramLabels: ['x1', 'y1', 'x', 'y'],
  },
  T: {
    hint: 'Smooth quadratic',
    shortHint: 'Smooth',
    paramCount: 'repeat2',
    paramLabels: ['x', 'y'],
  },
  A: {
    hint: 'Elliptical arc',
    shortHint: 'Arc',
    paramCount: 'repeat7',
    paramLabels: ['rx', 'ry', 'rotation', 'large-arc', 'sweep', 'x', 'y'],
  },
  Z: { hint: 'Close path', shortHint: 'Close', paramCount: 0 },
}

const COMMAND_LETTERS = new Set([
  'M',
  'm',
  'L',
  'l',
  'H',
  'h',
  'V',
  'v',
  'C',
  'c',
  'S',
  's',
  'Q',
  'q',
  'T',
  't',
  'A',
  'a',
  'Z',
  'z',
])

const PARAMS_PER_COMMAND: Record<PathCommandType, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
}

export type PathHandleKind = 'endpoint' | 'control1' | 'control2'

export interface PathHandle {
  commandIndex: number
  kind: PathHandleKind
  point: Point2D
  /** Index into command.values for x coordinate */
  valueIndex: number
}

function formatCoord(n: number): string {
  const rounded = Math.round(n * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

function letterToCommand(letter: string): PathCommandType {
  return letter.toUpperCase() as PathCommandType
}

function isRelative(letter: string): boolean {
  return letter === letter.toLowerCase() && letter !== 'Z' && letter !== 'z'
}

function tokenizePathD(value: string): (string | number)[] | null {
  const tokens: (string | number)[] = []
  let i = 0
  const trimmed = value.trim()
  if (!trimmed) return []

  while (i < trimmed.length) {
    const ch = trimmed[i]
    if (/[\s,]/.test(ch)) {
      i++
      continue
    }
    if (COMMAND_LETTERS.has(ch)) {
      tokens.push(ch)
      i++
      continue
    }
    const rest = trimmed.slice(i)
    const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(rest)
    if (!match) return null
    tokens.push(Number.parseFloat(match[1]))
    i += match[1].length
  }
  return tokens
}

/** Parse an SVG path `d` attribute into structured commands. Returns null if invalid. */
export function parsePathD(value: string): PathCommand[] | null {
  const tokens = tokenizePathD(value)
  if (tokens === null) return null

  const commands: PathCommand[] = []
  let i = 0

  while (i < tokens.length) {
    const token = tokens[i]
    if (typeof token !== 'string') return null

    let type = letterToCommand(token)
    const relative = isRelative(token)
    i++

    if (type === 'Z') {
      commands.push({ type: 'Z', relative: false, values: [] })
      continue
    }

    const per = PARAMS_PER_COMMAND[type]
    let firstMoveto = type === 'M'

    while (i < tokens.length && typeof tokens[i] === 'number') {
      const chunk: number[] = []
      while (chunk.length < per && i < tokens.length && typeof tokens[i] === 'number') {
        chunk.push(tokens[i] as number)
        i++
      }
      if (chunk.length !== per) return null

      if (firstMoveto && type === 'M') {
        commands.push({ type: 'M', relative, values: chunk })
        firstMoveto = false
        type = 'L'
      } else {
        commands.push({ type, relative, values: chunk })
      }
    }
  }

  return commands
}

export function formatPathD(commands: PathCommand[]): string {
  if (commands.length === 0) return ''

  const parts: string[] = []
  for (const cmd of commands) {
    const letter = cmd.relative ? cmd.type.toLowerCase() : cmd.type
    if (cmd.type === 'Z') {
      parts.push('Z')
      continue
    }
    const per = PARAMS_PER_COMMAND[cmd.type]
    const chunks: string[] = []
    for (let i = 0; i < cmd.values.length; i += per) {
      const slice = cmd.values.slice(i, i + per)
      chunks.push(slice.map(formatCoord).join(' '))
    }
    parts.push(`${letter} ${chunks.join(' ')}`)
  }
  return parts.join(' ')
}

export function formatCommandLetter(cmd: PathCommand): string {
  if (cmd.type === 'Z') return 'Z'
  return cmd.relative ? cmd.type.toLowerCase() : cmd.type
}

export function formatCommandSummary(cmd: PathCommand): string {
  if (cmd.type === 'Z') return '—'
  const per = PARAMS_PER_COMMAND[cmd.type]
  const groups: string[] = []
  for (let i = 0; i < cmd.values.length; i += per) {
    const slice = cmd.values.slice(i, i + per)
    if (per === 1) {
      groups.push(formatCoord(slice[0]))
    } else if (per === 2) {
      groups.push(`${formatCoord(slice[0])}, ${formatCoord(slice[1])}`)
    } else if (per === 4) {
      groups.push(
        `${formatCoord(slice[0])},${formatCoord(slice[1])} ${formatCoord(slice[2])},${formatCoord(slice[3])}`,
      )
    } else if (per === 6) {
      groups.push(
        `${formatCoord(slice[0])},${formatCoord(slice[1])} ${formatCoord(slice[2])},${formatCoord(slice[3])} ${formatCoord(slice[4])},${formatCoord(slice[5])}`,
      )
    } else if (per === 7) {
      groups.push(
        `${formatCoord(slice[0])},${formatCoord(slice[1])} ${formatCoord(slice[2])}° ${slice[3] ? 'large' : 'small'} ${slice[4] ? 'cw' : 'ccw'} → ${formatCoord(slice[5])},${formatCoord(slice[6])}`,
      )
    }
  }
  return groups.join(' · ')
}

export interface PenState {
  x: number
  y: number
  /** Start of current subpath (for Z) */
  startX: number
  startY: number
  /** Previous control point for S/T reflection */
  prevControlX: number | null
  prevControlY: number | null
  prevType: PathCommandType | null
}

function createPenState(): PenState {
  return {
    x: 0,
    y: 0,
    startX: 0,
    startY: 0,
    prevControlX: null,
    prevControlY: null,
    prevType: null,
  }
}

function resolvePoint(values: number[], index: number, pen: Point2D, relative: boolean): Point2D {
  const x = values[index]
  const y = values[index + 1]
  if (relative) return { x: pen.x + x, y: pen.y + y }
  return { x, y }
}

function reflectControl(cx: number, cy: number, px: number, py: number): Point2D {
  return { x: 2 * px - cx, y: 2 * py - cy }
}

/** Walk commands and return absolute endpoint for each command index. */
export function absoluteEndpoints(commands: PathCommand[]): (Point2D | null)[] {
  const endpoints: (Point2D | null)[] = []
  const pen = createPenState()

  for (const cmd of commands) {
    if (cmd.type === 'Z') {
      pen.x = pen.startX
      pen.y = pen.startY
      pen.prevControlX = null
      pen.prevControlY = null
      pen.prevType = 'Z'
      endpoints.push(null)
      continue
    }

    const rel = cmd.relative
    const v = cmd.values
    let end: Point2D

    switch (cmd.type) {
      case 'M':
      case 'L':
      case 'T': {
        end = resolvePoint(v, v.length - 2, pen, rel)
        if (cmd.type === 'M') {
          pen.startX = end.x
          pen.startY = end.y
        }
        if (cmd.type === 'T' && v.length >= 2) {
          pen.prevControlX = end.x
          pen.prevControlY = end.y
        }
        break
      }
      case 'H': {
        const x = rel ? pen.x + v[v.length - 1] : v[v.length - 1]
        end = { x, y: pen.y }
        break
      }
      case 'V': {
        const y = rel ? pen.y + v[v.length - 1] : v[v.length - 1]
        end = { x: pen.x, y }
        break
      }
      case 'C': {
        end = resolvePoint(v, v.length - 2, pen, rel)
        if (v.length >= 6) {
          const c2 = resolvePoint(v, v.length - 4, pen, rel)
          pen.prevControlX = c2.x
          pen.prevControlY = c2.y
        }
        break
      }
      case 'S': {
        end = resolvePoint(v, v.length - 2, pen, rel)
        if (v.length >= 4) {
          const c2 = resolvePoint(v, v.length - 4, pen, rel)
          pen.prevControlX = c2.x
          pen.prevControlY = c2.y
        }
        break
      }
      case 'Q': {
        end = resolvePoint(v, v.length - 2, pen, rel)
        if (v.length >= 4) {
          const c1 = resolvePoint(v, 0, pen, rel)
          pen.prevControlX = c1.x
          pen.prevControlY = c1.y
        }
        break
      }
      case 'A': {
        end = resolvePoint(v, v.length - 2, pen, rel)
        pen.prevControlX = null
        pen.prevControlY = null
        break
      }
      default:
        end = { x: pen.x, y: pen.y }
    }

    pen.x = end.x
    pen.y = end.y
    pen.prevType = cmd.type
    endpoints.push(end)
  }

  return endpoints
}

/** Pen position immediately before command at index. */
export function penBeforeCommand(commands: PathCommand[], index: number): Point2D {
  const pen = createPenState()
  for (let i = 0; i < index; i++) {
    applyCommandToPen(commands[i], pen)
  }
  return { x: pen.x, y: pen.y }
}

function applyCommandToPen(cmd: PathCommand, pen: PenState): void {
  if (cmd.type === 'Z') {
    pen.x = pen.startX
    pen.y = pen.startY
    pen.prevControlX = null
    pen.prevControlY = null
    pen.prevType = 'Z'
    return
  }

  const rel = cmd.relative
  const v = cmd.values
  if (v.length === 0) return

  switch (cmd.type) {
    case 'M':
    case 'L':
    case 'T': {
      const end = resolvePoint(v, v.length - 2, pen, rel)
      if (cmd.type === 'M') {
        pen.startX = end.x
        pen.startY = end.y
      }
      pen.x = end.x
      pen.y = end.y
      if (cmd.type === 'T') {
        pen.prevControlX = end.x
        pen.prevControlY = end.y
      }
      break
    }
    case 'H': {
      pen.x = rel ? pen.x + v[v.length - 1] : v[v.length - 1]
      break
    }
    case 'V': {
      pen.y = rel ? pen.y + v[v.length - 1] : v[v.length - 1]
      break
    }
    case 'C': {
      const end = resolvePoint(v, v.length - 2, pen, rel)
      const c2 = resolvePoint(v, v.length - 4, pen, rel)
      pen.x = end.x
      pen.y = end.y
      pen.prevControlX = c2.x
      pen.prevControlY = c2.y
      break
    }
    case 'S': {
      const end = resolvePoint(v, v.length - 2, pen, rel)
      const c2 = resolvePoint(v, v.length - 4, pen, rel)
      pen.x = end.x
      pen.y = end.y
      pen.prevControlX = c2.x
      pen.prevControlY = c2.y
      break
    }
    case 'Q': {
      const end = resolvePoint(v, v.length - 2, pen, rel)
      const c1 = resolvePoint(v, 0, pen, rel)
      pen.x = end.x
      pen.y = end.y
      pen.prevControlX = c1.x
      pen.prevControlY = c1.y
      break
    }
    case 'A': {
      const end = resolvePoint(v, v.length - 2, pen, rel)
      pen.x = end.x
      pen.y = end.y
      pen.prevControlX = null
      pen.prevControlY = null
      break
    }
  }
  pen.prevType = cmd.type
}

export function getReflectedControl(commands: PathCommand[], commandIndex: number): Point2D | null {
  const pen = createPenState()
  for (let i = 0; i < commandIndex; i++) {
    applyCommandToPen(commands[i], pen)
  }
  const cmd = commands[commandIndex]
  if (!cmd) return null

  if (
    cmd.type === 'S' &&
    (pen.prevType === 'C' || pen.prevType === 'S') &&
    pen.prevControlX != null
  ) {
    return reflectControl(pen.prevControlX, pen.prevControlY!, pen.x, pen.y)
  }
  if (
    cmd.type === 'T' &&
    (pen.prevType === 'Q' || pen.prevType === 'T') &&
    pen.prevControlX != null
  ) {
    return reflectControl(pen.prevControlX, pen.prevControlY!, pen.x, pen.y)
  }
  return null
}

export function getHandlesForCommand(commands: PathCommand[], commandIndex: number): PathHandle[] {
  const cmd = commands[commandIndex]
  if (!cmd || cmd.type === 'Z') return []

  const pen = penBeforeCommand(commands, commandIndex)
  const rel = cmd.relative
  const v = cmd.values
  const handles: PathHandle[] = []

  const addPoint = (kind: PathHandleKind, point: Point2D, valueIndex: number) => {
    handles.push({ commandIndex, kind, point, valueIndex })
  }

  switch (cmd.type) {
    case 'M':
    case 'L':
    case 'T': {
      const end = resolvePoint(v, 0, pen, rel)
      addPoint('endpoint', end, 0)
      break
    }
    case 'H': {
      const x = rel ? pen.x + v[0] : v[0]
      addPoint('endpoint', { x, y: pen.y }, 0)
      break
    }
    case 'V': {
      const y = rel ? pen.y + v[0] : v[0]
      addPoint('endpoint', { x: pen.x, y }, 0)
      break
    }
    case 'C': {
      addPoint('control1', resolvePoint(v, 0, pen, rel), 0)
      addPoint('control2', resolvePoint(v, 2, pen, rel), 2)
      addPoint('endpoint', resolvePoint(v, 4, pen, rel), 4)
      break
    }
    case 'S': {
      const reflected = getReflectedControl(commands, commandIndex)
      if (reflected) addPoint('control1', reflected, -1)
      addPoint('control2', resolvePoint(v, 0, pen, rel), 0)
      addPoint('endpoint', resolvePoint(v, 2, pen, rel), 2)
      break
    }
    case 'Q': {
      addPoint('control1', resolvePoint(v, 0, pen, rel), 0)
      addPoint('endpoint', resolvePoint(v, 2, pen, rel), 2)
      break
    }
    case 'A': {
      addPoint('endpoint', resolvePoint(v, 5, pen, rel), 5)
      break
    }
  }

  return handles
}

export function allPathHandles(commands: PathCommand[]): PathHandle[] {
  const handles: PathHandle[] = []
  for (let i = 0; i < commands.length; i++) {
    handles.push(...getHandlesForCommand(commands, i))
  }
  return handles
}

export function updateCommandValues(
  commands: PathCommand[],
  index: number,
  values: number[],
): PathCommand[] {
  if (index < 0 || index >= commands.length) return commands
  const next = [...commands]
  next[index] = { ...next[index], values: [...values] }
  return next
}

export function updateCommandValueAt(
  commands: PathCommand[],
  commandIndex: number,
  valueIndex: number,
  value: number,
): PathCommand[] {
  if (commandIndex < 0 || commandIndex >= commands.length) return commands
  const cmd = commands[commandIndex]
  if (valueIndex < 0 || valueIndex >= cmd.values.length) return commands
  const values = [...cmd.values]
  values[valueIndex] = value
  return updateCommandValues(commands, commandIndex, values)
}

export function updateCommandEndpoint(
  commands: PathCommand[],
  commandIndex: number,
  point: Point2D,
): PathCommand[] {
  const cmd = commands[commandIndex]
  if (!cmd || cmd.type === 'Z') return commands

  const pen = penBeforeCommand(commands, commandIndex)
  const rel = cmd.relative
  const values = [...cmd.values]

  switch (cmd.type) {
    case 'M':
    case 'L':
    case 'T': {
      values[0] = rel ? point.x - pen.x : point.x
      values[1] = rel ? point.y - pen.y : point.y
      break
    }
    case 'H': {
      values[0] = rel ? point.x - pen.x : point.x
      break
    }
    case 'V': {
      values[0] = rel ? point.y - pen.y : point.y
      break
    }
    case 'C': {
      values[4] = rel ? point.x - pen.x : point.x
      values[5] = rel ? point.y - pen.y : point.y
      break
    }
    case 'S': {
      values[2] = rel ? point.x - pen.x : point.x
      values[3] = rel ? point.y - pen.y : point.y
      break
    }
    case 'Q': {
      values[2] = rel ? point.x - pen.x : point.x
      values[3] = rel ? point.y - pen.y : point.y
      break
    }
    case 'A': {
      values[5] = rel ? point.x - pen.x : point.x
      values[6] = rel ? point.y - pen.y : point.y
      break
    }
  }

  return updateCommandValues(commands, commandIndex, values)
}

export function updateHandlePosition(
  commands: PathCommand[],
  handle: PathHandle,
  point: Point2D,
): PathCommand[] {
  if (handle.valueIndex < 0) return commands

  const cmd = commands[handle.commandIndex]
  if (!cmd) return commands

  const pen = penBeforeCommand(commands, handle.commandIndex)
  const rel = cmd.relative
  const values = [...cmd.values]
  const vi = handle.valueIndex

  if (handle.kind === 'endpoint') {
    return updateCommandEndpoint(commands, handle.commandIndex, point)
  }

  if (handle.kind === 'control1' || handle.kind === 'control2') {
    const xIdx = vi
    const yIdx = vi + 1
    values[xIdx] = rel ? point.x - pen.x : point.x
    values[yIdx] = rel ? point.y - pen.y : point.y
    return updateCommandValues(commands, handle.commandIndex, values)
  }

  return commands
}

function convertCoordPair(
  x: number,
  y: number,
  pen: Point2D,
  toRelative: boolean,
): [number, number] {
  if (toRelative) return [x - pen.x, y - pen.y]
  return [pen.x + x, pen.y + y]
}

export function toggleRelative(commands: PathCommand[], index: number): PathCommand[] {
  if (index < 0 || index >= commands.length) return commands
  const cmd = commands[index]
  if (cmd.type === 'Z') return commands

  const pen = penBeforeCommand(commands, index)
  const values = [...cmd.values]
  const per = PARAMS_PER_COMMAND[cmd.type]
  const toRelative = !cmd.relative

  for (let i = 0; i < values.length; i += per) {
    switch (cmd.type) {
      case 'H':
        values[i] = toRelative ? values[i] - pen.x : pen.x + values[i]
        break
      case 'V':
        values[i] = toRelative ? values[i] - pen.y : pen.y + values[i]
        break
      case 'A': {
        const [x, y] = convertCoordPair(values[i + 5], values[i + 6], pen, toRelative)
        values[i + 5] = x
        values[i + 6] = y
        break
      }
      default: {
        for (let j = 0; j < per; j += 2) {
          const [x, y] = convertCoordPair(values[i + j], values[i + j + 1], pen, toRelative)
          values[i + j] = x
          values[i + j + 1] = y
        }
      }
    }
  }

  const next = [...commands]
  next[index] = { ...cmd, relative: toRelative, values }
  return next
}

/** Rewrite every command in absolute coordinates, leaving geometry unchanged. */
export function commandsToAbsolute(commands: PathCommand[]): PathCommand[] {
  let next = commands.map((c) => ({ ...c, values: [...c.values] }))
  for (let i = 0; i < next.length; i++) {
    if (next[i].relative) {
      next = toggleRelative(next, i)
    }
  }
  return next
}

export function insertCommand(
  commands: PathCommand[],
  index: number,
  command: PathCommand,
): PathCommand[] {
  const next = [...commands]
  const clamped = Math.max(0, Math.min(index, next.length))
  next.splice(clamped, 0, command)
  return next
}

export function removeCommand(commands: PathCommand[], index: number): PathCommand[] {
  if (index < 0 || index >= commands.length) return commands
  return commands.filter((_, i) => i !== index)
}

export function moveCommand(commands: PathCommand[], from: number, to: number): PathCommand[] {
  if (from < 0 || from >= commands.length || to < 0 || to >= commands.length || from === to) {
    return commands
  }
  const next = [...commands]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function lastEndpoint(commands: PathCommand[]): Point2D | null {
  const endpoints = absoluteEndpoints(commands)
  for (let i = endpoints.length - 1; i >= 0; i--) {
    if (endpoints[i]) return endpoints[i]
  }
  return null
}

export function pathIsClosed(commands: PathCommand[]): boolean {
  return commands.some((c) => c.type === 'Z')
}

/**
 * `step` sizes the leap a fresh command takes from the pen position, so a
 * command added inside a marker stays inside the marker.
 */
export function defaultCommandValues(
  type: PathCommandType,
  last: Point2D | null,
  viewBoxCenter: Point2D,
  step = 10,
): number[] {
  const base = last ?? viewBoxCenter
  const offset = { x: base.x + step, y: base.y + step }

  switch (type) {
    case 'M':
    case 'L':
    case 'T':
      return [offset.x, offset.y]
    case 'H':
      return [offset.x]
    case 'V':
      return [offset.y]
    case 'C':
      return [offset.x, base.y, offset.x, offset.y, offset.x + step, offset.y]
    case 'S':
    case 'Q':
      return [offset.x, base.y, offset.x, offset.y]
    case 'A':
      return [step, step, 0, 0, 1, offset.x, offset.y]
    case 'Z':
      return []
    default:
      return []
  }
}

export function createDefaultCommand(
  type: PathCommandType,
  last: Point2D | null,
  viewBoxCenter: Point2D,
  step?: number,
): PathCommand {
  return {
    type,
    relative: false,
    values: defaultCommandValues(type, last, viewBoxCenter, step),
  }
}

export const PHASE1_COMMANDS: PathCommandType[] = ['M', 'L', 'H', 'V', 'Z']
export const PHASE2_COMMANDS: PathCommandType[] = ['C', 'S', 'Q', 'T']
export const ALL_ADDABLE_COMMANDS: PathCommandType[] = [
  ...PHASE1_COMMANDS.filter((t) => t !== 'Z'),
  ...PHASE2_COMMANDS,
  'A',
  'Z',
]
