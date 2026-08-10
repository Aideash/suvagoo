export interface ViewBox {
  minX: number
  minY: number
  width: number
  height: number
}

export interface SvgElementSchema {
  /** Lowercase tag name without namespace prefix. */
  tag: string
  /** Shown first when not filtering; capped by COMMON_LIMIT in the UI. */
  commonAttributes: readonly string[]
  /** Full attribute list for search / "more" section. */
  attributes: readonly string[]
  /** Allowed child element tags; empty means text-only or leaf. */
  children: readonly string[]
  /** Snippet inserted when clicking this element in the explorer. */
  snippet: string
}

export const EXPLORER_COMMON_LIMIT = 10
export const DEFAULT_VIEWBOX: ViewBox = { minX: 0, minY: 0, width: 100, height: 100 }

const GLOBAL_ATTRIBUTES = [
  'id',
  'class',
  'style',
  'transform',
  'opacity',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-opacity',
  'fill-opacity',
  'clip-path',
  'mask',
  'filter',
  'display',
  'visibility',
  'pointer-events',
] as const

const GRAPHICAL_CHILDREN = [
  'g',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'path',
  'text',
  'use',
  'image',
  'foreignObject',
] as const

const DEFS_CHILDREN = [
  'linearGradient',
  'radialGradient',
  'pattern',
  'clipPath',
  'mask',
  'filter',
  'symbol',
  'marker',
] as const

const GRADIENT_CHILDREN = ['stop'] as const

const FILTER_PRIMITIVE_CHILDREN = [
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDisplacementMap',
  'feDropShadow',
  'feFlood',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMorphology',
  'feOffset',
  'feSpecularLighting',
  'feTile',
  'feTurbulence',
] as const

const FE_LIGHT_CHILDREN = ['feDistantLight', 'fePointLight', 'feSpotLight'] as const
const FE_FUNC_CHILDREN = ['feFuncR', 'feFuncG', 'feFuncB', 'feFuncA'] as const

/** Standard geometry/result attrs on filter primitives (SVGFilterPrimitiveStandardAttributes). */
const FE_STD_ATTRIBUTES = ['x', 'y', 'width', 'height', 'result', 'color-interpolation-filters'] as const

function feElement(
  tag: string,
  commonAttributes: readonly string[],
  extraAttributes: readonly string[],
  children: readonly string[],
  snippet: string,
): SvgElementSchema {
  return {
    tag,
    commonAttributes,
    attributes: [...commonAttributes, ...extraAttributes, ...FE_STD_ATTRIBUTES, ...GLOBAL_ATTRIBUTES],
    children,
    snippet,
  }
}

