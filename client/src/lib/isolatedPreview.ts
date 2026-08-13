import {
  findElementAtOffset,
  findNodeByPath,
  parseIndexedDocument,
  type IndexedDocumentNode,
  type PathSegment,
} from './svgDocument'
import { formatViewBoxValue, type ViewBox } from './svgSchema'
import { contentViewportForPath, isolatableAncestorPath } from './svgViewport'
import type { Point2D } from './pointsAttribute'

/** Canonical spelling for the tags the parser hands back lowercased. */
const TAG_LABELS: Record<string, string> = {
  marker: 'marker',
  symbol: 'symbol',
  pattern: 'pattern',
  clippath: 'clipPath',
  mask: 'mask',
}

export interface IsolatedPreviewModel {
  /** Path of the resource whose artwork is on show. */
  path: PathSegment[]
  tag: string
  label: string
  /** The resource's own coordinate space. */
  viewBox: ViewBox
  /** Standalone SVG drawing the resource's children directly. */
  content: string
  /** Marker anchor in the resource's own space, when it declares one. */
  refPoint: Point2D | null
  empty: boolean
}

function innerSource(content: string, node: IndexedDocumentNode): string {
  if (node.selfClosing || node.closeTagEnd == null) return ''
  const closeStart = content.lastIndexOf('</', node.closeTagEnd)
  if (closeStart < node.openTagEnd) return ''
  return content.slice(node.openTagEnd, closeStart)
}

/**
 * Every `<defs>` block in the document, so paint servers and filters the
 * artwork references still resolve once it is lifted out on its own.
 */
function documentDefs(content: string, root: IndexedDocumentNode): string {
  const blocks: string[] = []

  function visit(node: IndexedDocumentNode) {
    if (node.tag === 'defs') {
      blocks.push(content.slice(node.openTagStart, node.closeTagEnd ?? node.openTagEnd))
      return
    }
    node.children.forEach(visit)
  }

  visit(root)
  return blocks.join('\n')
}

function numericAttribute(node: IndexedDocumentNode, name: string): number | null {
  const lower = name.toLowerCase()
  const key = Object.keys(node.attributes).find((candidate) => candidate.toLowerCase() === lower)
  if (!key) return null
  const parsed = Number.parseFloat(node.attributes[key])
  return Number.isFinite(parsed) ? parsed : null
}

function refPointFor(node: IndexedDocumentNode): Point2D | null {
  if (node.tag !== 'marker') return null
  return { x: numericAttribute(node, 'refX') ?? 0, y: numericAttribute(node, 'refY') ?? 0 }
}

function labelFor(node: IndexedDocumentNode): string {
  const tag = TAG_LABELS[node.tag] ?? node.tag
  const id = node.attributes.id
  return id ? `<${tag}> #${id}` : `<${tag}>`
}

function standaloneSvg(defs: string, inner: string, viewBox: ViewBox): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
    viewBox="${formatViewBoxValue(viewBox)}" preserveAspectRatio="xMidYMid meet">
    ${defs}
    <g class="suvagoo-isolated-content">${inner}</g>
  </svg>`
}

/**
 * The artwork of the resource surrounding the cursor, drawn in the coordinate
 * space its own numbers are written in rather than where it gets painted.
 */
export function buildIsolatedPreview(
  content: string,
  cursorOffset: number,
): IsolatedPreviewModel | null {
  const context = findElementAtOffset(content, cursorOffset)
  if (!context) return null

  const resourcePath = isolatableAncestorPath(context.path)
  if (!resourcePath) return null

  const root = parseIndexedDocument(content)
  const node = findNodeByPath(root, resourcePath)
  if (!root || !node) return null

  const viewBox = contentViewportForPath(content, resourcePath).viewBox
  const inner = innerSource(content, node)

  return {
    path: resourcePath,
    tag: node.tag,
    label: labelFor(node),
    viewBox,
    content: inner.trim() ? standaloneSvg(documentDefs(content, root), inner, viewBox) : '',
    refPoint: refPointFor(node),
    empty: !inner.trim(),
  }
}
