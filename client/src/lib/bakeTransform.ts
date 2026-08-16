/** Bake a transform session into element geometry attributes. */

import {
  apply,
  isUniformScale,
  matrixFromSession,
  nearlyEqual,
  type AffineMatrix,
  type TransformSessionValues,
} from './affine'
import {
  formatPathD,
  parsePathD,
  toggleRelative,
  type PathCommand,
} from './pathAttribute'
import { formatPoints, parsePoints } from './pointsAttribute'
import {
  findElementByPath,
  findNodeByPath,
  parseIndexedDocument,
  updateAttribute,
  type PathSegment,
} from './svgDocument'

export type BakeSkipReason = 'unsupported-tag' | 'missing-geometry' | 'parse-error'

export interface BakeResult {
  content: string
  baked: PathSegment[][]
  skipped: Array<{ path: PathSegment[]; tag: string; reason: BakeSkipReason }>
  convertedToPath: PathSegment[][]
}

function formatCoord(n: number): string {
  const rounded = Math.round(n * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

function parseNumber(raw: string | undefined, fallback = 0): number {
  if (raw == null || raw.trim() === '') return fallback
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}

function commandsToAbsolute(commands: PathCommand[]): PathCommand[] {
  let next = commands.map((c) => ({ ...c, values: [...c.values] }))
  for (let i = 0; i < next.length; i++) {
    if (next[i].relative) {
      next = toggleRelative(next, i)
    }
  }
  return next
}

/**
 * Approximate one elliptical arc segment as cubic beziers (absolute coords).
 * Uses the standard center-parameterization approach with ≤90° segments.
 */
function arcToCubics(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  phiDeg: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number,
): PathCommand[] {
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  if (rx < 1e-9 || ry < 1e-9) {
    return [{ type: 'L', relative: false, values: [x2, y2] }]
  }

  const phi = (phiDeg * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)

  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  let x1p = cosPhi * dx + sinPhi * dy
  let y1p = -sinPhi * dx + cosPhi * dy

  let rxSq = rx * rx
  let rySq = ry * ry
  const x1pSq = x1p * x1p
  const y1pSq = y1p * y1p

  const lambda = x1pSq / rxSq + y1pSq / rySq
  if (lambda > 1) {
    const s = Math.sqrt(lambda)
    rx *= s
    ry *= s
    rxSq = rx * rx
    rySq = ry * ry
  }

  const sign = largeArc === sweep ? -1 : 1
  const num = Math.max(0, rxSq * rySq - rxSq * y1pSq - rySq * x1pSq)
  const den = rxSq * y1pSq + rySq * x1pSq
  const coef = den === 0 ? 0 : (sign * Math.sqrt(num / den))
  const cxp = (coef * (rx * y1p)) / ry
  const cyp = (coef * -(ry * x1p)) / rx

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2

  function angle(ux: number, uy: number, vx: number, vy: number): number {
    const n = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy)
    if (n === 0) return 0
    const cos = Math.min(1, Math.max(-1, (ux * vx + uy * vy) / n))
    const ang = Math.acos(cos)
    return ux * vy - uy * vx < 0 ? -ang : ang
  }

  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (sweep === 0 && delta > 0) delta -= 2 * Math.PI
  if (sweep === 1 && delta < 0) delta += 2 * Math.PI

  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)))
  const deltaSeg = delta / segments
  const t = (4 / 3) * Math.tan(deltaSeg / 4)

  const cubics: PathCommand[] = []
  for (let i = 0; i < segments; i++) {
    const th1 = theta1 + i * deltaSeg
    const th2 = th1 + deltaSeg
    const cos1 = Math.cos(th1)
    const sin1 = Math.sin(th1)
    const cos2 = Math.cos(th2)
    const sin2 = Math.sin(th2)

    const ep1x = cosPhi * rx * cos1 - sinPhi * ry * sin1 + cx
    const ep1y = sinPhi * rx * cos1 + cosPhi * ry * sin1 + cy
    const ep2x = cosPhi * rx * cos2 - sinPhi * ry * sin2 + cx
    const ep2y = sinPhi * rx * cos2 + cosPhi * ry * sin2 + cy

    const q1x = ep1x - t * (cosPhi * rx * sin1 + sinPhi * ry * cos1)
    const q1y = ep1y - t * (sinPhi * rx * sin1 - cosPhi * ry * cos1)
    const q2x = ep2x + t * (cosPhi * rx * sin2 + sinPhi * ry * cos2)
    const q2y = ep2y + t * (sinPhi * rx * sin2 - cosPhi * ry * cos2)

    // First point of first segment is already at current pen; only emit C.
    void ep1x
    void ep1y
    cubics.push({
      type: 'C',
      relative: false,
      values: [q1x, q1y, q2x, q2y, ep2x, ep2y],
    })
  }
  return cubics
}

