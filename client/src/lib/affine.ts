/** 2D affine helpers for transform sessions and geometry bake. */

import type { Point2D } from './pointsAttribute'

export interface AffineMatrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export function identity(): AffineMatrix {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
}

export function translate(tx: number, ty: number): AffineMatrix {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty }
}

export function scale(sx: number, sy: number): AffineMatrix {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 }
}

/** Clockwise-positive degrees, matching SVG `rotate(angle)`. */
export function rotate(angleDeg: number): AffineMatrix {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
}

/** Reflect across a line through the origin at `angleDeg` from the x axis. */
export function mirror(angleDeg: number): AffineMatrix {
  const rad = (2 * angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { a: cos, b: sin, c: sin, d: -cos, e: 0, f: 0 }
}

/** Multiply so that `apply(multiply(A, B), p) === apply(A, apply(B, p))`. */
export function multiply(a: AffineMatrix, b: AffineMatrix): AffineMatrix {
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    e: a.a * b.e + a.c * b.f + a.e,
    f: a.b * b.e + a.d * b.f + a.f,
  }
}

export function apply(m: AffineMatrix, x: number, y: number): Point2D {
  return {
    x: m.a * x + m.c * y + m.e,
    y: m.b * x + m.d * y + m.f,
  }
}

export function applyPoint(m: AffineMatrix, p: Point2D): Point2D {
  return apply(m, p.x, p.y)
}

/** Scale about a pivot: T(cx,cy) · S · T(-cx,-cy). */
export function scaleAbout(sx: number, sy: number, cx: number, cy: number): AffineMatrix {
  return multiply(translate(cx, cy), multiply(scale(sx, sy), translate(-cx, -cy)))
}

/** Rotate about a pivot: T(cx,cy) · R · T(-cx,-cy). */
export function rotateAbout(angleDeg: number, cx: number, cy: number): AffineMatrix {
  return multiply(translate(cx, cy), multiply(rotate(angleDeg), translate(-cx, -cy)))
}

/** Reflect across the line at `angleDeg` passing through (cx, cy). */
export function mirrorAbout(angleDeg: number, cx: number, cy: number): AffineMatrix {
  return multiply(translate(cx, cy), multiply(mirror(angleDeg), translate(-cx, -cy)))
}

export interface TransformSessionValues {
  tx: number
  ty: number
  angle: number
  cx: number
  cy: number
  sx: number
  sy: number
}

/**
 * Session matrix as if wrapping in `<g transform="translate rotate scale">`.
 * SVG applies right-to-left, so user space sees scale, then rotate, then translate.
 */
export function matrixFromSession(session: TransformSessionValues): AffineMatrix {
  const { tx, ty, angle, cx, cy, sx, sy } = session
  let m = identity()
  m = multiply(m, translate(tx, ty))
  if (angle !== 0) {
    m = multiply(m, rotateAbout(angle, cx, cy))
  }
  if (sx !== 1 || sy !== 1) {
    m = multiply(m, scaleAbout(sx, sy, cx, cy))
  }
  return m
}

export function determinant(m: AffineMatrix): number {
  return m.a * m.d - m.b * m.c
}

/** True when scale factors are equal in magnitude (rotation + uniform scale OK for arcs). */
export function isUniformScale(sx: number, sy: number, epsilon = 1e-6): boolean {
  return Math.abs(Math.abs(sx) - Math.abs(sy)) <= epsilon
}

export function nearlyEqual(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) <= epsilon
}
