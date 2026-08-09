export interface Point2D {
  x: number
  y: number
}

function formatCoord(n: number): string {
  const rounded = Math.round(n * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

/** Parse an SVG `points` attribute into coordinate pairs. Returns null if invalid. */
export function parsePoints(value: string): Point2D[] | null {
  const trimmed = value.trim()
  if (!trimmed) return []

  const tokens = trimmed.split(/[\s,]+/).filter(Boolean)
  if (tokens.length % 2 !== 0) return null

  const points: Point2D[] = []
  for (let i = 0; i < tokens.length; i += 2) {
    const x = Number.parseFloat(tokens[i])
    const y = Number.parseFloat(tokens[i + 1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    points.push({ x, y })
  }
  return points
}

/** Serialize coordinates to canonical `x,y x,y …` form. */
export function formatPoints(points: Point2D[]): string {
  return points.map((p) => `${formatCoord(p.x)},${formatCoord(p.y)}`).join(' ')
}

export function updatePoint(
  points: Point2D[],
  index: number,
  patch: Partial<Point2D>,
): Point2D[] {
  if (index < 0 || index >= points.length) return points
  const next = [...points]
  next[index] = { ...next[index], ...patch }
  return next
}

export function insertPoint(points: Point2D[], index: number, point: Point2D): Point2D[] {
  const next = [...points]
  const clamped = Math.max(0, Math.min(index, next.length))
  next.splice(clamped, 0, point)
  return next
}

export function removePoint(points: Point2D[], index: number): Point2D[] {
  if (index < 0 || index >= points.length) return points
  return points.filter((_, i) => i !== index)
}

export function movePoint(points: Point2D[], from: number, to: number): Point2D[] {
  if (from < 0 || from >= points.length || to < 0 || to >= points.length || from === to) {
    return points
  }
  const next = [...points]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function formatPointLabel(point: Point2D): string {
  return `(${formatCoord(point.x)}, ${formatCoord(point.y)})`
}
