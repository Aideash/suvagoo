import type { PathCommand } from './pathAttribute'
import type { Point2D } from './pointsAttribute'
import type { PathSegment } from './svgDocument'

export interface PointsEditState {
  path: PathSegment[]
  points: Point2D[]
  selectedIndex: number | null
}

export interface PathEditState {
  path: PathSegment[]
  commands: PathCommand[]
  selectedCommandIndex: number | null
  selectedHandleIndex: number | null
}

/**
 * Which preview surface can draw handles for the current edit. Geometry inside a
 * resource is painted somewhere other than where it is declared, so only the
 * isolated preview shows it in the space its numbers are written in.
 */
export type HandleSurface = 'document' | 'isolated'
