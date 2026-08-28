import {
  cursorOffsetForPath,
  deleteChildElement,
  findElementAtOffset,
  insertChildElement,
  parseIndexedDocument,
  updateTextNode,
} from '../src/lib/svgDocument'
import { getElementSchema, isDescriptiveTag, TEXT_NODE_TAG } from '../src/lib/svgSchema'

let failures = 0

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`ok  ${label}`)
    return
  }
  failures += 1
  console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`)
}

console.log('=== descriptive children offered on sample parents ===')
for (const tag of ['svg', 'circle', 'g', 'filter', 'feGaussianBlur', 'title', 'desc']) {
  const children = getElementSchema(tag)?.children.filter(isDescriptiveTag) ?? []
  console.log(`${tag.padEnd(20)} ${children.join(', ') || '(none)'}`)
}

check(
  'circle offers title and desc',
  getElementSchema('circle')?.children.includes('title') === true,
)
check('title does not nest title', getElementSchema('title')?.children.includes('title') === false)
check(
  'title offers text_node',
  getElementSchema('title')?.children.includes(TEXT_NODE_TAG) === true,
)
check('title has no builder attributes', (getElementSchema('title')?.attributes.length ?? -1) === 0)

const emptyCircle = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="10"/></svg>`
const circleOffset = emptyCircle.indexOf('<circle') + 1

const withTitle = insertChildElement(emptyCircle, circleOffset, 'title', 'tag-only')
check('insert title into circle', Boolean(withTitle?.content.includes('<title></title>')))

const titleOffset = withTitle ? withTitle.content.indexOf('<title') + 1 : -1
const withText = withTitle
  ? insertChildElement(withTitle.content, titleOffset, TEXT_NODE_TAG)
  : null
check(
  'insert text_node into empty title',
  Boolean(withText?.content.includes('<title>Title</title>')),
)

const parsed = withText ? parseIndexedDocument(withText.content) : null
const titleNode = parsed?.children
  .find((child) => child.tag === 'circle')
  ?.children.find((child) => child.tag === 'title')
const textNode = titleNode?.children.find((child) => child.tag === TEXT_NODE_TAG)
check('parsed text_node under title', textNode?.text === 'Title')

const updated =
  withText && textNode ? updateTextNode(withText.content, textNode.path, 'Hello & <world>') : null
check(
  'updateTextNode escapes markup',
  Boolean(updated?.content.includes('<title>Hello &amp; &lt;world&gt;</title>')),
)

const parsedUpdate = updated ? parseIndexedDocument(updated.content) : null
const decoded = parsedUpdate?.children
  .find((child) => child.tag === 'circle')
  ?.children.find((child) => child.tag === 'title')
  ?.children.find((child) => child.tag === TEXT_NODE_TAG)
check('parse decodes entities', decoded?.text === 'Hello & <world>')

const deleted = updated && decoded ? deleteChildElement(updated.content, decoded.path) : null
check('delete text_node leaves empty title', Boolean(deleted?.content.includes('<title></title>')))

const prefilled = insertChildElement(emptyCircle, circleOffset, 'title', 'pre-filled')
check(
  'pre-filled title snippet includes text',
  Boolean(prefilled?.content.includes('<title>Title</title>')),
)

const descInsert = insertChildElement(emptyCircle, circleOffset, 'desc', 'tag-only')
const descOffset = descInsert ? descInsert.content.indexOf('<desc') + 1 : -1
const descText = descInsert
  ? insertChildElement(descInsert.content, descOffset, TEXT_NODE_TAG)
  : null
check('desc text_node default', Boolean(descText?.content.includes('<desc>Description</desc>')))

const duplicate = withText
  ? insertChildElement(withText.content, withText.content.indexOf('<title') + 1, TEXT_NODE_TAG)
  : { content: 'not-null' }
check('second text_node insert is refused', duplicate === null)

if (withText && textNode) {
  const caret = cursorOffsetForPath(withText.content, textNode.path)
  const atText = caret == null ? null : findElementAtOffset(withText.content, caret)
  check('caret on text_node resolves to text_node', atText?.tagName === TEXT_NODE_TAG)

  const titleCaret = cursorOffsetForPath(withText.content, titleNode!.path)
  const atTitle = titleCaret == null ? null : findElementAtOffset(withText.content, titleCaret)
  check('caret on title stays on title', atTitle?.tagName === 'title')
}

const emptyText = `<svg viewBox="0 0 100 100"><text x="10" y="20"></text></svg>`
const textOffset = emptyText.indexOf('<text') + 1
const withLabel = insertChildElement(emptyText, textOffset, TEXT_NODE_TAG)
check('insert text_node into empty text', Boolean(withLabel?.content.includes('>Label</text>')))

const parsedText = withLabel ? parseIndexedDocument(withLabel.content) : null
const textEl = parsedText?.children.find((child) => child.tag === 'text')
check('parsed text_node under text', textEl?.children[0]?.text === 'Label')

const mixed = `<svg><text>Hello<tspan dx="2">world</tspan>!</text></svg>`
const mixedTree = parseIndexedDocument(mixed)
const mixedText = mixedTree?.children.find((child) => child.tag === 'text')
check(
  'mixed text splits around tspan',
  mixedText?.children.map((child) => `${child.tag}:${child.text ?? ''}`).join('|') ===
    'text_node:Hello|tspan:|text_node:!',
)
const mixedTspan = mixedText?.children.find((child) => child.tag === 'tspan')
check('tspan inner text_node', mixedTspan?.children[0]?.text === 'world')

const prettyText = `<svg>
  <text x="0" y="0">
    <tspan>Line</tspan>
  </text>
</svg>`
const prettyTree = parseIndexedDocument(prettyText)
const prettyChildren = prettyTree?.children.find((child) => child.tag === 'text')?.children ?? []
check(
  'pretty-printed text skips indent-only nodes',
  prettyChildren.length === 1 && prettyChildren[0]?.tag === 'tspan',
)

const pathMarkup = `<svg><text><textPath href="#p">On path</textPath></text></svg>`
const pathTree = parseIndexedDocument(pathMarkup)
const pathEl = pathTree?.children
  .find((child) => child.tag === 'text')
  ?.children.find((child) => child.tag === 'textpath')
check('textPath inner text_node', pathEl?.children[0]?.text === 'On path')

const afterTspan = insertChildElement(prettyText, prettyText.indexOf('<text') + 1, TEXT_NODE_TAG)
check('append text_node after tspan', Boolean(afterTspan?.content.includes('Label</text>')))

console.log(failures ? `\n${failures} failing check(s)` : '\nall checks pass')
process.exit(failures ? 1 : 0)
