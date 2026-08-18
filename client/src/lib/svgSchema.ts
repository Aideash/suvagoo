export interface ViewBox {
  minX: number
  minY: number
  width: number
  height: number
}

/**
 * What an element is allowed to hold, which decides its bare form:
 * `empty` writes `<path/>`, the other two write `<text></text>`.
 */
export type SvgContentModel = 'empty' | 'container' | 'text'

/** Tag-only inserts a bare element; pre-filled inserts a worked example. */
export type SnippetMode = 'tag-only' | 'pre-filled'

export interface SvgElementSchema {
  /** Tag name in its canonical casing, without namespace prefix. */
  tag: string
  contentModel: SvgContentModel
  /** Shown first when not filtering; capped by COMMON_LIMIT in the UI. */
  commonAttributes: readonly string[]
  /** Full attribute list for search / "more" section. */
  attributes: readonly string[]
  /** Allowed child element tags; empty means text-only or leaf. */
  children: readonly string[]
  /** Snippet inserted in pre-filled mode. */
  snippet: string
}

export const EXPLORER_COMMON_LIMIT = 10
export const DEFAULT_SNIPPET_MODE: SnippetMode = 'tag-only'
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
  'marker-start',
  'marker-mid',
  'marker-end',
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

/** SMIL elements, which attach to whatever element they animate. */
export const ANIMATION_ELEMENTS = ['animate', 'set', 'animateTransform', 'animateMotion'] as const

/**
 * Elements an animation element can be attached to. Kept apart from each
 * schema's `children` so the structural children stay readable, and joined in
 * when the lookup map is built.
 */
const ANIMATABLE_TAGS = [
  'svg',
  'g',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'path',
  'text',
  'tspan',
  'textPath',
  'use',
  'image',
  'symbol',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
  'marker',
] as const

/** Timing attributes every animation element shares. */
const ANIMATION_TIMING_ATTRIBUTES = [
  'dur',
  'begin',
  'end',
  'repeatCount',
  'repeatDur',
  'restart',
  'fill',
] as const

/** Interpolation attributes shared by everything except `set`. */
const ANIMATION_VALUE_ATTRIBUTES = [
  'calcMode',
  'keyTimes',
  'keySplines',
  'additive',
  'accumulate',
] as const

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
const FE_STD_ATTRIBUTES = [
  'x',
  'y',
  'width',
  'height',
  'result',
  'color-interpolation-filters',
] as const

function feElement(
  tag: string,
  commonAttributes: readonly string[],
  extraAttributes: readonly string[],
  children: readonly string[],
  snippet: string,
): SvgElementSchema {
  return {
    tag,
    // Every filter primitive is either a leaf or holds only elements.
    contentModel: children.length ? 'container' : 'empty',
    commonAttributes,
    attributes: [
      ...commonAttributes,
      ...extraAttributes,
      ...FE_STD_ATTRIBUTES,
      ...GLOBAL_ATTRIBUTES,
    ],
    children,
    snippet,
  }
}

