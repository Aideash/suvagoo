import { parseViewBoxFromContent, parseViewBoxValue, type ViewBox } from './svgSchema'
import {
  findElementAtOffset,
  parseIndexedDocument,
  type IndexedDocumentNode,
  type PathSegment,
} from './svgDocument'

/**
 * Tag names arrive lowercased from the document parser, so these sets match
 * that casing rather than the canonical SVG spelling.
 */

/** Tags whose contents are never painted where they are declared. */
const RESOURCE_TAGS = new Set(['defs', 'symbol', 'marker', 'pattern', 'clippath', 'mask'])

/** Resources worth previewing on their own, in the order preferred for labels. */
const ISOLATABLE_TAGS = new Set(['marker', 'symbol', 'pattern', 'clippath', 'mask'])

/** `markerWidth`/`markerHeight` when the marker leaves them out. */
const MARKER_DEFAULT_SIZE = 3

/** Fractional coordinate spaces (`objectBoundingBox` units) span 0–1. */
const FRACTIONAL_VIEWBOX: ViewBox = { minX: 0, minY: 0, width: 1, height: 1 }

/**
 * Attributes of a viewport element that are measured in the space it
 * establishes rather than in the space it sits in.
 */
const CONTENT_SPACE_ATTRS = new Set(['viewBox', 'refX', 'refY'])

export interface ResolvedViewport {
  viewBox: ViewBox
  /** Tag that established the space, or `svg` when nothing narrower applies. */
  tag: string
  /** Empty when the space is the document's own viewport. */
  path: PathSegment[]
  /** True when the space is narrower than the document viewport. */
  local: boolean
}

function rootViewport(content: string): ResolvedViewport {
  return { viewBox: parseViewBoxFromContent(content), tag: 'svg', path: [], local: false }
}

function attribute(node: IndexedDocumentNode, name: string): string | undefined {
  const direct = node.attributes[name]
  if (direct !== undefined) return direct
  const lower = name.toLowerCase()
  const match = Object.keys(node.attributes).find((key) => key.toLowerCase() === lower)
  return match ? node.attributes[match] : undefined
}

function positiveLength(value: string | undefined): number | null {
  if (value == null) return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.endsWith('%')) return null
  const parsed = Number.parseFloat(trimmed)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function isFractional(units: string | undefined): boolean {
  return units?.trim() === 'objectBoundingBox'
}

function declaredViewBox(node: IndexedDocumentNode): ViewBox | null {
  const value = attribute(node, 'viewBox')
  if (!value) return null
  const parsed = parseViewBoxValue(value)
  return parsed && parsed.width > 0 && parsed.height > 0 ? parsed : null
}

function sizeViewBox(node: IndexedDocumentNode): ViewBox | null {
  const width = positiveLength(attribute(node, 'width'))
  const height = positiveLength(attribute(node, 'height'))
  if (width == null || height == null) return null
  return { minX: 0, minY: 0, width, height }
}

/**
 * The space a node draws its children in, or null when it names none of its own
 * and the surrounding space still applies.
 */
function contentViewBox(node: IndexedDocumentNode): ViewBox | null {
  switch (node.tag) {
    case 'svg':
      return declaredViewBox(node) ?? sizeViewBox(node)
    case 'symbol':
      return declaredViewBox(node)
    case 'marker':
      // Without a viewBox a marker draws in stroke-width units clipped to
      // markerWidth × markerHeight, so that box is the space to edit against.
      return (
        declaredViewBox(node) ?? {
          minX: 0,
          minY: 0,
          width: positiveLength(attribute(node, 'markerWidth')) ?? MARKER_DEFAULT_SIZE,
          height: positiveLength(attribute(node, 'markerHeight')) ?? MARKER_DEFAULT_SIZE,
        }
      )
    case 'pattern':
      if (isFractional(attribute(node, 'patternContentUnits'))) return FRACTIONAL_VIEWBOX
      return declaredViewBox(node) ?? sizeViewBox(node)
    case 'clippath':
      return isFractional(attribute(node, 'clipPathUnits')) ? FRACTIONAL_VIEWBOX : null
    case 'mask':
      return isFractional(attribute(node, 'maskContentUnits')) ? FRACTIONAL_VIEWBOX : null
    default:
      return null
  }
}

export function nodeChainForPath(
  root: IndexedDocumentNode | null,
  path: PathSegment[],
): IndexedDocumentNode[] {
  const first = path[0]
  const rootSegment = root?.path[0]
  if (!root || !first || !rootSegment) return []
  if (rootSegment.tag !== first.tag || rootSegment.index !== first.index) return []

  const chain: IndexedDocumentNode[] = [root]
  let node = root
  for (const segment of path.slice(1)) {
    const child = node.children.find(
      (candidate) =>
        candidate.tag === segment.tag && candidate.path.at(-1)?.index === segment.index,
    )
    if (!child) break
    chain.push(child)
    node = child
  }
  return chain
}

/**
 * Walk out from `path` until a node names the coordinate space its contents are
 * measured in. `includeSelf` picks between the space an element draws inside
 * (its own) and the space it is positioned in (its parent's).
 */
function resolveViewport(
  content: string,
  path: PathSegment[],
  includeSelf: boolean,
): ResolvedViewport {
  const chain = nodeChainForPath(parseIndexedDocument(content), path)
  const candidates = includeSelf ? chain : chain.slice(0, -1)

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const node = candidates[i]
    const viewBox = contentViewBox(node)
    if (!viewBox) continue
    return { viewBox, tag: node.tag, path: node.path, local: i > 0 }
  }

  return rootViewport(content)
}

/** The space the children of the element at `path` are drawn in. */
export function contentViewportForPath(content: string, path: PathSegment[]): ResolvedViewport {
  return resolveViewport(content, path, true)
}

/** The space a given attribute of the element at `path` is measured in. */
export function viewportForAttribute(
  content: string,
  path: PathSegment[],
  attrName: string,
): ResolvedViewport {
  return resolveViewport(content, path, CONTENT_SPACE_ATTRS.has(attrName))
}

/** Convenience wrapper for the common `viewportForAttribute(…).viewBox` read. */
export function viewBoxForAttribute(
  content: string,
  path: PathSegment[],
  attrName: string,
): ViewBox {
  return viewportForAttribute(content, path, attrName).viewBox
}

export function contentViewportAtOffset(content: string, offset: number): ResolvedViewport {
  const context = findElementAtOffset(content, offset)
  if (!context) return rootViewport(content)
  return contentViewportForPath(content, context.path)
}

export function viewportAtOffsetForAttribute(
  content: string,
  offset: number,
  attrName: string,
): ResolvedViewport {
  const context = findElementAtOffset(content, offset)
  if (!context) return rootViewport(content)
  return viewportForAttribute(content, context.path, attrName)
}

/**
 * True when the element at `path` is painted somewhere other than where it is
 * declared, so document-space handles would sit in the wrong place.
 */
export function isResourceContent(path: PathSegment[]): boolean {
  return path.slice(0, -1).some((segment) => RESOURCE_TAGS.has(segment.tag))
}

/** The innermost previewable resource at or above `path`. */
export function isolatableAncestorPath(path: PathSegment[]): PathSegment[] | null {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    if (ISOLATABLE_TAGS.has(path[i].tag)) return path.slice(0, i + 1)
  }
  return null
}
