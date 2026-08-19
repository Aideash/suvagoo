import { deleteChildElement, remapPathsAfterDelete, type PathSegment } from '../src/lib/svgDocument'

function path(...segments: string[]): PathSegment[] {
  return segments.map((segment) => {
    const [tag, index] = segment.split(':')
    return { tag, index: Number(index ?? 0) }
  })
}

function show(label: string, value: string | null) {
  console.log(`\n===== ${label} =====`)
  console.log(value === null ? '<null>' : value)
}

const SIBLINGS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g>
    <rect width="1"/>
    <rect width="2"/>
    <rect width="3"/>
  </g>
</svg>`

show(
  'delete middle sibling',
  deleteChildElement(SIBLINGS, path('svg:0', 'g:0', 'rect:1'))?.content ?? null,
)
show(
  'delete first sibling',
  deleteChildElement(SIBLINGS, path('svg:0', 'g:0', 'rect:0'))?.content ?? null,
)
show(
  'delete last sibling',
  deleteChildElement(SIBLINGS, path('svg:0', 'g:0', 'rect:2'))?.content ?? null,
)

const INLINE = `<svg viewBox="0 0 10 10"><rect width="1"/> <rect width="2"/> <rect width="3"/></svg>`
show('delete inline middle', deleteChildElement(INLINE, path('svg:0', 'rect:1'))?.content ?? null)

const ANIMATED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="10">
    <animate attributeName="r" values="10;20;10" dur="2s"/>
  </circle>
</svg>`
show(
  'delete only animation',
  deleteChildElement(ANIMATED, path('svg:0', 'circle:0', 'animate:0'))?.content ?? null,
)

const TWO_ANIMATIONS = `<svg viewBox="0 0 100 100">
  <circle r="10">
    <animate attributeName="r" dur="2s"/>
    <animate attributeName="cx" dur="2s"/>
  </circle>
</svg>`
show(
  'delete one of two animations',
  deleteChildElement(TWO_ANIMATIONS, path('svg:0', 'circle:0', 'animate:0'))?.content ?? null,
)

const CONTAINER = `<svg viewBox="0 0 10 10">
  <g>
    <rect width="1"/>
  </g>
</svg>`
show(
  'empty container is left alone',
  deleteChildElement(CONTAINER, path('svg:0', 'g:0', 'rect:0'))?.content ?? null,
)

const TEXTY = `<svg viewBox="0 0 10 10">
  <text x="1" y="2">hello<tspan dy="1">there</tspan></text>
</svg>`
show(
  'text content survives',
  deleteChildElement(TEXTY, path('svg:0', 'text:0', 'tspan:0'))?.content ?? null,
)

const selection = [
  path('svg:0', 'path:0'),
  path('svg:0', 'path:1'),
  path('svg:0', 'path:2'),
  path('svg:0', 'rect:0'),
  path('svg:0', 'path:2', 'animate:0'),
]

function render(paths: PathSegment[][]): string {
  return paths.map((p) => p.map((s) => `${s.tag}[${s.index}]`).join('/')).join(', ')
}

console.log('\n===== selection remap =====')
console.log('before          :', render(selection))
console.log('delete path[2]  :', render(remapPathsAfterDelete(selection, path('svg:0', 'path:2'))))
console.log('delete path[1]  :', render(remapPathsAfterDelete(selection, path('svg:0', 'path:1'))))
console.log('delete path[0]  :', render(remapPathsAfterDelete(selection, path('svg:0', 'path:0'))))
console.log('delete rect[0]  :', render(remapPathsAfterDelete(selection, path('svg:0', 'rect:0'))))
console.log(
  'delete unselected path[3]:',
  render(remapPathsAfterDelete(selection, path('svg:0', 'path:3'))),
)
console.log('delete ancestor svg[0]   :', render(remapPathsAfterDelete(selection, path('svg:0'))))
