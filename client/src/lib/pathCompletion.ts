/**
 * Complete an open path by appending a copy of its trailing commands.
 *
 * All three modes are the same operation under a different rigid motion:
 * retrace walks the section back with no transform, reflect mirrors it across
 * the chord joining the section's start and end, and copy rotates it 180° about
 * that chord's midpoint. Retrace and reflect are traversed backwards so the
 * appended geometry continues from the pen; copy already lands there.
 *
 * Because every mode is an isometry, arc radii survive untouched and only the
 * x-axis rotation and sweep flag need adjusting — no curve flattening.
 */

import {
  apply,
  determinant,
  mirrorAbout,
  multiply,
  rotateAbout,
  translate,
  type AffineMatrix,
} from './affine'
import {
  absoluteEndpoints,
  commandsToAbsolute,
  formatPathD,
  getReflectedControl,
  type PathCommand,
} from './pathAttribute'
import type { Point2D } from './pointsAttribute'

/** Coordinates serialize to 3 decimals, so anything below this is noise. */
const POINT_EPSILON = 1e-6

export type CompletionMode = 'retrace' | 'reflect' | 'copy'
export type ConnectorStyle = 'none' | 'line' | 'arc'

export interface CompletionOptions {
  mode: CompletionMode
  /** Trailing commands to trace back; null traces the whole path. */
  steps: number | null
  /** Separation between the original and the return path, in user units. */
  width: number
  /** Which side of the start-to-end chord the return path sits on. */
  flip: boolean
  connector: ConnectorStyle
  close: boolean
}

export interface CompletionResult {
  /** The original commands with the completion appended. */
  commands: PathCommand[]
  /** Index of the first appended command. */
  appendedFrom: number
  /** True when the trace covered the whole path, so `Z` closes it cleanly. */
  tracedWholePath: boolean
}

export const DEFAULT_COMPLETION_OPTIONS: CompletionOptions = {
  mode: 'retrace',
  steps: null,
  width: 0,
  flip: false,
  connector: 'none',
  close: true,
}

interface ArcParams {
  rx: number
  ry: number
  rotation: number
  largeArc: number
  sweep: number
}

interface Segment {
  type: 'L' | 'C' | 'Q' | 'A'
  start: Point2D
  end: Point2D
  c1?: Point2D
  c2?: Point2D
  arc?: ArcParams
}

const ORIGIN: Point2D = { x: 0, y: 0 }

function samePoint(a: Point2D, b: Point2D): boolean {
  return Math.abs(a.x - b.x) <= POINT_EPSILON && Math.abs(a.y - b.y) <= POINT_EPSILON
}

function normalize(v: Point2D): Point2D | null {
  const length = Math.hypot(v.x, v.y)
  if (length <= POINT_EPSILON) return null
  return { x: v.x / length, y: v.y / length }
}

function crossZ(a: Point2D, b: Point2D): number {
  return a.x * b.y - a.y * b.x
}

/** An ellipse at rotation θ and θ+180 are the same ellipse; keep the tidy one. */
function normalizeArcRotation(deg: number): number {
  return ((deg % 180) + 180) % 180
}

/**
 * Completion needs a single open subpath: one leading `M`, no `Z`, and no
 * further `M`, since reversing across a subpath break has no sensible meaning.
 */
export function canCompletePath(commands: PathCommand[] | null | undefined): boolean {
  if (!commands || commands.length < 2) return false
  if (commands[0].type !== 'M') return false
  for (let i = 1; i < commands.length; i++) {
    const type = commands[i].type
    if (type === 'M' || type === 'Z') return false
  }
  return true
}

export function maxCompletionSteps(commands: PathCommand[] | null | undefined): number {
  if (!canCompletePath(commands)) return 0
  return commands!.length - 1
}