function transformArcParams(
  m: AffineMatrix,
  rx: number,
  ry: number,
  rotationDeg: number,
  sweep: number,
  session: TransformSessionValues,
): { rx: number; ry: number; rotation: number; sweep: number } {
  const scaleFactor = Math.abs(session.sx)
  const nextRx = Math.abs(rx) * scaleFactor
  const nextRy = Math.abs(ry) * Math.abs(session.sy)
  const nextRotation = rotationDeg + session.angle
  let nextSweep = sweep
  // Negative determinant flips orientation.
  const det = m.a * m.d - m.b * m.c
  if (det < 0) nextSweep = sweep ? 0 : 1
  return { rx: nextRx, ry: nextRy, rotation: nextRotation, sweep: nextSweep }
}

function transformPathCommands(
  commands: PathCommand[],
  m: AffineMatrix,
  session: TransformSessionValues,
): PathCommand[] {
  const absolute = commandsToAbsolute(commands)
  const uniform = isUniformScale(session.sx, session.sy)
  const out: PathCommand[] = []
  let penX = 0
  let penY = 0
  let startX = 0
  let startY = 0

  for (const cmd of absolute) {
    if (cmd.type === 'Z') {
      out.push({ type: 'Z', relative: false, values: [] })
      penX = startX
      penY = startY
      continue
    }

    if (cmd.type === 'A') {
      const per = 7
      for (let i = 0; i < cmd.values.length; i += per) {
        const rx = cmd.values[i]
        const ry = cmd.values[i + 1]
        const rot = cmd.values[i + 2]
        const large = cmd.values[i + 3]
        const sweep = cmd.values[i + 4]
        const x = cmd.values[i + 5]
        const y = cmd.values[i + 6]

        if (uniform) {
          const end = apply(m, x, y)
          const arc = transformArcParams(m, rx, ry, rot, sweep, session)
          out.push({
            type: 'A',
            relative: false,
            values: [arc.rx, arc.ry, arc.rotation, large, arc.sweep, end.x, end.y],
          })
          penX = end.x
          penY = end.y
        } else {
          const cubics = arcToCubics(penX, penY, rx, ry, rot, large, sweep, x, y)
          for (const cubic of cubics) {
            const v = cubic.values
            const p1 = apply(m, v[0], v[1])
            const p2 = apply(m, v[2], v[3])
            const p3 = apply(m, v[4], v[5])
            out.push({
              type: 'C',
              relative: false,
              values: [p1.x, p1.y, p2.x, p2.y, p3.x, p3.y],
            })
            penX = p3.x
            penY = p3.y
          }
        }
      }
      continue
    }

    if (cmd.type === 'H') {
      const values: number[] = []
      for (const x of cmd.values) {
        const p = apply(m, x, penY)
        // After general transform, H becomes L.
        values.push(p.x, p.y)
        penX = p.x
        penY = p.y
      }
      out.push({ type: 'L', relative: false, values })
      continue
    }

    if (cmd.type === 'V') {
      const values: number[] = []
      for (const y of cmd.values) {
        const p = apply(m, penX, y)
        values.push(p.x, p.y)
        penX = p.x
        penY = p.y
      }
      out.push({ type: 'L', relative: false, values })
      continue
    }

    const values = [...cmd.values]
    for (let i = 0; i + 1 < values.length; i += 2) {
      const p = apply(m, values[i], values[i + 1])
      values[i] = p.x
      values[i + 1] = p.y
    }
    const endX = values[values.length - 2]
    const endY = values[values.length - 1]
    if (cmd.type === 'M') {
      startX = endX
      startY = endY
    }
    penX = endX
    penY = endY
    out.push({ type: cmd.type, relative: false, values })
  }

  return out
}

function ellipsePathD(cx: number, cy: number, rx: number, ry: number): string {
  // Two-arc closed ellipse.
  return formatPathD([
    { type: 'M', relative: false, values: [cx - rx, cy] },
    {
      type: 'A',
      relative: false,
      values: [rx, ry, 0, 1, 0, cx + rx, cy],
    },
    {
      type: 'A',
      relative: false,
      values: [rx, ry, 0, 1, 0, cx - rx, cy],
    },
    { type: 'Z', relative: false, values: [] },
  ])
}