const SVG_ELEMENTS: SvgElementSchema[] = [
  {
    tag: 'svg',
    commonAttributes: ['viewBox', 'width', 'height', 'xmlns', 'fill', 'stroke'],
    attributes: [
      'viewBox',
      'width',
      'height',
      'xmlns',
      'preserveAspectRatio',
      'x',
      'y',
      ...GLOBAL_ATTRIBUTES,
    ],
    children: [
      'g',
      'rect',
      'circle',
      'ellipse',
      'line',
      'polyline',
      'polygon',
      'path',
      'text',
      'defs',
      ...GRAPHICAL_CHILDREN.filter((t) => t !== 'g'),
    ],
    snippet: '<rect x="0" y="0" width="100" height="100" fill="#3b82f6"/>',
  },
  {
    tag: 'g',
    commonAttributes: ['transform', 'fill', 'stroke', 'opacity', 'clip-path'],
    attributes: [...GLOBAL_ATTRIBUTES],
    children: [...GRAPHICAL_CHILDREN],
    snippet: '<g></g>',
  },
  {
    tag: 'rect',
    commonAttributes: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke'],
    attributes: ['x', 'y', 'width', 'height', 'rx', 'ry', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<rect x="0" y="0" width="100" height="100" fill="#3b82f6"/>',
  },
  {
    tag: 'circle',
    commonAttributes: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width'],
    attributes: ['cx', 'cy', 'r', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<circle cx="50" cy="50" r="25" fill="#3b82f6"/>',
  },
  {
    tag: 'ellipse',
    commonAttributes: ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke'],
    attributes: ['cx', 'cy', 'rx', 'ry', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<ellipse cx="50" cy="50" rx="40" ry="25" fill="#3b82f6"/>',
  },
  {
    tag: 'line',
    commonAttributes: ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width'],
    attributes: ['x1', 'y1', 'x2', 'y2', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<line x1="10" y1="10" x2="90" y2="90" stroke="#3b82f6" stroke-width="2"/>',
  },
  {
    tag: 'polyline',
    commonAttributes: ['points', 'fill', 'stroke', 'stroke-width'],
    attributes: ['points', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<polyline points="10,80 50,20 90,80" fill="none" stroke="#3b82f6" stroke-width="2"/>',
  },
  {
    tag: 'polygon',
    commonAttributes: ['points', 'fill', 'stroke', 'stroke-width'],
    attributes: ['points', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<polygon points="50,10 90,90 10,90" fill="#3b82f6"/>',
  },
  {
    tag: 'path',
    commonAttributes: ['d', 'fill', 'stroke', 'stroke-width', 'fill-rule'],
    attributes: ['d', 'pathLength', 'fill-rule', 'clip-rule', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<path d="M10 80 Q 50 10 90 80 Z" fill="#3b82f6"/>',
  },
  {
    tag: 'text',
    commonAttributes: ['x', 'y', 'fill', 'font-size', 'font-family', 'text-anchor'],
    attributes: [
      'x',
      'y',
      'dx',
      'dy',
      'rotate',
      'textLength',
      'lengthAdjust',
      'font-size',
      'font-family',
      'font-weight',
      'text-anchor',
      'dominant-baseline',
      ...GLOBAL_ATTRIBUTES,
    ],
    children: ['tspan', 'textPath'],
    snippet: '<text x="50" y="55" text-anchor="middle" fill="#e8eaed">Label</text>',
  },
  {
    tag: 'tspan',
    commonAttributes: ['x', 'y', 'dx', 'dy', 'fill'],
    attributes: ['x', 'y', 'dx', 'dy', 'rotate', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<tspan x="50" dy="1.2em">Line</tspan>',
  },
  {
    tag: 'textPath',
    commonAttributes: ['href', 'startOffset', 'fill'],
    attributes: ['href', 'startOffset', 'method', 'spacing', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<textPath href="#my-path">Text on path</textPath>',
  },
  {
    tag: 'defs',
    commonAttributes: ['id'],
    attributes: ['id', ...GLOBAL_ATTRIBUTES],
    children: [...DEFS_CHILDREN],
    snippet: '<defs></defs>',
  },
  {
    tag: 'use',
    commonAttributes: ['href', 'x', 'y', 'width', 'height', 'fill'],
    attributes: ['href', 'x', 'y', 'width', 'height', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<use href="#symbol-id" x="0" y="0"/>',
  },
  {
    tag: 'symbol',
    commonAttributes: ['id', 'viewBox', 'width', 'height'],
    attributes: ['id', 'viewBox', 'width', 'height', 'preserveAspectRatio', ...GLOBAL_ATTRIBUTES],
    children: [...GRAPHICAL_CHILDREN],
    snippet:
      '<symbol id="icon" viewBox="0 0 100 100"></symbol>',
  },
  {
    tag: 'linearGradient',
    commonAttributes: ['id', 'x1', 'y1', 'x2', 'y2', 'gradientUnits'],
    attributes: [
      'id',
      'x1',
      'y1',
      'x2',
      'y2',
      'gradientUnits',
      'gradientTransform',
      'spreadMethod',
      'href',
      ...GLOBAL_ATTRIBUTES,
    ],
    children: [...GRADIENT_CHILDREN],
    snippet: '<linearGradient></linearGradient>',
  },
  {
    tag: 'radialGradient',
    commonAttributes: ['id', 'cx', 'cy', 'r', 'fx', 'fy'],
    attributes: [
      'id',
      'cx',
      'cy',
      'r',
      'fx',
      'fy',
      'gradientUnits',
      'gradientTransform',
      'spreadMethod',
      'href',
      ...GLOBAL_ATTRIBUTES,
    ],
    children: [...GRADIENT_CHILDREN],
    snippet: '<radialGradient></radialGradient>',
  },
  {
    tag: 'stop',
    commonAttributes: ['offset', 'stop-color', 'stop-opacity'],
    attributes: ['offset', 'stop-color', 'stop-opacity', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<stop offset="50%" stop-color="#3b82f6"/>',
  },
  {
    tag: 'clipPath',
    commonAttributes: ['id', 'clipPathUnits'],
    attributes: ['id', 'clipPathUnits', ...GLOBAL_ATTRIBUTES],
    children: [...GRAPHICAL_CHILDREN],
    snippet: '<clipPath></clipPath>',
  },
  {
    tag: 'mask',
    commonAttributes: ['id', 'x', 'y', 'width', 'height', 'maskUnits'],
    attributes: [
      'id',
      'x',
      'y',
      'width',
      'height',
      'maskUnits',
      'maskContentUnits',
      ...GLOBAL_ATTRIBUTES,
    ],
    children: [...GRAPHICAL_CHILDREN],
    snippet: '<mask></mask>',
  },
  {
    tag: 'filter',
    commonAttributes: ['id', 'x', 'y', 'width', 'height', 'filterUnits'],
    attributes: [
      'id',
      'x',
      'y',
      'width',
      'height',
      'filterUnits',
      'primitiveUnits',
      'href',
      ...GLOBAL_ATTRIBUTES,
    ],
    children: [...FILTER_PRIMITIVE_CHILDREN],
    snippet: '<filter id="filter-id"><feGaussianBlur stdDeviation="3"/></filter>',
  },
  {
    tag: 'image',
    commonAttributes: ['href', 'x', 'y', 'width', 'height', 'preserveAspectRatio'],
    attributes: ['href', 'x', 'y', 'width', 'height', 'preserveAspectRatio', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet:
      '<image href="" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet"/>',
  },
  feElement(
    'feBlend',
    ['mode', 'in', 'in2', 'result'],
    [],
    [],
    '<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImage" result="blend"/>',
  ),
  feElement(
    'feColorMatrix',
    ['in', 'type', 'values', 'result'],
    [],
    [],
    '<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="colorMatrix"/>',
  ),
  feElement(
    'feComponentTransfer',
    ['in', 'result'],
    [],
    [...FE_FUNC_CHILDREN],
    '<feComponentTransfer in="SourceGraphic" result="transfer"><feFuncR type="identity"/></feComponentTransfer>',
  ),
  feElement(
    'feComposite',
    ['in', 'in2', 'operator', 'result'],
    ['k1', 'k2', 'k3', 'k4'],
    [],
    '<feComposite in="SourceGraphic" in2="BackgroundImage" operator="over" result="composite"/>',
  ),
  feElement(
    'feConvolveMatrix',
    ['in', 'order', 'kernelMatrix', 'result'],
    ['divisor', 'bias', 'targetX', 'targetY', 'edgeMode', 'kernelUnitLength', 'preserveAlpha'],
    [],
    '<feConvolveMatrix in="SourceGraphic" order="3" kernelMatrix="0 0 0  0 1 0  0 0 0" result="convolve"/>',
  ),
  feElement(
    'feDiffuseLighting',
    ['in', 'surfaceScale', 'diffuseConstant', 'lighting-color', 'result'],
    [],
    [...FE_LIGHT_CHILDREN],
    '<feDiffuseLighting in="SourceAlpha" surfaceScale="1" diffuseConstant="1" lighting-color="#ffffff" result="diffuse"><feDistantLight azimuth="45" elevation="45"/></feDiffuseLighting>',
  ),
  feElement(
    'feDisplacementMap',
    ['in', 'in2', 'scale', 'xChannelSelector', 'yChannelSelector', 'result'],
    [],
    [],
    '<feDisplacementMap in="SourceGraphic" in2="SourceGraphic" scale="10" xChannelSelector="R" yChannelSelector="G" result="displacement"/>',
  ),
  feElement(
    'feDropShadow',
    ['dx', 'dy', 'stdDeviation', 'flood-color', 'flood-opacity', 'in', 'result'],
    [],
    [],
    '<feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.5" in="SourceGraphic" result="dropShadow"/>',
  ),
  feElement(
    'feFlood',
    ['flood-color', 'flood-opacity', 'result'],
    [],
    [],
    '<feFlood flood-color="#3b82f6" flood-opacity="1" result="flood"/>',
  ),
  feElement(
    'feGaussianBlur',
    ['in', 'stdDeviation', 'edgeMode', 'result'],
    [],
    [],
    '<feGaussianBlur in="SourceGraphic" stdDeviation="3" edgeMode="none" result="blur"/>',
  ),
  feElement(
    'feImage',
    ['href', 'preserveAspectRatio', 'result'],
    ['crossorigin'],
    [],
    '<feImage href="" preserveAspectRatio="xMidYMid meet" result="image"/>',
  ),
  feElement('feMerge', ['result'], [], ['feMergeNode'], '<feMerge result="merge"><feMergeNode in="SourceGraphic"/></feMerge>'),
  feElement('feMergeNode', ['in'], [], [], '<feMergeNode in="SourceGraphic"/>'),
  feElement(
    'feMorphology',
    ['in', 'operator', 'radius', 'result'],
    [],
    [],
    '<feMorphology in="SourceAlpha" operator="dilate" radius="2" result="morphology"/>',
  ),
  feElement(
    'feOffset',
    ['in', 'dx', 'dy', 'result'],
    [],
    [],
    '<feOffset in="SourceGraphic" dx="5" dy="5" result="offset"/>',
  ),
  feElement(
    'feSpecularLighting',
    ['in', 'surfaceScale', 'specularConstant', 'specularExponent', 'lighting-color', 'result'],
    [],
    [...FE_LIGHT_CHILDREN],
    '<feSpecularLighting in="SourceAlpha" surfaceScale="1" specularConstant="1" specularExponent="20" lighting-color="#ffffff" result="specular"><fePointLight x="50" y="50" z="200"/></feSpecularLighting>',
  ),
  feElement('feTile', ['in', 'result'], [], [], '<feTile in="SourceGraphic" result="tile"/>'),
  feElement(
    'feTurbulence',
    ['baseFrequency', 'numOctaves', 'seed', 'stitchTiles', 'type', 'result'],
    [],
    [],
    '<feTurbulence baseFrequency="0.05" numOctaves="2" seed="0" stitchTiles="noStitch" type="fractalNoise" result="turbulence"/>',
  ),
  feElement(
    'feFuncR',
    ['type', 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'offset'],
    [],
    [],
    '<feFuncR type="identity"/>',
  ),
  feElement(
    'feFuncG',
    ['type', 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'offset'],
    [],
    [],
    '<feFuncG type="identity"/>',
  ),
  feElement(
    'feFuncB',
    ['type', 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'offset'],
    [],
    [],
    '<feFuncB type="identity"/>',
  ),
  feElement(
    'feFuncA',
    ['type', 'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'offset'],
    [],
    [],
    '<feFuncA type="identity"/>',
  ),
  feElement(
    'feDistantLight',
    ['azimuth', 'elevation'],
    [],
    [],
    '<feDistantLight azimuth="45" elevation="45"/>',
  ),
  feElement('fePointLight', ['x', 'y', 'z'], [], [], '<fePointLight x="50" y="50" z="200"/>'),
  feElement(
    'feSpotLight',
    ['x', 'y', 'z', 'pointsAtX', 'pointsAtY', 'pointsAtZ', 'specularExponent', 'limitingConeAngle'],
    [],
    [],
    '<feSpotLight x="50" y="50" z="200" pointsAtX="50" pointsAtY="50" pointsAtZ="0" specularExponent="20"/>',
  ),
]

export function normalizeTagName(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  const colon = trimmed.indexOf(':')
  return colon >= 0 ? trimmed.slice(colon + 1) : trimmed
}

const schemaByTag = new Map(SVG_ELEMENTS.map((entry) => [normalizeTagName(entry.tag), entry]))

const VIEWBOX_NUMERIC_ATTRS = new Set([
  'x',
  'y',
  'width',
  'height',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x1',
  'y1',
  'x2',
  'y2',
  'fx',
  'fy',
  'dx',
  'dy',
])

const DEFAULT_ATTR_VALUES: Record<string, string> = {
  fill: '#3b82f6',
  stroke: '#000000',
  'stroke-width': '2',
  opacity: '0.8',
  xmlns: 'http://www.w3.org/2000/svg',
  href: '#id',
  id: 'id',
  offset: '50%',
  'stop-color': '#3b82f6',
  'font-size': '16',
  'text-anchor': 'middle',
  in: 'SourceGraphic',
  in2: 'BackgroundImage',
  result: 'result',
  mode: 'normal',
  operator: 'over',
  type: 'identity',
  stdDeviation: '3',
  'flood-color': '#3b82f6',
  'flood-opacity': '1',
  'lighting-color': '#ffffff',
  baseFrequency: '0.05',
  numOctaves: '2',
  seed: '0',
  stitchTiles: 'noStitch',
  edgeMode: 'none',
  scale: '10',
  xChannelSelector: 'R',
  yChannelSelector: 'G',
  filterUnits: 'objectBoundingBox',
  primitiveUnits: 'userSpaceOnUse',
  surfaceScale: '1',
  diffuseConstant: '1',
  specularConstant: '1',
  specularExponent: '20',
  preserveAspectRatio: 'xMidYMid meet',
  values:
    '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0',
  order: '3',
  kernelMatrix: '0 0 0  0 1 0  0 0 0',
  radius: '2',
  azimuth: '45',
  elevation: '45',
  z: '200',
  pointsAtX: '50',
  pointsAtY: '50',
  pointsAtZ: '0',
  slope: '1',
  intercept: '0',
  amplitude: '1',
  exponent: '1',
}

export function getElementSchema(tagName: string): SvgElementSchema | null {
  return schemaByTag.get(normalizeTagName(tagName)) ?? null
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function viewBoxValueForAttribute(name: string, viewBox: ViewBox): string | null {
  if (!VIEWBOX_NUMERIC_ATTRS.has(name) && name !== 'points' && name !== 'd' && name !== 'viewBox') {
    return null
  }

  const { minX, minY, width, height } = viewBox
  const maxX = minX + width
  const maxY = minY + height
  const midX = minX + width / 2
  const midY = minY + height / 2
  const insetX = minX + width * 0.1
  const insetY = minY + height * 0.1
  const outerX = minX + width * 0.9
  const outerY = minY + height * 0.9
  const quarter = Math.min(width, height) / 4

  switch (name) {
    case 'viewBox':
      return `${formatNumber(minX)} ${formatNumber(minY)} ${formatNumber(width)} ${formatNumber(height)}`
    case 'x':
    case 'x1':
      return formatNumber(insetX)
    case 'x2':
      return formatNumber(outerX)
    case 'y':
    case 'y1':
      return formatNumber(insetY)
    case 'y2':
      return formatNumber(outerY)
    case 'width':
      return formatNumber(width)
    case 'height':
      return formatNumber(height)
    case 'cx':
    case 'fx':
      return formatNumber(clamp(midX, minX, maxX))
    case 'cy':
    case 'fy':
      return formatNumber(clamp(midY, minY, maxY))
    case 'r':
      return formatNumber(clamp(quarter, 0, Math.min(width, height) / 2))
    case 'rx':
      return formatNumber(clamp(width / 4, 0, width / 2))
    case 'ry':
      return formatNumber(clamp(height / 4, 0, height / 2))
    case 'dx':
    case 'dy':
      return formatNumber(Math.min(width, height) / 10)
    case 'points':
      return `${formatNumber(insetX)},${formatNumber(outerY)} ${formatNumber(midX)},${formatNumber(insetY)} ${formatNumber(outerX)},${formatNumber(outerY)}`
    case 'd':
      return `M ${formatNumber(insetX)} ${formatNumber(outerY)} Q ${formatNumber(midX)} ${formatNumber(insetY)} ${formatNumber(outerX)} ${formatNumber(outerY)} Z`
    default:
      return null
  }
}

export function parseViewBoxFromContent(content: string): ViewBox {
  const svgOpen = content.match(/<svg\b[^>]*>/i)?.[0]
  if (!svgOpen) return DEFAULT_VIEWBOX

  const viewBoxMatch = svgOpen.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1]
      .trim()
      .split(/[\s,]+/)
      .map((part) => Number(part))
    if (parts.length === 4 && parts.every((part) => Number.isFinite(part))) {
      return {
        minX: parts[0],
        minY: parts[1],
        width: Math.max(0, parts[2]),
        height: Math.max(0, parts[3]),
      }
    }
  }

  const widthMatch = svgOpen.match(/\bwidth\s*=\s*["']([^"']+)["']/i)
  const heightMatch = svgOpen.match(/\bheight\s*=\s*["']([^"']+)["']/i)
  const width = widthMatch ? Number.parseFloat(widthMatch[1]) : Number.NaN
  const height = heightMatch ? Number.parseFloat(heightMatch[1]) : Number.NaN
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { minX: 0, minY: 0, width, height }
  }

  return DEFAULT_VIEWBOX
}

export function defaultAttributeValue(name: string, viewBox: ViewBox = DEFAULT_VIEWBOX): string {
  const viewBoxValue = viewBoxValueForAttribute(name, viewBox)
  if (viewBoxValue != null) return viewBoxValue
  return DEFAULT_ATTR_VALUES[name] ?? '...'
}

function applyViewBoxToSnippet(snippet: string, tagName: string, viewBox: ViewBox): string {
  const schema = getElementSchema(tagName)
  if (!schema) return snippet

  let result = snippet
  for (const attr of [...schema.commonAttributes, ...schema.attributes]) {
    const value = defaultAttributeValue(attr, viewBox)
    if (value === '...') continue
    const escaped = attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`(\\b${escaped}\\s*=\\s*")([^"]*)(")`, 'i'), `$1${value}$3`)
    result = result.replace(new RegExp(`(\\b${escaped}\\s*=\\s*')([^']*)(')`, 'i'), `$1${value}$3`)
  }
  return result
}

export function getSnippetForTag(tagName: string, viewBox: ViewBox = DEFAULT_VIEWBOX): string {
  const schema = getElementSchema(tagName)
  if (!schema) return `<${normalizeTagName(tagName)}/>`
  return applyViewBoxToSnippet(schema.snippet, tagName, viewBox)
}

export function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

export function formatPathSegment(segment: { tag: string; index: number }): string {
  return segment.index === 0 ? segment.tag : `${segment.tag}[${segment.index}]`
}
