import type { Point2D } from './pointsAttribute'

/** Map a client (viewport) position into an SVG element's user space. */
export function clientToSvgPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): Point2D | null {
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const { x, y } = point.matrixTransform(ctm.inverse())
  return { x, y }
}

/** Whether a client position falls within an element's box. */
export function containsClientPoint(el: Element, clientX: number, clientY: number): boolean {
  const rect = el.getBoundingClientRect()
  return (
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  )
}

/** One decimal place, and no trailing `.0` on whole numbers. */
export function formatCoordinate(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}