function rectPathD(
  x: number,
  y: number,
  w: number,
  h: number,
  rx: number,
  ry: number,
): string {
  rx = Math.min(Math.abs(rx), Math.abs(w) / 2)
  ry = Math.min(Math.abs(ry), Math.abs(h) / 2)
  if (rx === 0 && ry === 0) {
    return formatPathD([
      { type: 'M', relative: false, values: [x, y] },
      { type: 'L', relative: false, values: [x + w, y] },
      { type: 'L', relative: false, values: [x + w, y + h] },
      { type: 'L', relative: false, values: [x, y + h] },
      { type: 'Z', relative: false, values: [] },
    ])
  }
  return formatPathD([
    { type: 'M', relative: false, values: [x + rx, y] },
    { type: 'L', relative: false, values: [x + w - rx, y] },
    { type: 'A', relative: false, values: [rx, ry, 0, 0, 1, x + w, y + ry] },
    { type: 'L', relative: false, values: [x + w, y + h - ry] },
    { type: 'A', relative: false, values: [rx, ry, 0, 0, 1, x + w - rx, y + h] },
    { type: 'L', relative: false, values: [x + rx, y + h] },
    { type: 'A', relative: false, values: [rx, ry, 0, 0, 1, x, y + h - ry] },
    { type: 'L', relative: false, values: [x, y + ry] },
    { type: 'A', relative: false, values: [rx, ry, 0, 0, 1, x + rx, y] },
    { type: 'Z', relative: false, values: [] },
  ])
}

const GEOMETRY_ATTRS = new Set([
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'width',
  'height',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'd',
])

