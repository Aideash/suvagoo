import {
  findElementAtOffset,
  findNodeByPath,
  parseIndexedDocument,
  type IndexedDocumentNode,
} from './svgDocument'
import { parseViewBoxFromContent, type ViewBox } from './svgSchema'

const RESOURCE_TAGS: Record<string, string> = {
  lineargradient: 'linearGradient',
  radialgradient: 'radialGradient',
  pattern: 'pattern',
  clippath: 'clipPath',
  mask: 'mask',
  filter: 'filter',
  symbol: 'symbol',
  marker: 'marker',
}

export interface DefsPreviewEntry {
  key: string
  tag: string
  id: string
  label: string
  content: string
  supported: boolean
}

export interface DefsPreviewModel {
  mode: 'gallery' | 'resource'
  entries: DefsPreviewEntry[]
}

interface PreviewResource {
  node: IndexedDocumentNode
  id: string
  defsIndex: number
}

function nodeSource(content: string, node: IndexedDocumentNode): string {
  return content.slice(node.openTagStart, node.closeTagEnd ?? node.openTagEnd)
}

function collectDefsNodes(root: IndexedDocumentNode): IndexedDocumentNode[] {
  const result: IndexedDocumentNode[] = []

  function visit(node: IndexedDocumentNode) {
    if (node.tag === 'defs') result.push(node)
    node.children.forEach(visit)
  }

  visit(root)
  return result
}

function previewId(defsIndex: number, childIndex: number): string {
  return `__suvagoo_defs_preview_${defsIndex}_${childIndex}`
}

function resourcesForDefs(
  defsNodes: IndexedDocumentNode[],
): Map<IndexedDocumentNode, PreviewResource> {
  const resources = new Map<IndexedDocumentNode, PreviewResource>()
  defsNodes.forEach((defs, defsIndex) => {
    defs.children.forEach((node, childIndex) => {
      resources.set(node, {
        node,
        defsIndex,
        id: node.attributes.id || previewId(defsIndex, childIndex),
      })
    })
  })
  return resources
}

function defsSourceWithPreviewIds(
  content: string,
  defs: IndexedDocumentNode,
  resources: Map<IndexedDocumentNode, PreviewResource>,
): string {
  let source = nodeSource(content, defs)
  const additions = defs.children
    .filter((node) => !node.attributes.id)
    .map((node) => ({
      offset: node.openTagEnd - defs.openTagStart,
      id: resources.get(node)?.id,
    }))
    .filter((addition): addition is { offset: number; id: string } => Boolean(addition.id))
    .sort((a, b) => b.offset - a.offset)

  for (const addition of additions) {
    let insertion = addition.offset - 1
    if (source[insertion - 1] === '/') insertion -= 1
    source = `${source.slice(0, insertion)} id="${addition.id}"${source.slice(insertion)}`
  }

  return source
}

/**
 * Sample shapes carry class names rather than literal colours so the harness
 * follows the active theme. SvgDefsPreview owns the matching rules.
 */
const SAMPLE_CLASS = {
  backdrop: 'suvagoo-sample-backdrop',
  primary: 'suvagoo-sample-primary',
  secondary: 'suvagoo-sample-secondary',
  outline: 'suvagoo-sample-outline',
  stroke: 'suvagoo-sample-stroke',
} as const