/** Rewrite `H`/`V` as `L` and `S`/`T` as `C`/`Q`, one output per input. */
function desugarCommands(absolute: PathCommand[]): PathCommand[] {
  const endpoints = absoluteEndpoints(absolute)
  const out: PathCommand[] = []

  for (let i = 0; i < absolute.length; i++) {
    const cmd = absolute[i]
    const pen = (i === 0 ? ORIGIN : endpoints[i - 1]) ?? ORIGIN
    const end = endpoints[i] ?? pen

    switch (cmd.type) {
      case 'H':
      case 'V':
        out.push({ type: 'L', relative: false, values: [end.x, end.y] })
        break
      case 'S': {
        const c1 = getReflectedControl(absolute, i) ?? pen
        out.push({
          type: 'C',
          relative: false,
          values: [c1.x, c1.y, cmd.values[0], cmd.values[1], end.x, end.y],
        })
        break
      }
      case 'T': {
        const c1 = getReflectedControl(absolute, i) ?? pen
        out.push({ type: 'Q', relative: false, values: [c1.x, c1.y, end.x, end.y] })
        break
      }
      default:
        out.push({ ...cmd, values: [...cmd.values] })
    }
  }

  return out
}

function segmentsFrom(desugared: PathCommand[], sliceStart: number): Segment[] {
  const endpoints = absoluteEndpoints(desugared)
  const segments: Segment[] = []

  for (let i = Math.max(1, sliceStart); i < desugared.length; i++) {
    const cmd = desugared[i]
    const start = endpoints[i - 1] ?? ORIGIN
    const end = endpoints[i] ?? start
    const v = cmd.values

    switch (cmd.type) {
      case 'C':
        segments.push({
          type: 'C',
          start,
          end,
          c1: { x: v[0], y: v[1] },
          c2: { x: v[2], y: v[3] },
        })
        break
      case 'Q':
        segments.push({ type: 'Q', start, end, c1: { x: v[0], y: v[1] } })
        break
      case 'A':
        segments.push({
          type: 'A',
          start,
          end,
          arc: { rx: v[0], ry: v[1], rotation: v[2], largeArc: v[3], sweep: v[4] },
        })
        break
      default:
        segments.push({ type: 'L', start, end })
    }
  }

  return segments
}

/**
 * A rotation by θ carries the ellipse axis to `rot + θ`; a reflection about the
 * line at φ carries it to `2φ − rot`. Both angles come straight off the matrix,
 * since `atan2(b, a)` is θ for a rotation and 2φ for a reflection.
 */
function transformArcRotation(m: AffineMatrix, rotationDeg: number): number {
  const linearAngle = (Math.atan2(m.b, m.a) * 180) / Math.PI
  const next = determinant(m) < 0 ? linearAngle - rotationDeg : rotationDeg + linearAngle
  return normalizeArcRotation(next)
}

function transformSegment(m: AffineMatrix, seg: Segment): Segment {
  const next: Segment = {
    type: seg.type,
    start: apply(m, seg.start.x, seg.start.y),
    end: apply(m, seg.end.x, seg.end.y),
  }
  if (seg.c1) next.c1 = apply(m, seg.c1.x, seg.c1.y)
  if (seg.c2) next.c2 = apply(m, seg.c2.x, seg.c2.y)
  if (seg.arc) {
    next.arc = {
      ...seg.arc,
      rotation: transformArcRotation(m, seg.arc.rotation),
      sweep: determinant(m) < 0 ? (seg.arc.sweep ? 0 : 1) : seg.arc.sweep,
    }
  }
  return next
}

function reverseSegment(seg: Segment): Segment {
  const next: Segment = { type: seg.type, start: seg.end, end: seg.start }
  if (seg.type === 'C') {
    next.c1 = seg.c2
    next.c2 = seg.c1
  } else if (seg.type === 'Q') {
    next.c1 = seg.c1
  } else if (seg.arc) {
    next.arc = { ...seg.arc, sweep: seg.arc.sweep ? 0 : 1 }
  }
  return next
}

