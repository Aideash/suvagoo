import type { DualNumeric } from './dualNumericAttribute'

/** Which axis holds the larger value when eccentricity > 0. */
export type StretchAxis = 'x' | 'y'

export type DualLensId = 'axes' | 'shape'

export type ValueLensMeta = {
  id: DualLensId
  label: string
}

/** SVG-shaped dual number projected into magnitude / eccentricity space. */
export type DualShapeParams = {
  magnitude: number
  /** 0 = isotropic, 1 = fully axial (min component is 0). */
  eccentricity: number
  axis: StretchAxis
}

export const DUAL_NUMERIC_LENSES: readonly ValueLensMeta[] = [
  { id: 'axes', label: 'Axes' },
  { id: 'shape', label: 'Shape' },
] as const

export const ECCENTRICITY_RANGE = { min: 0, max: 1, step: 0.01 } as const

/** One digit finer than the AxisControl step, for clean projected display values. */
export const ECCENTRICITY_DISPLAY_QUANTUM = ECCENTRICITY_RANGE.step / 10

function clampNonNegative(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/**
 * Round eccentricity to display quantum and clamp to [0, 1]. Scales by the
 * quantum's inverse so the result divides cleanly; multiplying by the quantum
 * instead leaves artifacts like 0.7000000000000001.
 */
export function snapEccentricity(value: number): number {
  const inverseQuantum = Math.round(1 / ECCENTRICITY_DISPLAY_QUANTUM)
  if (!Number.isFinite(value) || inverseQuantum <= 0) return 0
  return clampUnit(Math.round(value * inverseQuantum) / inverseQuantum)
}

/** Expand a DualNumeric into explicit non-negative x/y components. */
export function dualToAxes(canonical: DualNumeric): { x: number; y: number } {
  const x = clampNonNegative(canonical.primary)
  const y = clampNonNegative(canonical.secondary ?? canonical.primary)
  return { x, y }
}

/**
 * Project canonical dual values into Shape lens params.
 * When x === y, `fallbackAxis` preserves stretch direction across isotropic edits.
 */
export function dualToShape(
  canonical: DualNumeric,
  fallbackAxis: StretchAxis = 'x',
): DualShapeParams {
  const { x, y } = dualToAxes(canonical)
  const magnitude = Math.max(x, y)
  if (magnitude <= 0) {
    return { magnitude: 0, eccentricity: 0, axis: fallbackAxis }
  }
  const min = Math.min(x, y)
  const eccentricity = snapEccentricity(1 - min / magnitude)
  let axis: StretchAxis = fallbackAxis
  if (x > y) axis = 'x'
  else if (y > x) axis = 'y'
  return { magnitude, eccentricity, axis }
}

/** Convert Shape lens params back to a DualNumeric (isotropic → single token). */
export function shapeToDual(shape: DualShapeParams): DualNumeric {
  const magnitude = clampNonNegative(shape.magnitude)
  const eccentricity = clampUnit(shape.eccentricity)
  if (magnitude <= 0 || eccentricity <= 0) {
    return { primary: magnitude, secondary: null }
  }
  const max = magnitude
  const min = magnitude * (1 - eccentricity)
  if (shape.axis === 'y') {
    return { primary: min, secondary: max }
  }
  return { primary: max, secondary: min }
}
