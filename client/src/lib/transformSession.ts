/** Transform session state: live preview inject + identity checks. */

import { matrixFromSession, nearlyEqual, type TransformSessionValues } from './affine'
import {
  findElementByPath,
  getViewBox,
  insertAttribute,
  updateAttribute,
  type PathSegment,
} from './svgDocument'

export type { TransformSessionValues }

export function createIdentitySession(pivot = { cx: 0, cy: 0 }): TransformSessionValues {
  return {
    tx: 0,
    ty: 0,
    angle: 0,
    cx: pivot.cx,
    cy: pivot.cy,
    sx: 1,
    sy: 1,
  }
}

export function isIdentitySession(session: TransformSessionValues): boolean {
  return (
    nearlyEqual(session.tx, 0) &&
    nearlyEqual(session.ty, 0) &&
    nearlyEqual(session.angle, 0) &&
    nearlyEqual(session.sx, 1) &&
    nearlyEqual(session.sy, 1)
  )
}

function formatCoord(n: number): string {
  const rounded = Math.round(n * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

/**
 * Format session as an SVG transform list applied right-to-left:
 * scale (about pivot) → rotate (about pivot) → translate.
 */
export function formatSessionTransform(session: TransformSessionValues): string {
  const parts: string[] = []
  if (!nearlyEqual(session.tx, 0) || !nearlyEqual(session.ty, 0)) {
    parts.push(`translate(${formatCoord(session.tx)} ${formatCoord(session.ty)})`)
  }
  if (!nearlyEqual(session.angle, 0)) {
    parts.push(
      `rotate(${formatCoord(session.angle)} ${formatCoord(session.cx)} ${formatCoord(session.cy)})`,
    )
  }
  if (!nearlyEqual(session.sx, 1) || !nearlyEqual(session.sy, 1)) {
    // SVG scale() is about origin; express about pivot via translate sandwich in the list.
    // Prefer rotate-style pivot by expanding to matrix-equivalent translate+scale+translate
    // when pivot is non-zero, matching matrixFromSession.
    const { cx, cy, sx, sy } = session
    if (nearlyEqual(cx, 0) && nearlyEqual(cy, 0)) {
      if (nearlyEqual(sx, sy)) {
        parts.push(`scale(${formatCoord(sx)})`)
      } else {
        parts.push(`scale(${formatCoord(sx)} ${formatCoord(sy)})`)
      }
    } else {
      parts.push(`translate(${formatCoord(cx)} ${formatCoord(cy)})`)
      if (nearlyEqual(sx, sy)) {
        parts.push(`scale(${formatCoord(sx)})`)
      } else {
        parts.push(`scale(${formatCoord(sx)} ${formatCoord(sy)})`)
      }
      parts.push(`translate(${formatCoord(-cx)} ${formatCoord(-cy)})`)
    }
  }
  return parts.join(' ')
}

function setAttributeValue(
  content: string,
  path: PathSegment[],
  attrName: string,
  value: string,
): string | null {
  const context = findElementByPath(content, path)
  if (!context) return null

  if (context.existingAttributes[attrName] !== undefined) {
    const result = updateAttribute(content, path, attrName, value)
    return result?.content ?? null
  }

  // insertAttribute needs an offset inside the element; openTagStart + 1 works.
  const inserted = insertAttribute(content, context.openTagStart + 1, attrName, getViewBox(content))
  if (!inserted) return null
  const updated = updateAttribute(inserted.content, path, attrName, value)
  return updated?.content ?? null
}

/**
 * Prepend the session transform onto each selected element's `transform` attribute
 * (preview-only). Edits from document end → start so offsets stay valid.
 */
export function applySessionToPreviewContent(
  content: string,
  selectedPaths: PathSegment[][],
  session: TransformSessionValues,
): string {
  if (selectedPaths.length === 0 || isIdentitySession(session)) return content

  const sessionTransform = formatSessionTransform(session)
  if (!sessionTransform) return content

  // Sort by openTagStart descending.
  const withStarts = selectedPaths
    .map((path) => {
      const el = findElementByPath(content, path)
      return el ? { path, start: el.openTagStart } : null
    })
    .filter((entry): entry is { path: PathSegment[]; start: number } => entry != null)
    .sort((a, b) => b.start - a.start)

  let next = content
  for (const { path } of withStarts) {
    const el = findElementByPath(next, path)
    if (!el) continue
    const existingRaw = el.existingAttributes.transform?.trim() ?? ''
    const existing = /^none$/i.test(existingRaw) ? '' : existingRaw
    const combined = existing ? `${sessionTransform} ${existing}` : sessionTransform
    const updated = setAttributeValue(next, path, 'transform', combined)
    if (updated) next = updated
  }
  return next
}

export { matrixFromSession }