function lineCommand(from: Point2D, to: Point2D): PathCommand {
  if (Math.abs(to.y - from.y) <= POINT_EPSILON) {
    return { type: 'H', relative: false, values: [to.x] }
  }
  if (Math.abs(to.x - from.x) <= POINT_EPSILON) {
    return { type: 'V', relative: false, values: [to.y] }
  }
  return { type: 'L', relative: false, values: [to.x, to.y] }
}

function segmentToCommand(seg: Segment): PathCommand {
  switch (seg.type) {
    case 'C':
      return {
        type: 'C',
        relative: false,
        values: [seg.c1!.x, seg.c1!.y, seg.c2!.x, seg.c2!.y, seg.end.x, seg.end.y],
      }
    case 'Q':
      return {
        type: 'Q',
        relative: false,
        values: [seg.c1!.x, seg.c1!.y, seg.end.x, seg.end.y],
      }
    case 'A': {
      const a = seg.arc!
      return {
        type: 'A',
        relative: false,
        values: [a.rx, a.ry, a.rotation, a.largeArc, a.sweep, seg.end.x, seg.end.y],
      }
    }
    default:
      return lineCommand(seg.start, seg.end)
  }
}

/**
 * The offset between the two paths is always perpendicular to the chord and of
 * length `width`, so an arc connector with radius `width / 2` is an exact
 * semicircular cap. `bulge` picks which of the two semicircles to take.
 */
function connectorCommand(
  from: Point2D,
  to: Point2D,
  style: ConnectorStyle,
  bulge: Point2D,
): PathCommand | null {
  if (samePoint(from, to)) return null
  if (style !== 'arc') return lineCommand(from, to)

  const off = { x: to.x - from.x, y: to.y - from.y }
  const radius = Math.hypot(off.x, off.y) / 2
  const sweep = crossZ(off, bulge) < 0 ? 1 : 0
  return { type: 'A', relative: false, values: [radius, radius, 0, 0, sweep, to.x, to.y] }
}

function endTangent(seg: Segment): Point2D {
  if (seg.type === 'C' && seg.c2) {
    const fromControl = { x: seg.end.x - seg.c2.x, y: seg.end.y - seg.c2.y }
    if (normalize(fromControl)) return fromControl
  }
  if (seg.type === 'Q' && seg.c1) {
    const fromControl = { x: seg.end.x - seg.c1.x, y: seg.end.y - seg.c1.y }
    if (normalize(fromControl)) return fromControl
  }
  return { x: seg.end.x - seg.start.x, y: seg.end.y - seg.start.y }
}

/** Roughly where an arc bows to, enough to tell which side of its chord it sits. */
function arcBulgePoint(seg: Segment): Point2D {
  const arc = seg.arc!
  const off = { x: seg.end.x - seg.start.x, y: seg.end.y - seg.start.y }
  const mid = { x: seg.start.x + off.x / 2, y: seg.start.y + off.y / 2 }
  const direction = normalize({ x: off.y, y: -off.x })
  if (!direction) return mid

  const sagitta = Math.min(Math.abs(arc.rx), Math.abs(arc.ry), Math.hypot(off.x, off.y) / 2)
  const sign = arc.sweep ? 1 : -1
  return {
    x: mid.x + direction.x * sagitta * sign,
    y: mid.y + direction.y * sagitta * sign,
  }
}

/**
 * Signed measure of which side of the chord the traced section bows to, so the
 * return path can be pushed away from it rather than through it. Zero means the
 * section straddles the chord evenly and either side is as good.
 */
function bulgeSide(segments: Segment[], forward: Point2D, start: Point2D): number {
  let total = 0
  const sample = (p: Point2D) => {
    total += crossZ(forward, { x: p.x - start.x, y: p.y - start.y })
  }

  for (const seg of segments) {
    if (seg.type === 'A') sample(arcBulgePoint(seg))
    if (seg.c1) sample(seg.c1)
    if (seg.c2) sample(seg.c2)
    sample(seg.end)
  }

  return total
}

