import { formatSvgSource } from './src/lib/svgFormat'
import {
  cursorOffsetForPath,
  findElementAtOffset,
  parseIndexedDocument,
  type IndexedDocumentNode,
} from './src/lib/svgDocument'
import { STARTER_SVG } from './src/api/svgs'

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200">
  <!-- a comment -->
  <defs>
    <filter id="f"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter>
    <linearGradient id="g" gradientTransform="rotate(45) translate(10 10) scale(2)"><stop offset="0" stop-color="#fff"/></linearGradient>
  </defs>
  <g transform="matrix(1.0000001 0 0 1 0.5 0.5)" opacity="0.5">
    <path d="M 10 10 L 90 10 L 90 90 L 10 90 Z M 20 20 L 80 20 L 80 80 L 20 80 Z" fill="none" stroke="black" stroke-width="2" stroke-dasharray="4 2"/>
    <polygon points="10,10 20,20 30,10 40,20 50,10 60,20 70,10 80,20 90,10 95,15 12,88 44,66"/>
    <text x="10" y="50" style="font-family: sans-serif;   font-size: 12px; fill: red">Hello   world</text>
    <rect width="100" height="100" fill="currentColor"/>
    <path d="M 3.5 12.25 C 4.5 8 8.25 4.5 12 4.5 C 15.75 4.5 19.5 8 20.5 12.25 L 20.5 18 A 2 2 0 0 1 18.5 20 L 5.5 20 A 2 2 0 0 1 3.5 18 Z" fill="red"/>
    <polyline points="1.5,2.5 3.25,4 5,2.5 6.75,4 8.5,2.5 10.25,4 12,2.5 13.75,4 15.5,2.5 17.25,4 19,2.5 20.75,4 22.5,2.5"/>
    <g></g>
  </g>
</svg>`

function show(label: string, value: string | null) {
  console.log(`\n===== ${label} =====`)
  console.log(value === null ? '<null>' : value)
}

const pretty = formatSvgSource(SAMPLE, 'pretty')
const compact = formatSvgSource(SAMPLE, 'compact')
show('pretty', pretty)
show('compact', compact)

const prettyTwice = formatSvgSource(pretty!, 'pretty')
const compactTwice = formatSvgSource(compact!, 'compact')
console.log('\npretty idempotent:', prettyTwice === pretty)
console.log('compact idempotent:', compactTwice === compact)
console.log('pretty -> compact -> pretty stable:', formatSvgSource(compact!, 'pretty') === pretty)
console.log('compact -> pretty -> compact stable:', formatSvgSource(pretty!, 'compact') === compact)

/** Tag/attribute tree with attribute whitespace normalized the way XML does. */
function skeleton(node: IndexedDocumentNode | null): unknown {
  if (!node) return null
  const attrs = Object.entries(node.attributes)
    .map(([name, value]) => [name, value.replace(/\s+/g, ' ').trim()])
    .sort((a, b) => a[0].localeCompare(b[0]))
  return { tag: node.tag, attrs, children: node.children.map(skeleton) }
}

function sameStructure(a: string, b: string): boolean {
  return (
    JSON.stringify(skeleton(parseIndexedDocument(a))) ===
    JSON.stringify(skeleton(parseIndexedDocument(b)))
  )
}

console.log('\npretty preserves structure:', sameStructure(SAMPLE, pretty!))
console.log('compact preserves structure:', sameStructure(SAMPLE, compact!))

// Caret preservation: the element under the caret should survive the reflow.
const caret = SAMPLE.indexOf('polygon') + 3
const caretPath = findElementAtOffset(SAMPLE, caret)?.path
const movedCaret = caretPath ? cursorOffsetForPath(pretty!, caretPath) : null
console.log('caret element before:', caretPath?.map((s) => s.tag).join('/'))
console.log(
  'caret element after:',
  movedCaret == null
    ? '<lost>'
    : findElementAtOffset(pretty!, movedCaret)
        ?.path.map((s) => s.tag)
        .join('/'),
)

const EDGE = `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>An icon</title>
<style type="text/css"><![CDATA[
  .a { fill: red; }
  .b > .c { fill: blue; }
]]></style>
<g xml:space="preserve" id="keepme">  spaced   text  </g>
<text x="0" y="0">Line one
  <tspan dy="1.2em">Line two</tspan></text>
<desc>a &lt;description&gt; with markup-ish text</desc>
<rect data-note="a > b, c &lt; d" width="1"/>
<use href="#keepme"/>
</svg>`

show('edge pretty', formatSvgSource(EDGE, 'pretty'))
show('edge compact', formatSvgSource(EDGE, 'compact'))
console.log('edge pretty preserves structure:', sameStructure(EDGE, formatSvgSource(EDGE, 'pretty')!))
console.log(
  'edge pretty idempotent:',
  formatSvgSource(formatSvgSource(EDGE, 'pretty')!, 'pretty') === formatSvgSource(EDGE, 'pretty'),
)

show('starter pretty', formatSvgSource(STARTER_SVG, 'pretty'))
show('starter compact', formatSvgSource(STARTER_SVG, 'compact'))
console.log('\nbroken:', formatSvgSource('<svg><g></svg>', 'pretty'))
console.log('truncated:', formatSvgSource('<svg><rect ', 'pretty'))
console.log('empty:', JSON.stringify(formatSvgSource('   ', 'pretty')))
