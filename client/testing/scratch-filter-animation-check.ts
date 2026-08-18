import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveAnimationTarget } from '../src/lib/animationAttribute'
import { findElementAtOffset, insertAttribute, insertChildElement } from '../src/lib/svgDocument'
import { getElementSchema, getSnippetForTag, isAnimationTag } from '../src/lib/svgSchema'

const FILTER_TAGS = [
  'filter',
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
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'feSpecularLighting',
  'feTile',
  'feTurbulence',
  'feFuncR',
  'feDistantLight',
  'fePointLight',
  'feSpotLight',
]

console.log('=== animation elements offered on each filter element ===')
for (const tag of FILTER_TAGS) {
  const children = getElementSchema(tag)?.children.filter(isAnimationTag) ?? []
  console.log(`${tag.padEnd(20)} ${children.join(', ') || '(none)'}`)
}

/** A document holding the primitive under test, with an animation inside it. */
function documentFor(primitive: string, inner: string): string {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="f">
      <${primitive}>
        ${inner}
      </${primitive}>
    </filter>
  </defs>
</svg>`
}

function offsetOfTag(content: string, tag: string): number {
  return content.indexOf(`<${tag}`) + 1
}

console.log('\n=== attributes each filter element offers an animation ===')
for (const tag of FILTER_TAGS) {
  const content = documentFor(tag, '<animate/>')
  const path = findElementAtOffset(content, offsetOfTag(content, 'animate'))?.path ?? []
  const target = resolveAnimationTarget(content, path)
  console.log(`${tag.padEnd(20)} ${target?.attributes.join(' ') ?? '(no target)'}`)
}

console.log('\n=== pre-filled snippet inserted into each filter element ===')
for (const tag of FILTER_TAGS) {
  for (const animation of ['animate', 'set']) {
    console.log(`${tag.padEnd(20)} ${getSnippetForTag(animation, undefined, 'pre-filled', tag)}`)
  }
}

console.log('\n=== insert into a document, at two viewBox scales ===')
for (const viewBox of ['0 0 100 100', '0 0 24 24']) {
  const content = `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="f">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
      <feOffset in="blur" dx="5" dy="5"/>
    </filter>
  </defs>
</svg>`

  for (const primitive of ['feGaussianBlur', 'feOffset']) {
    const inserted = insertChildElement(
      content,
      offsetOfTag(content, primitive),
      'animate',
      'pre-filled',
    )
    const line = inserted?.content.split('\n').find((row) => row.includes('<animate'))
    console.log(`${viewBox} / ${primitive.padEnd(16)} ${line?.trim() ?? '(insert refused)'}`)
  }
}

console.log('\n=== attributes added one at a time to an existing animation ===')
{
  const content = documentFor('feDisplacementMap', '<animate dur="2s"/>')
  const offset = offsetOfTag(content, 'animate')
  for (const name of ['attributeName', 'from', 'to', 'values']) {
    const result = insertAttribute(content, offset, name)
    const line = result?.content.split('\n').find((row) => row.includes('<animate'))
    console.log(`${name.padEnd(14)} ${line?.trim() ?? '(insert refused)'}`)
  }
}

console.log('\n=== a self-closing element gains a child: does the close tag match? ===')
for (const primitive of ['feGaussianBlur', 'feDisplacementMap', 'fePointLight', 'svg:circle']) {
  const content = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <${primitive} in="SourceGraphic"/>
</svg>`
  const inserted = insertChildElement(content, offsetOfTag(content, primitive), 'animate')
  const closeTag = inserted?.content.match(/<\/[A-Za-z_][\w:.-]*>/g)?.[0] ?? '(none)'
  const matches = closeTag === `</${primitive}>`
  console.log(`<${primitive}>`.padEnd(22) + `${closeTag.padEnd(22)} ${matches ? 'ok' : 'MISMATCH'}`)
}

/**
 * Filter animations only show themselves in motion, so the cases go out as a
 * document to open in a browser rather than as a rendered still.
 */