function n(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

function frame(viewBox: ViewBox) {
  const { minX, minY, width, height } = viewBox
  return {
    x: minX + width * 0.15,
    y: minY + height * 0.15,
    width: width * 0.7,
    height: height * 0.7,
    centerX: minX + width * 0.5,
    centerY: minY + height * 0.5,
  }
}

function sampleForResource(tag: string, id: string, viewBox: ViewBox): string {
  const box = frame(viewBox)
  const x = n(box.x)
  const y = n(box.y)
  const width = n(box.width)
  const height = n(box.height)
  const centerX = n(box.centerX)
  const centerY = n(box.centerY)
  const radiusValue = Math.min(box.width, box.height) * 0.28
  const radius = n(radiusValue)
  const reference = `url(#${id})`
  const backdrop = `<rect class="${SAMPLE_CLASS.backdrop}" x="${n(viewBox.minX)}" y="${n(viewBox.minY)}" width="${n(viewBox.width)}" height="${n(viewBox.height)}" />`
  const subject = `
        <rect class="${SAMPLE_CLASS.primary}" x="${x}" y="${y}" width="${width}" height="${height}" />
        <circle class="${SAMPLE_CLASS.secondary}" cx="${centerX}" cy="${centerY}" r="${radius}" />`

  if (tag === 'lineargradient' || tag === 'radialgradient' || tag === 'pattern') {
    return `
      <rect class="${SAMPLE_CLASS.outline}" x="${x}" y="${y}" width="${width}" height="${height}" rx="${n(Math.min(box.width, box.height) * 0.05)}"
        fill="${reference}" stroke-width="${n(Math.min(viewBox.width, viewBox.height) * 0.0125)}" />`
  }

  if (tag === 'clippath') {
    return `
      ${backdrop}
      <g clip-path="${reference}">${subject}
      </g>`
  }

  if (tag === 'mask') {
    return `
      ${backdrop}
      <g mask="${reference}">${subject}
      </g>`
  }

  if (tag === 'filter') {
    return `
      ${backdrop}
      <g filter="${reference}">
        <rect class="${SAMPLE_CLASS.primary}" x="${x}" y="${y}" width="${width}" height="${height}" rx="${n(radiusValue * 0.35)}" />
        <circle class="${SAMPLE_CLASS.secondary}" cx="${centerX}" cy="${centerY}" r="${radius}" />
      </g>`
  }

  if (tag === 'marker') {
    const startX = n(box.x + box.width * 0.1)
    const endX = n(box.x + box.width * 0.9)
    const startY = n(box.y)
    const endY = n(box.y + box.height)
    return `
      <path class="${SAMPLE_CLASS.stroke}" d="M ${startX} ${endY} L ${centerX} ${startY} L ${endX} ${endY}"
        fill="none" stroke-width="${n(Math.min(viewBox.width, viewBox.height) * 0.025)}"
        marker-start="${reference}" marker-mid="${reference}" marker-end="${reference}" />`
  }

  if (tag === 'symbol') {
    return `<use href="#${id}" x="${x}" y="${y}" width="${width}" height="${height}" />`
  }

  return ''
}

function standaloneSvg(defsContent: string, resource: PreviewResource, viewBox: ViewBox): string {
  const viewBoxValue = `${n(viewBox.minX)} ${n(viewBox.minY)} ${n(viewBox.width)} ${n(viewBox.height)}`
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
    viewBox="${viewBoxValue}" preserveAspectRatio="xMidYMid meet">
    ${defsContent}
    ${sampleForResource(resource.node.tag, resource.id, viewBox)}
  </svg>`
}

export function buildDefsPreview(content: string, cursorOffset: number): DefsPreviewModel | null {
  const context = findElementAtOffset(content, cursorOffset)
  if (!context) return null

  const defsSegmentIndex = context.path.findIndex((segment) => segment.tag === 'defs')
  if (defsSegmentIndex < 0) return null

  const root = parseIndexedDocument(content)
  if (!root) return null

  const defsPath = context.path.slice(0, defsSegmentIndex + 1)
  const activeDefs = findNodeByPath(root, defsPath)
  if (!activeDefs) return null

  const defsNodes = collectDefsNodes(root)
  const resources = resourcesForDefs(defsNodes)
  const defsContent = defsNodes
    .map((defs) => defsSourceWithPreviewIds(content, defs, resources))
    .join('\n')
  const viewBox = parseViewBoxFromContent(content)
  const directChildPath = context.path.slice(0, defsSegmentIndex + 2)
  const selectedNode =
    directChildPath.length > defsPath.length ? findNodeByPath(root, directChildPath) : null
  const nodes =
    selectedNode && selectedNode.path.length === defsPath.length + 1
      ? [selectedNode]
      : activeDefs.children

  return {
    mode: selectedNode ? 'resource' : 'gallery',
    entries: nodes.map((node) => {
      const resource = resources.get(node)
      const canonicalTag = RESOURCE_TAGS[node.tag]
      const supported = Boolean(canonicalTag)
      const id = resource?.id ?? ''
      return {
        key: `${node.path.map((segment) => `${segment.tag}:${segment.index}`).join('/')}:${id}`,
        tag: canonicalTag ?? node.tag,
        id,
        label: node.attributes.id
          ? `<${canonicalTag ?? node.tag}> #${node.attributes.id}`
          : `<${canonicalTag ?? node.tag}>`,
        content: supported && resource ? standaloneSvg(defsContent, resource, viewBox) : '',
        supported,
      }
    }),
  }
}