const SVG_ELEMENTS: SvgElementSchema[] = [
  {
    tag: 'svg',
    contentModel: 'container',
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
    snippet: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="25" fill="#3b82f6"/>
</svg>`,
  },
  {
    tag: 'g',
    contentModel: 'container',
    commonAttributes: ['transform', 'fill', 'stroke', 'opacity', 'clip-path'],
    attributes: [...GLOBAL_ATTRIBUTES],
    children: [...GRAPHICAL_CHILDREN],
    snippet: `<g fill="#3b82f6">
  <circle cx="50" cy="50" r="25"/>
</g>`,
  },
  {
    tag: 'rect',
    contentModel: 'empty',
    commonAttributes: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke'],
    attributes: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill-rule', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<rect x="0" y="0" width="100" height="100" fill="#3b82f6"/>',
  },
  {
    tag: 'circle',
    contentModel: 'empty',
    commonAttributes: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width'],
    attributes: ['cx', 'cy', 'r', 'fill-rule', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<circle cx="50" cy="50" r="25" fill="#3b82f6"/>',
  },
  {
    tag: 'ellipse',
    contentModel: 'empty',
    commonAttributes: ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke'],
    attributes: ['cx', 'cy', 'rx', 'ry', 'fill-rule', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<ellipse cx="50" cy="50" rx="40" ry="25" fill="#3b82f6"/>',
  },
  {
    tag: 'line',
    contentModel: 'empty',
    commonAttributes: ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width'],
    attributes: ['x1', 'y1', 'x2', 'y2', 'fill-rule', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<line x1="10" y1="10" x2="90" y2="90" stroke="#3b82f6" stroke-width="2"/>',
  },
  {
    tag: 'polyline',
    contentModel: 'empty',
    commonAttributes: ['points', 'fill', 'stroke', 'stroke-width', 'fill-rule'],
    attributes: ['points', 'fill-rule', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<polyline points="10,80 50,20 90,80" fill="none" stroke="#3b82f6" stroke-width="2"/>',
  },
  {
    tag: 'polygon',
    contentModel: 'empty',
    commonAttributes: ['points', 'fill', 'stroke', 'stroke-width', 'fill-rule'],
    attributes: ['points', 'fill-rule', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<polygon points="50,10 90,90 10,90" fill="#3b82f6"/>',
  },
  {
    tag: 'path',
    contentModel: 'empty',
    commonAttributes: ['d', 'fill', 'stroke', 'stroke-width', 'fill-rule'],
    attributes: ['d', 'pathLength', 'fill-rule', 'clip-rule', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<path d="M10 80 Q 50 10 90 80 Z" fill="#3b82f6"/>',
  },
  {
    tag: 'text',
    contentModel: 'text',
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
      'fill-rule',
      ...GLOBAL_ATTRIBUTES,
    ],
    children: ['tspan', 'textPath'],
    snippet: '<text x="50" y="55" text-anchor="middle" fill="#e8eaed">Label</text>',
  },
  {
    tag: 'tspan',
    contentModel: 'text',
    commonAttributes: ['x', 'y', 'dx', 'dy', 'fill'],
    attributes: ['x', 'y', 'dx', 'dy', 'rotate', 'fill-rule', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<tspan x="50" dy="1.2em">Line</tspan>',
  },
  {
    tag: 'textPath',
    contentModel: 'text',
    commonAttributes: ['href', 'startOffset', 'fill'],
    attributes: ['href', 'startOffset', 'method', 'spacing', 'fill-rule', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<textPath href="#my-path">Text on path</textPath>',
  },
  {
    tag: 'defs',
    contentModel: 'container',
    commonAttributes: ['id'],
    attributes: ['id', ...GLOBAL_ATTRIBUTES],
    children: [...DEFS_CHILDREN],
    snippet: `<defs>
  <linearGradient id="gradient-id" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0">
    <stop offset="0%" stop-color="#3b82f6"/>
    <stop offset="100%" stop-color="#8b5cf6"/>
  </linearGradient>
</defs>`,
  },
  {
    tag: 'use',
    contentModel: 'empty',
    commonAttributes: ['href', 'x', 'y', 'width', 'height', 'fill'],
    attributes: ['href', 'x', 'y', 'width', 'height', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<use href="#symbol-id" x="0" y="0"/>',
  },
  {
    tag: 'symbol',
    contentModel: 'container',
    commonAttributes: ['id', 'viewBox', 'width', 'height'],
    attributes: ['id', 'viewBox', 'width', 'height', 'preserveAspectRatio', ...GLOBAL_ATTRIBUTES],
    children: [...GRAPHICAL_CHILDREN],
    snippet: `<symbol id="symbol-id" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="25" fill="#3b82f6"/>
</symbol>`,
  },
  {
    tag: 'linearGradient',
    contentModel: 'container',
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
    // Stops need a gradient vector, and userSpaceOnUse keeps it in viewBox units.
    snippet: `<linearGradient id="gradient-id" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0">
  <stop offset="0%" stop-color="#3b82f6"/>
  <stop offset="100%" stop-color="#8b5cf6"/>
</linearGradient>`,
  },
  {
    tag: 'radialGradient',
    contentModel: 'container',
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
    snippet: `<radialGradient id="gradient-id" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="25">
  <stop offset="0%" stop-color="#3b82f6"/>
  <stop offset="100%" stop-color="#8b5cf6"/>
</radialGradient>`,
  },
  {
    tag: 'stop',
    contentModel: 'empty',
    commonAttributes: ['offset', 'stop-color', 'stop-opacity'],
    attributes: ['offset', 'stop-color', 'stop-opacity', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet: '<stop offset="50%" stop-color="#3b82f6"/>',
  },
  {
    tag: 'clipPath',
    contentModel: 'container',
    commonAttributes: ['id', 'clipPathUnits'],
    attributes: ['id', 'clipPathUnits', ...GLOBAL_ATTRIBUTES],
    children: [...GRAPHICAL_CHILDREN],
    snippet: `<clipPath id="clip-id">
  <circle cx="50" cy="50" r="25"/>
</clipPath>`,
  },
  {
    tag: 'mask',
    contentModel: 'container',
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
    // White keeps the masked area fully visible; darker values fade it out.
    snippet: `<mask id="mask-id">
  <rect width="100" height="100" fill="#ffffff"/>
</mask>`,
  },
  {
    tag: 'filter',
    contentModel: 'container',
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
    snippet: `<filter id="filter-id">
  <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
</filter>`,
  },
  {
    tag: 'image',
    contentModel: 'empty',
    commonAttributes: ['href', 'x', 'y', 'width', 'height', 'preserveAspectRatio'],
    attributes: ['href', 'x', 'y', 'width', 'height', 'preserveAspectRatio', ...GLOBAL_ATTRIBUTES],
    children: [],
    snippet:
      '<image href="" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet"/>',
  },
  {
    tag: 'pattern',
    contentModel: 'container',
    commonAttributes: ['id', 'x', 'y', 'width', 'height', 'patternUnits'],
    attributes: [
      'id',
      'x',
      'y',
      'width',
      'height',
      'patternUnits',
      'patternContentUnits',
      'patternTransform',
      'viewBox',
      'preserveAspectRatio',
      'href',
      ...GLOBAL_ATTRIBUTES,
    ],
    children: [...GRAPHICAL_CHILDREN],
    snippet: `<pattern id="pattern-id" patternUnits="userSpaceOnUse" width="100" height="100">
  <circle cx="50" cy="50" r="25" fill="#3b82f6"/>
</pattern>`,
  },
  {
    tag: 'marker',
    contentModel: 'container',
    commonAttributes: ['id', 'markerWidth', 'markerHeight', 'refX', 'refY', 'orient'],
    attributes: [
      'id',
      'markerWidth',
      'markerHeight',
      'refX',
      'refY',
      'orient',
      'markerUnits',
      'viewBox',
      'preserveAspectRatio',
      'overflow',
      ...GLOBAL_ATTRIBUTES,
    ],
    children: [...GRAPHICAL_CHILDREN],
    // The viewBox lets the arrow be drawn in document units and scaled down to
    // markerWidth/markerHeight, which are measured in stroke widths.
    snippet: `<marker id="marker-id" viewBox="0 0 100 100" markerWidth="10" markerHeight="10" refX="50" refY="50" orient="auto">
  <polygon points="10,90 50,10 90,90" fill="#3b82f6"/>
</marker>`,
  },
  {
    tag: 'foreignObject',
    contentModel: 'container',
    commonAttributes: ['x', 'y', 'width', 'height'],
    attributes: ['x', 'y', 'width', 'height', ...GLOBAL_ATTRIBUTES],
    // Holds HTML rather than SVG, so the explorer offers no child elements.
    children: [],
    snippet: `<foreignObject width="100" height="100">
  <div xmlns="http://www.w3.org/1999/xhtml">Text</div>
</foreignObject>`,
  },
  {
    tag: 'animate',
    contentModel: 'empty',
    // No global attributes: `fill` here means freeze/remove, and paint has no
    // meaning on a timing element.
    commonAttributes: ['attributeName', 'from', 'to', 'dur', 'begin', 'repeatCount', 'fill'],
    attributes: [
      'attributeName',
      'from',
      'to',
      'by',
      'values',
      ...ANIMATION_TIMING_ATTRIBUTES,
      ...ANIMATION_VALUE_ATTRIBUTES,
      'id',
    ],
    children: [],
    snippet: '<animate attributeName="opacity" from="1" to="0" dur="1s" repeatCount="indefinite"/>',
  },
  {
    tag: 'set',
    contentModel: 'empty',
    // A step change rather than an interpolation, so no from/by/calcMode.
    commonAttributes: ['attributeName', 'to', 'begin', 'dur', 'fill'],
    attributes: ['attributeName', 'to', ...ANIMATION_TIMING_ATTRIBUTES, 'id'],
    children: [],
    snippet: '<set attributeName="fill" to="#ef4444" begin="1s" fill="freeze"/>',
  },
  {
    tag: 'animateTransform',
    contentModel: 'empty',
    commonAttributes: ['attributeName', 'type', 'from', 'to', 'dur', 'repeatCount'],
    attributes: [
      'attributeName',
      'type',
      'from',
      'to',
      'by',
      'values',
      ...ANIMATION_TIMING_ATTRIBUTES,
      ...ANIMATION_VALUE_ATTRIBUTES,
      'id',
    ],
    children: [],
    // The rotation centre in from/to is rewritten to the document's midpoint
    // when the snippet is inserted.
    snippet:
      '<animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="2s" repeatCount="indefinite"/>',
  },
  {
    tag: 'animateMotion',
    contentModel: 'container',
    commonAttributes: ['path', 'dur', 'begin', 'repeatCount', 'rotate', 'fill'],
    attributes: [
      'path',
      'rotate',
      'keyPoints',
      ...ANIMATION_TIMING_ATTRIBUTES,
      ...ANIMATION_VALUE_ATTRIBUTES,
      'id',
    ],
    children: ['mpath'],
    snippet: '<animateMotion dur="3s" repeatCount="indefinite" path="M 0 0 L 40 0"/>',
  },
  {
    tag: 'mpath',
    contentModel: 'empty',
    commonAttributes: ['href'],
    attributes: ['href', 'id'],
    children: [],
    snippet: '<mpath href="#path-id"/>',
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
    `<feComponentTransfer in="SourceGraphic" result="transfer">
  <feFuncR type="identity"/>
</feComponentTransfer>`,
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
    `<feDiffuseLighting in="SourceAlpha" surfaceScale="1" diffuseConstant="1" lighting-color="#ffffff" result="diffuse">
  <feDistantLight azimuth="45" elevation="45"/>
</feDiffuseLighting>`,
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
  feElement(
    'feMerge',
    ['result'],
    [],
    ['feMergeNode'],
    `<feMerge result="merge">
  <feMergeNode in="SourceGraphic"/>
</feMerge>`,
  ),
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
    `<feSpecularLighting in="SourceAlpha" surfaceScale="1" specularConstant="1" specularExponent="20" lighting-color="#ffffff" result="specular">
  <fePointLight x="50" y="50" z="200"/>
</feSpecularLighting>`,
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

const ANIMATION_TAG_SET = new Set(ANIMATION_ELEMENTS.map(normalizeTagName))

export function isAnimationTag(tag: string): boolean {
  return ANIMATION_TAG_SET.has(normalizeTagName(tag))
}

const ANIMATABLE_TAG_SET = new Set(ANIMATABLE_TAGS.map(normalizeTagName))

function withAnimationChildren(schema: SvgElementSchema): SvgElementSchema {
  if (!ANIMATABLE_TAG_SET.has(normalizeTagName(schema.tag))) return schema
  return { ...schema, children: [...schema.children, ...ANIMATION_ELEMENTS] }
}

const schemaByTag = new Map(
  SVG_ELEMENTS.map((entry) => [normalizeTagName(entry.tag), withAnimationChildren(entry)]),
)

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
  transform: 'none',
  gradientTransform: 'none',
  patternTransform: 'none',
  filter: 'none',
  fill: '#3b82f6',
  stroke: '#000000',
  'stroke-width': '2',
  'fill-rule': 'nonzero',
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
  gradientUnits: 'userSpaceOnUse',
  clipPathUnits: 'userSpaceOnUse',
  maskUnits: 'userSpaceOnUse',
  patternUnits: 'userSpaceOnUse',
  spreadMethod: 'pad',
  markerWidth: '3',
  markerHeight: '3',
  markerUnits: 'strokeWidth',
  orient: 'auto',
  refX: '0',
  refY: '0',
  surfaceScale: '1',
  diffuseConstant: '1',
  specularConstant: '1',
  specularExponent: '20',
  preserveAspectRatio: 'xMidYMid meet',
  values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0',
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

/** Elements whose x/y is an anchor point rather than a top-left corner. */
const ANCHORED_POSITION_TAGS = new Set(['text', 'tspan', 'textPath', 'fePointLight', 'feSpotLight'])

export function viewBoxValueForAttribute(
  name: string,
  viewBox: ViewBox,
  tag?: string,
): string | null {
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
  const anchored = tag ? ANCHORED_POSITION_TAGS.has(normalizeTagName(tag)) : false

  switch (name) {
    case 'viewBox':
      return formatViewBoxValue(viewBox)
    case 'x':
      return formatNumber(anchored ? midX : insetX)
    case 'x1':
      return formatNumber(insetX)
    case 'x2':
      return formatNumber(outerX)
    case 'y':
      return formatNumber(anchored ? midY : insetY)
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

/** Parse a viewBox attribute value (`min-x min-y width height`). */
export function parseViewBoxValue(value: string): ViewBox | null {
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((part) => Number(part))
  if (parts.length !== 4 || !parts.every((part) => Number.isFinite(part))) return null
  return {
    minX: parts[0],
    minY: parts[1],
    width: Math.max(0, parts[2]),
    height: Math.max(0, parts[3]),
  }
}

export function formatViewBoxValue(viewBox: ViewBox): string {
  return `${formatNumber(viewBox.minX)} ${formatNumber(viewBox.minY)} ${formatNumber(viewBox.width)} ${formatNumber(viewBox.height)}`
}

export function parseViewBoxFromContent(content: string): ViewBox {
  const svgOpen = content.match(/<svg\b[^>]*>/i)?.[0]
  if (!svgOpen) return DEFAULT_VIEWBOX

  const viewBoxMatch = svgOpen.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)
  if (viewBoxMatch) {
    const parsed = parseViewBoxValue(viewBoxMatch[1])
    if (parsed) return parsed
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

const ANIMATION_ATTR_DEFAULTS: Record<string, string> = {
  attributeName: 'opacity',
  from: '1',
  to: '0',
  by: '1',
  values: '1;0',
  dur: '1s',
  begin: '0s',
  end: '2s',
  repeatCount: 'indefinite',
  repeatDur: 'indefinite',
  // On a timing element `fill` decides what happens after the run, not paint.
  fill: 'freeze',
  restart: 'always',
  calcMode: 'linear',
  keyTimes: '0;1',
  keySplines: '0.4 0 0.2 1',
  keyPoints: '0;1',
  additive: 'replace',
  accumulate: 'none',
  rotate: 'auto',
  type: 'rotate',
}

/**
 * Animation attributes that read better when sized to the document: a rotation
 * needs a centre, and a motion path needs somewhere to go.
 */
function animationValueForAttribute(name: string, viewBox: ViewBox, tag: string): string | null {
  const { minX, minY, width, height } = viewBox
  const midX = formatNumber(minX + width / 2)
  const midY = formatNumber(minY + height / 2)

  if (normalizeTagName(tag) === 'animatetransform') {
    if (name === 'from') return `0 ${midX} ${midY}`
    if (name === 'to') return `360 ${midX} ${midY}`
    if (name === 'attributeName') return 'transform'
  }

  if (normalizeTagName(tag) === 'animatemotion' && name === 'path') {
    const startX = formatNumber(minX + width * 0.1)
    const endX = formatNumber(minX + width * 0.9)
    return `M ${startX} ${midY} L ${endX} ${midY}`
  }

  return null
}

export function defaultAttributeValue(
  name: string,
  viewBox: ViewBox = DEFAULT_VIEWBOX,
  tag?: string,
): string {
  // Checked ahead of the shared table because several names mean something
  // different here: `fill` is freeze/remove, `values` is a keyframe list.
  if (tag && isAnimationTag(tag)) {
    const animated = animationValueForAttribute(name, viewBox, tag)
    if (animated != null) return animated
    const fallback = ANIMATION_ATTR_DEFAULTS[name]
    if (fallback != null) return fallback
  }

  const viewBoxValue = viewBoxValueForAttribute(name, viewBox, tag)
  if (viewBoxValue != null) return viewBoxValue
  return DEFAULT_ATTR_VALUES[name] ?? '...'
}

const OPEN_TAG = /<([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g
const ATTRIBUTE = /([A-Za-z][\w:.-]*)(\s*=\s*)(["'])([^"']*)\3/g

/**
 * Rescale a snippet's geometry to the document's viewBox. Every tag in the
 * snippet is handled against its own schema, so nested example children land in
 * the same coordinate space as the element they sit in. Values that carry no
 * geometry (ids, colours, enumerations) are left as authored.
 */
function applyViewBoxToSnippet(snippet: string, viewBox: ViewBox): string {
  return snippet.replace(OPEN_TAG, (tag, tagName: string, attrs: string, selfClosing: string) => {
    const schema = getElementSchema(tagName)
    if (!schema) return tag

    const known = new Set([...schema.commonAttributes, ...schema.attributes])
    const scaled = attrs.replace(ATTRIBUTE, (attr, name: string, eq, quote) => {
      if (!known.has(name)) return attr
      const scaledValue = isAnimationTag(tagName)
        ? animationValueForAttribute(name, viewBox, tagName)
        : viewBoxValueForAttribute(name, viewBox, tagName)
      return scaledValue == null ? attr : `${name}${eq}${quote}${scaledValue}${quote}`
    })
    return `<${tagName}${scaled}${selfClosing}>`
  })
}

function bareTag(tag: string, contentModel: SvgContentModel): string {
  return contentModel === 'empty' ? `<${tag}/>` : `<${tag}></${tag}>`
}

export function getSnippetForTag(
  tagName: string,
  viewBox: ViewBox = DEFAULT_VIEWBOX,
  mode: SnippetMode = DEFAULT_SNIPPET_MODE,
): string {
  const schema = getElementSchema(tagName)
  if (!schema) return bareTag(tagName.trim(), 'empty')
  if (mode === 'tag-only') return bareTag(schema.tag, schema.contentModel)
  return applyViewBoxToSnippet(schema.snippet, viewBox)
}

export function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

export function formatPathSegment(segment: { tag: string; index: number }): string {
  return segment.index === 0 ? segment.tag : `${segment.tag}[${segment.index}]`
}
