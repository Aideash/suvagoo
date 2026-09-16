import {
  deleteAttribute,
  findElementByPath,
  isIgnoredAttributeName,
  parseIgnoredAttributeName,
  toggleIgnoreAttribute,
  updateAttribute,
} from '../src/lib/svgDocument'
import { lintSvgSource } from '../src/lib/svgLint'

let failures = 0

function check(label: string, ok: boolean) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failures += 1
}

const path = [{ tag: 'svg', index: 0 }, { tag: 'rect', index: 0 }]

const src = '<svg><rect fill="red" stroke="black"/></svg>'
const ignored = toggleIgnoreAttribute(src, path, 'fill')
check('ignore renames to ignore-0-fill', ignored?.content.includes('ignore-0-fill="red"') === true)
check('ignore keeps other attrs', ignored?.content.includes('stroke="black"') === true)
check('ignore removes live fill', ignored?.content.includes(' fill=') === false)

const restored =
  ignored && toggleIgnoreAttribute(ignored.content, path, 'ignore-0-fill')
check('un-ignore restores fill', restored?.content.includes('fill="red"') === true)
check('un-ignore drops ignore prefix', restored?.content.includes('ignore-0-fill') === false)

const withLive = '<svg><rect fill="blue" ignore-0-fill="red"/></svg>'
const swapped = toggleIgnoreAttribute(withLive, path, 'ignore-0-fill')
check('un-ignore with collision restores ignored', swapped?.content.includes('fill="red"') === true)
check(
  'un-ignore with collision parks live',
  swapped?.content.includes('ignore-1-fill="blue"') === true,
)
check('un-ignore with collision drops old ignore id', swapped?.content.includes('ignore-0-fill') === false)

const dual = '<svg><rect ignore-0-fill="a" fill="b"/></svg>'
const again = toggleIgnoreAttribute(dual, path, 'fill')
check('second ignore gets next id', again?.content.includes('ignore-1-fill="b"') === true)
check('second ignore keeps prior', again?.content.includes('ignore-0-fill="a"') === true)

check('parse ignore-0-fill', parseIgnoredAttributeName('ignore-0-fill')?.base === 'fill')
check('bare ignore-foo is not feature-ignored', isIgnoredAttributeName('ignore-foo') === false)

const linted = lintSvgSource('<svg><rect ignore-0-fill="red"/></svg>')
check(
  'ignored attr does not lint as unknown',
  linted.every((issue) => issue.code !== 'unknown-attribute'),
)

const ctx = findElementByPath(ignored!.content, path)
check('indexed attrs use ignored name', ctx?.existingAttributes['ignore-0-fill'] === 'red')

const both = '<svg><rect ignore-0-fill="red" fill="blue"/></svg>'
const updatedLive = updateAttribute(both, path, 'fill', 'green')
check(
  'update fill leaves ignore-0-fill alone',
  updatedLive?.content.includes('ignore-0-fill="red"') === true &&
    updatedLive?.content.includes('fill="green"') === true,
)

const updatedIgnored = updateAttribute(both, path, 'ignore-0-fill', 'yellow')
check(
  'update ignore-0-fill leaves fill alone',
  updatedIgnored?.content.includes('ignore-0-fill="yellow"') === true &&
    updatedIgnored?.content.includes('fill="blue"') === true,
)

const deletedLive = deleteAttribute(both, path, 'fill')
check(
  'delete fill leaves ignore-0-fill',
  deletedLive?.content === '<svg><rect ignore-0-fill="red"/></svg>',
)

if (failures) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nall passed')