/** Direction of the traced section, falling back to its end tangent. */
function chordDirection(segments: Segment[], from: Point2D, to: Point2D): Point2D {
  const chord = normalize({ x: to.x - from.x, y: to.y - from.y })
  if (chord) return chord
  const tangent = normalize(endTangent(segments[segments.length - 1]))
  return tangent ?? { x: 1, y: 0 }
}

export function buildCompletion(
  commands: PathCommand[] | null | undefined,
  options: CompletionOptions,
): CompletionResult | null {
  if (!canCompletePath(commands)) return null

  const source = commands!
  const desugared = desugarCommands(commandsToAbsolute(source))
  const total = desugared.length - 1
  const requested = options.steps == null ? total : options.steps
  const steps = Math.max(1, Math.min(Math.round(requested), total))
  const sliceStart = desugared.length - steps

  const segments = segmentsFrom(desugared, sliceStart)
  if (segments.length === 0) return null

  const sectionStart = segments[0].start
  const sectionEnd = segments[segments.length - 1].end
  const forward = chordDirection(segments, sectionStart, sectionEnd)
  const side = options.flip ? -1 : 1
  // Width pushes the return path away from the original. Retrace lies exactly on
  // top of it and so has no side to move away from; it goes left of travel.
  const away =
    options.mode === 'retrace' || bulgeSide(segments, forward, sectionStart) >= 0 ? 1 : -1
  const normal = { x: forward.y * side * away, y: -forward.x * side * away }
  const width = options.connector === 'none' ? 0 : options.width
  const offset = translate(normal.x * width, normal.y * width)

  let matrix: AffineMatrix
  if (options.mode === 'reflect') {
    const chordAngle = (Math.atan2(forward.y, forward.x) * 180) / Math.PI
    matrix = multiply(offset, mirrorAbout(chordAngle, sectionStart.x, sectionStart.y))
  } else if (options.mode === 'copy') {
    const midX = (sectionStart.x + sectionEnd.x) / 2
    const midY = (sectionStart.y + sectionEnd.y) / 2
    matrix = multiply(offset, rotateAbout(180, midX, midY))
  } else {
    matrix = offset
  }

  let returnSegments = segments.map((seg) => transformSegment(matrix, seg))
  if (options.mode !== 'copy') {
    returnSegments = returnSegments.reverse().map(reverseSegment)
  }

  const appended: PathCommand[] = []
  const head = connectorCommand(sectionEnd, returnSegments[0].start, options.connector, forward)
  if (head) appended.push(head)
  for (const seg of returnSegments) appended.push(segmentToCommand(seg))

  if (options.close) {
    const returnEnd = returnSegments[returnSegments.length - 1].end
    const backward = { x: -forward.x, y: -forward.y }
    const tail = connectorCommand(returnEnd, sectionStart, options.connector, backward)
    if (tail) appended.push(tail)
    // `Z` returns to the subpath start, which is only where the return path
    // lands when the whole path was traced. On a partial trace the tail
    // connector has already closed the loop.
    if (sliceStart === 1) appended.push({ type: 'Z', relative: false, values: [] })
  }

  return {
    commands: [...source, ...appended],
    appendedFrom: source.length,
    tracedWholePath: sliceStart === 1,
  }
}

/**
 * The appended commands alone as a standalone `d`, for drawing the new geometry
 * in a different colour. A trailing `Z` is dropped since it would close back to
 * the injected `M` rather than to the real subpath start.
 */
export function completionTailD(result: CompletionResult): string {
  const tail = result.commands.slice(result.appendedFrom)
  const endpoints = absoluteEndpoints(result.commands)
  const from = endpoints[result.appendedFrom - 1] ?? ORIGIN
  const drawable = tail.filter((cmd) => cmd.type !== 'Z')
  if (drawable.length === 0) return ''
  return formatPathD([{ type: 'M', relative: false, values: [from.x, from.y] }, ...drawable])
}
