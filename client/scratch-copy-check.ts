import { buildSvgCopy } from './src/lib/svgCopy'
import { formatSvgSource } from './src/lib/svgFormat'
import { STARTER_SVG } from './src/api/svgs'

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <!-- a
       multi-line comment -->
  <defs>
    <filter id="f"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter>
  </defs>
  <g transform="translate(10 10) scale(2)" opacity="0.5">
    <path d="M 10 10 L 90 10 L 90 90 Z" fill="none" stroke="black" stroke-width="2"/>
    <text x="10" y="50">Hello   world</text>
    <g></g>
  </g>
</svg>`

const NO_NS = `<svg viewBox="0 0 24 24"><filter id="blur"><feGaussianBlur stdDeviation="2"/></filter></svg>`

const PRESERVE = `<svg xmlns="http://www.w3.org/2000/svg"><g xml:space="preserve" id="k">  two
  lines  </g></svg>`

function show(label: string, value: string | null) {
  console.log(`\n===== ${label} =====`)
  console.log(value === null ? '<null>' : value)
}

for (const [label, source] of [
  ['sample', SAMPLE],
  ['starter', STARTER_SVG],
  ['no-namespace', NO_NS],
] as const) {
  show(`${label} single`, buildSvgCopy(source, 'single'))
  show(`${label} dataUri`, buildSvgCopy(source, 'dataUri'))
}

// A round trip through pretty must not change what single line produces.
const pretty = formatSvgSource(SAMPLE, 'pretty')!
console.log(
  '\nsingle stable across pretty:',
  buildSvgCopy(pretty, 'single') === buildSvgCopy(SAMPLE, 'single'),
)
console.log('single has no newline:', !buildSvgCopy(SAMPLE, 'single')!.includes('\n'))
console.log('dataUri has no newline:', !buildSvgCopy(SAMPLE, 'dataUri')!.includes('\n'))
console.log(
  'dataUri has no url()-breaking chars:',
  !/[()'"<>\s]/.test(buildSvgCopy(SAMPLE, 'dataUri')!.slice('data:image/svg+xml,'.length)),
)
console.log(
  'dataUri drops comments:',
  !decodeURIComponent(buildSvgCopy(SAMPLE, 'dataUri')!.slice('data:image/svg+xml,'.length)).includes(
    '<!--',
  ),
)
console.log(
  'single keeps comments:',
  buildSvgCopy(SAMPLE, 'single')!.includes('<!--'),
)

const ATTR_COMMENT = `<svg xmlns="http://www.w3.org/2000/svg"><g title="<!-- keep -->"/><!-- drop --></svg>`
const attrUri = decodeURIComponent(
  buildSvgCopy(ATTR_COMMENT, 'dataUri')!.slice('data:image/svg+xml,'.length),
)
console.log('dataUri keeps comment text in attrs:', attrUri.includes('title="<!-- keep -->"'))
console.log('dataUri drops markup comments:', !attrUri.includes('<!-- drop -->'))

show('preserve single', buildSvgCopy(PRESERVE, 'single'))
console.log('preserve keeps its newline:', buildSvgCopy(PRESERVE, 'single')!.includes('\n'))

console.log('\nbroken:', buildSvgCopy('<svg><g></svg>', 'single'))
console.log('broken dataUri:', buildSvgCopy('<svg><g></svg>', 'dataUri'))
console.log('empty:', JSON.stringify(buildSvgCopy('   ', 'single')))
console.log('empty dataUri:', JSON.stringify(buildSvgCopy('   ', 'dataUri')))
console.log('pretty matches formatter:', buildSvgCopy(SAMPLE, 'pretty') === pretty)
