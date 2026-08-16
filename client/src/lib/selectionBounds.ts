/** Rough selection pivot from element geometry (viewBox fallback). */

import { findElementByPath, getViewBox, type PathSegment } from './svgDocument'
import { absoluteEndpoints, parsePathD } from './pathAttribute'
import { parsePoints } from './pointsAttribute'

function parseNumber(raw: string | undefined, fallback = 0): number {
  if (raw == null || raw.trim() === '') return fallback
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}

function accumulateBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null,
  x: number,
  y: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (!bounds) return { minX: x, minY: y, maxX: x, maxY: y }
  return {
    minX: Math.min(bounds.minX, x),
    minY: Math.min(bounds.minY, y),
    maxX: Math.max(bounds.maxX, x),
    maxY: Math.max(bounds.maxY, y),
  }
}

function boundsFromElement(
  tag: string,
  attrs: Record<string, string>,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  switch (tag) {
    case 'circle': {
      const cx = parseNumber(attrs.cx)
      const cy = parseNumber(attrs.cy)
      const r = parseNumber(attrs.r)
      return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r }
    }
    case 'ellipse': {
      const cx = parseNumber(attrs.cx)
      const cy = parseNumber(attrs.cy)
      const rx = parseNumber(attrs.rx)
      const ry = parseNumber(attrs.ry)
      return { minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry }
    }
    case 'rect': {
      const x = parseNumber(attrs.x)
      const y = parseNumber(attrs.y)
      const w = parseNumber(attrs.width)
      const h = parseNumber(attrs.height)
      return { minX: x, minY: y, maxX: x + w, maxY: y + h }
    }
    case 'line': {
      const x1 = parseNumber(attrs.x1)
      const y1 = parseNumber(attrs.y1)
      const x2 = parseNumber(attrs.x2)
      const y2 = parseNumber(attrs.y2)
      return {
        minX: Math.min(x1, x2),
        minY: Math.min(y1, y2),
        maxX: Math.max(x1, x2),
        maxY: Math.max(y1, y2),
      }
    }
    case 'polygon':
    case 'polyline': {
      const points = parsePoints(attrs.points ?? '')
      if (!points?.length) return null
      let b = null as ReturnType<typeof accumulateBounds> | null
      for (const p of points) b = accumulateBounds(b, p.x, p.y)
      return b
    }
    case 'path': {
      const commands = parsePathD(attrs.d ?? '')
      if (!commands) return null
      const ends = absoluteEndpoints(commands)
      let b = null as ReturnType<typeof accumulateBounds> | null
      for (const p of ends) {
        if (p) b = accumulateBounds(b, p.x, p.y)
      }
      return b
    }
    default:
      return null
  }
}

/** Center of the union of selected element bounds, or viewBox center. */
export function selectionPivot(
  content: string,
  selectedPaths: PathSegment[][],
): { cx: number; cy: number } {
  const vb = getViewBox(content)
  let bounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null

  for (const path of selectedPaths) {
    const el = findElementByPath(content, path)
    if (!el) continue
    const b = boundsFromElement(el.tagName.toLowerCase(), el.existingAttributes)
    if (!b) continue
    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, b.minX),
          minY: Math.min(bounds.minY, b.minY),
          maxX: Math.max(bounds.maxX, b.maxX),
          maxY: Math.max(bounds.maxY, b.maxY),
        }
      : b
  }

  if (!bounds) {
    return { cx: vb.minX + vb.width / 2, cy: vb.minY + vb.height / 2 }
  }
  return {
    cx: (bounds.minX + bounds.maxX) / 2,
    cy: (bounds.minY + bounds.maxY) / 2,
  }
}