function preserveAttrs(attrs: Record<string, string>): string {
  const parts: string[] = []
  for (const [name, value] of Object.entries(attrs)) {
    if (GEOMETRY_ATTRS.has(name.toLowerCase())) continue
    // Drop transform? Plan says leave existing transform alone — when converting
    // to path we keep non-geometry attrs including transform.
    const escaped = value.replace(/"/g, '&quot;')
    parts.push(`${name}="${escaped}"`)
  }
  return parts.length ? ` ${parts.join(' ')}` : ''
}

function replaceElementWithPath(
  content: string,
  path: PathSegment[],
  d: string,
  attrs: Record<string, string>,
): string | null {
  const node = findNodeByPath(parseIndexedDocument(content), path)
  if (!node) return null
  const end = node.closeTagEnd ?? node.openTagEnd
  const replacement = `<path d="${d}"${preserveAttrs(attrs)}/>`
  return content.slice(0, node.openTagStart) + replacement + content.slice(end)
}

function setAttrs(
  content: string,
  path: PathSegment[],
  updates: Record<string, string>,
): string | null {
  let next = content
  // Apply from a stable snapshot of keys; order doesn't matter for same open tag
  // as long as we re-find the element each time... actually updateAttribute
  // changes open tag length, so we must update one at a time via findElementByPath.
  for (const [name, value] of Object.entries(updates)) {
    const el = findElementByPath(next, path)
    if (!el) return null
    if (el.existingAttributes[name] === undefined) {
      // Insert by splicing into open tag.
      const openTag = next.slice(el.openTagStart, el.openTagEnd)
      const insertAt = el.openTagEnd - (openTag.endsWith('/>') ? 2 : 1)
      const insertion = ` ${name}="${value}"`
      next = next.slice(0, insertAt) + insertion + next.slice(insertAt)
    } else {
      const result = updateAttribute(next, path, name, value)
      if (!result) return null
      next = result.content
    }
  }
  return next
}

function bakePath(
  content: string,
  path: PathSegment[],
  attrs: Record<string, string>,
  m: AffineMatrix,
  session: TransformSessionValues,
): { content: string } | { skip: BakeSkipReason } {
  const d = attrs.d
  if (d == null) return { skip: 'missing-geometry' }
  const commands = parsePathD(d)
  if (!commands) return { skip: 'parse-error' }
  const next = transformPathCommands(commands, m, session)
  const result = updateAttribute(content, path, 'd', formatPathD(next))
  if (!result) return { skip: 'parse-error' }
  return { content: result.content }
}

function bakePoints(
  content: string,
  path: PathSegment[],
  attrs: Record<string, string>,
  m: AffineMatrix,
): { content: string } | { skip: BakeSkipReason } {
  const raw = attrs.points
  if (raw == null) return { skip: 'missing-geometry' }
  const points = parsePoints(raw)
  if (!points) return { skip: 'parse-error' }
  const next = points.map((p) => apply(m, p.x, p.y))
  const result = updateAttribute(content, path, 'points', formatPoints(next))
  if (!result) return { skip: 'parse-error' }
  return { content: result.content }
}

function bakeLine(
  content: string,
  path: PathSegment[],
  attrs: Record<string, string>,
  m: AffineMatrix,
): { content: string } | { skip: BakeSkipReason } {
  const p1 = apply(m, parseNumber(attrs.x1), parseNumber(attrs.y1))
  const p2 = apply(m, parseNumber(attrs.x2), parseNumber(attrs.y2))
  const updated = setAttrs(content, path, {
    x1: formatCoord(p1.x),
    y1: formatCoord(p1.y),
    x2: formatCoord(p2.x),
    y2: formatCoord(p2.y),
  })
  if (!updated) return { skip: 'parse-error' }
  return { content: updated }
}

function needsPathConversion(tag: string, session: TransformSessionValues): boolean {
  const hasRotate = !nearlyEqual(session.angle, 0)
  const nonUniform = !isUniformScale(session.sx, session.sy)
  if (tag === 'circle') return hasRotate || nonUniform
  if (tag === 'ellipse' || tag === 'rect') return hasRotate
  return false
}

function bakeCircle(
  content: string,
  path: PathSegment[],
  attrs: Record<string, string>,
  m: AffineMatrix,
  session: TransformSessionValues,
): { content: string; converted?: boolean } | { skip: BakeSkipReason } {
  const cx = parseNumber(attrs.cx)
  const cy = parseNumber(attrs.cy)
  const r = parseNumber(attrs.r)
  if (needsPathConversion('circle', session)) {
    const d = ellipsePathD(cx, cy, r, r)
    const commands = parsePathD(d)
    if (!commands) return { skip: 'parse-error' }
    const baked = formatPathD(transformPathCommands(commands, m, session))
    const next = replaceElementWithPath(content, path, baked, attrs)
    if (!next) return { skip: 'parse-error' }
    return { content: next, converted: true }
  }
  const center = apply(m, cx, cy)
  const edge = apply(m, cx + r, cy)
  const nextR = Math.hypot(edge.x - center.x, edge.y - center.y)
  const updated = setAttrs(content, path, {
    cx: formatCoord(center.x),
    cy: formatCoord(center.y),
    r: formatCoord(nextR),
  })
  if (!updated) return { skip: 'parse-error' }
  return { content: updated }
}

function bakeEllipse(
  content: string,
  path: PathSegment[],
  attrs: Record<string, string>,
  m: AffineMatrix,
  session: TransformSessionValues,
): { content: string; converted?: boolean } | { skip: BakeSkipReason } {
  const cx = parseNumber(attrs.cx)
  const cy = parseNumber(attrs.cy)
  const rx = parseNumber(attrs.rx)
  const ry = parseNumber(attrs.ry)
  if (needsPathConversion('ellipse', session)) {
    const d = ellipsePathD(cx, cy, rx, ry)
    const commands = parsePathD(d)
    if (!commands) return { skip: 'parse-error' }
    const baked = formatPathD(transformPathCommands(commands, m, session))
    const next = replaceElementWithPath(content, path, baked, attrs)
    if (!next) return { skip: 'parse-error' }
    return { content: next, converted: true }
  }
  const center = apply(m, cx, cy)
  const right = apply(m, cx + rx, cy)
  const top = apply(m, cx, cy + ry)
  const nextRx = Math.hypot(right.x - center.x, right.y - center.y)
  const nextRy = Math.hypot(top.x - center.x, top.y - center.y)
  const updated = setAttrs(content, path, {
    cx: formatCoord(center.x),
    cy: formatCoord(center.y),
    rx: formatCoord(nextRx),
    ry: formatCoord(nextRy),
  })
  if (!updated) return { skip: 'parse-error' }
  return { content: updated }
}

function bakeRect(
  content: string,
  path: PathSegment[],
  attrs: Record<string, string>,
  m: AffineMatrix,
  session: TransformSessionValues,
): { content: string; converted?: boolean } | { skip: BakeSkipReason } {
  const x = parseNumber(attrs.x)
  const y = parseNumber(attrs.y)
  const w = parseNumber(attrs.width)
  const h = parseNumber(attrs.height)
  const rx = parseNumber(attrs.rx)
  const ry = parseNumber(attrs.ry, rx)
  if (needsPathConversion('rect', session)) {
    const d = rectPathD(x, y, w, h, rx, ry)
    const commands = parsePathD(d)
    if (!commands) return { skip: 'parse-error' }
    const baked = formatPathD(transformPathCommands(commands, m, session))
    const next = replaceElementWithPath(content, path, baked, attrs)
    if (!next) return { skip: 'parse-error' }
    return { content: next, converted: true }
  }
  const p0 = apply(m, x, y)
  const p1 = apply(m, x + w, y)
  const p2 = apply(m, x, y + h)
  // Axis-aligned after scale+translate (no rotate): width/height from edge lengths.
  const nextW = Math.hypot(p1.x - p0.x, p1.y - p0.y) * Math.sign(session.sx || 1)
  const nextH = Math.hypot(p2.x - p0.x, p2.y - p0.y) * Math.sign(session.sy || 1)
  // Origin is the transformed corner; with negative scale the "min" corner may flip.
  let nextX = p0.x
  let nextY = p0.y
  let width = nextW
  let height = nextH
  if (width < 0) {
    nextX += width
    width = -width
  }
  if (height < 0) {
    nextY += height
    height = -height
  }
  const updates: Record<string, string> = {
    x: formatCoord(nextX),
    y: formatCoord(nextY),
    width: formatCoord(width),
    height: formatCoord(height),
  }
  if (attrs.rx !== undefined || attrs.ry !== undefined) {
    updates.rx = formatCoord(Math.abs(rx * session.sx))
    updates.ry = formatCoord(Math.abs(ry * session.sy))
  }
  const updated = setAttrs(content, path, updates)
  if (!updated) return { skip: 'parse-error' }
  return { content: updated }
}

const BAKEABLE = new Set(['path', 'polygon', 'polyline', 'line', 'circle', 'ellipse', 'rect'])

/**
 * Apply session matrix to selected element geometry. Existing `transform` attrs
 * are left untouched. Edits run from document end → start.
 */
export function bakeTransform(
  content: string,
  selectedPaths: PathSegment[][],
  session: TransformSessionValues,
): BakeResult {
  const m = matrixFromSession(session)
  const skipped: BakeResult['skipped'] = []
  const baked: PathSegment[][] = []
  const convertedToPath: PathSegment[][] = []

  const withStarts = selectedPaths
    .map((path) => {
      const el = findElementByPath(content, path)
      return el ? { path, start: el.openTagStart, tag: el.tagName.toLowerCase(), attrs: el.existingAttributes } : null
    })
    .filter(
      (
        entry,
      ): entry is {
        path: PathSegment[]
        start: number
        tag: string
        attrs: Record<string, string>
      } => entry != null,
    )
    .sort((a, b) => b.start - a.start)

  let next = content
  for (const entry of withStarts) {
    // Re-resolve attrs after prior edits (paths still valid for earlier siblings).
    const el = findElementByPath(next, entry.path)
    if (!el) {
      skipped.push({ path: entry.path, tag: entry.tag, reason: 'parse-error' })
      continue
    }
    const tag = el.tagName.toLowerCase()
    const attrs = el.existingAttributes

    if (!BAKEABLE.has(tag)) {
      skipped.push({ path: entry.path, tag, reason: 'unsupported-tag' })
      continue
    }

    let result:
      | { content: string; converted?: boolean }
      | { skip: BakeSkipReason }

    switch (tag) {
      case 'path':
        result = bakePath(next, entry.path, attrs, m, session)
        break
      case 'polygon':
      case 'polyline':
        result = bakePoints(next, entry.path, attrs, m)
        break
      case 'line':
        result = bakeLine(next, entry.path, attrs, m)
        break
      case 'circle':
        result = bakeCircle(next, entry.path, attrs, m, session)
        break
      case 'ellipse':
        result = bakeEllipse(next, entry.path, attrs, m, session)
        break
      case 'rect':
        result = bakeRect(next, entry.path, attrs, m, session)
        break
      default:
        result = { skip: 'unsupported-tag' }
    }

    if ('skip' in result) {
      skipped.push({ path: entry.path, tag, reason: result.skip })
      continue
    }
    next = result.content
    baked.push(entry.path)
    if (result.converted) convertedToPath.push(entry.path)
  }

  return { content: next, baked, skipped, convertedToPath }
}

export function describeBakePlan(
  content: string,
  selectedPaths: PathSegment[][],
  session: TransformSessionValues,
): { direct: string[]; convert: string[]; skip: string[] } {
  const direct: string[] = []
  const convert: string[] = []
  const skip: string[] = []
  for (const path of selectedPaths) {
    const el = findElementByPath(content, path)
    if (!el) continue
    const tag = el.tagName.toLowerCase()
    if (!BAKEABLE.has(tag)) {
      skip.push(tag)
    } else if (needsPathConversion(tag, session)) {
      convert.push(tag)
    } else {
      direct.push(tag)
    }
  }
  return { direct, convert, skip }
}
