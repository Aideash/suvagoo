import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lintSvgSource } from '../src/lib/svgLint'
import { STARTER_SVG } from '../src/api/svgs'

/** Each case pairs markup with the rules it is expected to raise, in order. */
const CASES: [name: string, source: string, expected: string[]][] = [
  ['unterminated double quote', '<svg width="10><rect fill="red"/></svg>', ['unterminated-value']],
  ['unterminated quote at eof', '<svg width="10', ['unterminated-value']],
  ['unterminated single quote', "<svg width='10><rect/></svg>", ['unterminated-value']],
  ['unclosed tag', '<svg><rect fill="red"\n<circle/></svg>', ['unclosed-tag']],
  ['unterminated comment', '<svg><!-- oops </svg>', ['unterminated-comment']],
  ['unterminated cdata', '<svg><style><![CDATA[.a{fill:red}</style></svg>', ['unterminated-cdata']],
  ['unquoted value', '<svg width=10></svg>', ['unquoted-value']],
  ['bare less-than in text', '<svg><text>a < b</text></svg>', ['bare-less-than']],
  ['escaped less-than in text', '<svg><text>a &lt; b</text></svg>', []],
  ['css child selector in a style block', '<svg><style>.a > .b { fill: red }</style></svg>', []],
  ['mismatched close tag', '<svg>\n  <rect></circle>\n</svg>', ['mismatched-close-tag']],
  ['close tag against wrong parent', '<svg></g></svg>', ['mismatched-close-tag']],
  ['stray close tag', '</g>', ['stray-close-tag']],
  ['unclosed element', '<svg>\n  <g>\n    <rect/>\n</svg>', ['missing-close-tag']],
  ['two roots', '<!-- c -->\n<svg/>\n<svg/>', ['multiple-roots']],
  ['three roots', '<svg/><svg/><svg/>', ['multiple-roots', 'multiple-roots']],
  ['comments and instructions are not roots', '<?xml version="1.0"?>\n<!-- c -->\n<svg/>', []],
  ['non-svg root', '<div><rect/></div>', ['root-not-svg']],
  ['mis-cased root', '<SVG></SVG>', ['element-case']],
  ['no root', 'just some text', ['no-root']],
  ['unknown element', '<svg><rekt/></svg>', ['unknown-element']],
  ['mis-cased element', '<svg><lineargradient/></svg>', ['element-case']],
  ['stop outside a gradient', '<svg><g><stop offset="50%"/></g></svg>', ['invalid-nesting']],
  ['child of a leaf element', '<svg><circle r="5"><rect/></circle></svg>', ['invalid-nesting']],
  ['filter primitive outside a filter', '<svg><g><feBlend/></g></svg>', ['invalid-nesting']],
  ['unknown attribute', '<svg><rect fille="red"/></svg>', ['unknown-attribute']],
  ['mis-cased attribute', '<svg viewbox="0 0 1 1"></svg>', ['attribute-case']],
  ['ignore- attributes are reserved', '<svg><rect ignore-foo="1"/></svg>', []],
  [
    'paint attribute on a filter primitive',
    '<svg><filter id="f"><feGaussianBlur fill="red"/></filter></svg>',
    ['unknown-attribute'],
  ],
  ['duplicate attribute', '<svg><rect fill="red" fill="blue"/></svg>', ['duplicate-attribute']],
  ['duplicate id', '<svg><rect id="a"/><circle id="a"/></svg>', ['duplicate-id']],
  ['distinct ids', '<svg><rect id="a"/><circle id="b"/></svg>', []],
  [
    'gradient directly under svg',
    '<svg><linearGradient id="a"><stop offset="0"/></linearGradient><rect fill="url(#a)"/></svg>',
    [],
  ],
  ['nested svg', '<svg><svg viewBox="0 0 1 1"><rect/></svg></svg>', []],
  ['text with tspan', '<svg><text x="0" y="0">a<tspan dx="2">b</tspan></text></svg>', []],
  [
    'animation inside a shape',
    '<svg><circle r="5"><animate attributeName="r" dur="1s"/></circle></svg>',
    [],
  ],
  [
    'foreignObject holds host markup',
    '<svg><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><p>hi</p></div></foreignObject></svg>',
    [],
  ],
  [
    'title, desc, style, script',
    '<svg><title>T</title><desc>D</desc><style>.a{fill:red}</style><script>void 0</script></svg>',
    [],
  ],
  [
    'presentation attributes',
    '<svg><path d="M0 0" paint-order="stroke" vector-effect="none" stroke-miterlimit="4"/></svg>',
    [],
  ],
  ['namespaced element and attribute', '<svg><sodipodi:namedview inkscape:zoom="1"/></svg>', []],
  [
    'aria, data, and event attributes',
    '<svg role="img" aria-label="x" data-note="y" onclick="void 0"><rect/></svg>',
    [],
  ],
  ['empty document', '   ', []],
]

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200">
  <!-- a comment -->
  <defs>
    <filter id="f"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter>
    <linearGradient id="g" gradientTransform="rotate(45)"><stop offset="0" stop-color="#fff"/></linearGradient>
  </defs>
  <g transform="matrix(1 0 0 1 0.5 0.5)" opacity="0.5">
    <path d="M 10 10 L 90 10 Z" fill="none" stroke="black" stroke-width="2" stroke-dasharray="4 2"/>
    <text x="10" y="50" style="font-size: 12px">Hello world</text>
    <rect width="100" height="100" fill="currentColor"/>
  </g>
</svg>`

const EDGE = `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24"><title>An icon</title>
<style type="text/css"><![CDATA[
  .a { fill: red; }
]]></style>
<g xml:space="preserve" id="keepme">  spaced   text  </g>
<text x="0" y="0">Line one
  <tspan dy="1.2em">Line two</tspan></text>
<desc>a &lt;description&gt; with markup-ish text</desc>
<rect data-note="a > b, c &lt; d" width="1"/>
<use xlink:href="#keepme"/>
</svg>`

function describe(source: string, problem: { from: number; to: number }): string {
  return JSON.stringify(source.slice(problem.from, problem.to))
}

let failures = 0

for (const [name, source, expected] of CASES) {
  const problems = lintSvgSource(source)
  const rules = problems.map((problem) => problem.rule)
  const pass = rules.length === expected.length && rules.every((rule, i) => rule === expected[i])
  if (!pass) failures += 1
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}`)
  if (!pass) console.log(`     expected [${expected.join(', ')}]`)
  for (const problem of problems) {
    console.log(
      `     [${problem.severity}] ${problem.rule} ${describe(source, problem)} — ${problem.message}`,
    )
  }
}

/** Real documents must come back clean, which is where false positives show. */
function checkClean(label: string, source: string) {
  const problems = lintSvgSource(source)
  if (!problems.length) {
    console.log(`ok   ${label}`)
    return
  }
  failures += 1
  console.log(`FAIL ${label}`)
  for (const problem of problems) {
    console.log(
      `     [${problem.severity}] ${problem.rule} ${describe(source, problem)} — ${problem.message}`,
    )
  }
}

console.log('\n--- documents expected to be clean ---')
checkClean('sample document', SAMPLE)
checkClean('edge-case document', EDGE)
checkClean('starter document', STARTER_SVG)

const stored = join(import.meta.dirname, '../../server/data/svgs')
for (const file of readdirSync(stored).filter((name) => name.endsWith('.svg'))) {
  checkClean(`stored ${file}`, readFileSync(join(stored, file), 'utf8'))
}

console.log(failures ? `\n${failures} failing case(s)` : '\nall cases pass')