const cases: { label: string; filter: string }[] = [
  {
    label: 'feGaussianBlur / stdDeviation',
    filter: `<feGaussianBlur in="SourceGraphic" stdDeviation="0">
      <animate attributeName="stdDeviation" from="0" to="8" dur="2s" repeatCount="indefinite"/>
    </feGaussianBlur>`,
  },
  {
    label: 'feDisplacementMap / scale',
    filter: `<feTurbulence baseFrequency="0.05" numOctaves="2" seed="3" result="noise"/>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G">
      <animate attributeName="scale" from="0" to="30" dur="2s" repeatCount="indefinite"/>
    </feDisplacementMap>`,
  },
  {
    label: 'feOffset / dx',
    filter: `<feOffset in="SourceGraphic" dx="0" dy="0">
      <animate attributeName="dx" from="0" to="10" dur="2s" repeatCount="indefinite"/>
    </feOffset>`,
  },
  {
    label: 'feFlood / flood-color',
    filter: `<feFlood flood-color="#3b82f6" result="flood">
      <animate attributeName="flood-color" from="#3b82f6" to="#ef4444" dur="2s" repeatCount="indefinite"/>
    </feFlood>
    <feComposite in="flood" in2="SourceAlpha" operator="in"/>`,
  },
  {
    label: 'fePointLight / x',
    filter: `<feDiffuseLighting in="SourceAlpha" surfaceScale="2" diffuseConstant="1" lighting-color="#ffffff">
      <fePointLight x="10" y="50" z="30">
        <animate attributeName="x" from="10" to="90" dur="2s" repeatCount="indefinite"/>
      </fePointLight>
    </feDiffuseLighting>`,
  },
  {
    label: 'feFuncR / slope',
    filter: `<feComponentTransfer in="SourceGraphic">
      <feFuncR type="linear" slope="1">
        <animate attributeName="slope" from="1" to="3" dur="2s" repeatCount="indefinite"/>
      </feFuncR>
    </feComponentTransfer>`,
  },
  {
    label: 'feMorphology / radius (set)',
    filter: `<feMorphology in="SourceGraphic" operator="dilate" radius="0">
      <set attributeName="radius" to="3" begin="1s" fill="freeze"/>
    </feMorphology>`,
  },
  {
    label: 'feDistantLight / azimuth',
    filter: `<feDiffuseLighting in="SourceAlpha" surfaceScale="2" diffuseConstant="1" lighting-color="#ffffff">
      <feDistantLight azimuth="0" elevation="45">
        <animate attributeName="azimuth" from="0" to="360" dur="3s" repeatCount="indefinite"/>
      </feDistantLight>
    </feDiffuseLighting>`,
  },
]

const cell = 100
const cols = 4
const rows = Math.ceil(cases.length / cols)
const tiles = cases
  .map((item, i) => {
    const x = (i % cols) * cell
    const y = Math.floor(i / cols) * (cell + 12)
    return `<g transform="translate(${x} ${y})">
    <filter id="filter-${i}" x="-30%" y="-30%" width="160%" height="160%">
      ${item.filter}
    </filter>
    <rect width="${cell}" height="${cell}" fill="#111827"/>
    <g filter="url(#filter-${i})">
      <circle cx="50" cy="42" r="18" fill="#3b82f6"/>
      <rect x="20" y="62" width="60" height="10" rx="3" fill="#f59e0b"/>
    </g>
    <text x="2" y="${cell + 8}" font-size="6" font-family="sans-serif" fill="#e5e7eb">${item.label}</text>
  </g>`
  })
  .join('\n  ')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * cell} ${rows * (cell + 12)}" width="${cols * cell * 2}">
  <rect width="100%" height="100%" fill="#0b1120"/>
  ${tiles}
</svg>`

const out = join(import.meta.dirname, 'scratch-filter-animation-check.svg')
writeFileSync(out, svg)
console.log(`\nwrote ${out}`)
