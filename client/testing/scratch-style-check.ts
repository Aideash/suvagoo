import {
  cursorOffsetForPath,
  deleteChildElement,
  findElementAtOffset,
  insertChildElement,
  parseIndexedDocument,
  updateStyleContent,
} from '../src/lib/svgDocument'
import { addCssDeclaration, parseCssStylesheet, toggleCssDeclaration } from '../src/lib/svgCss'
import { svgLanguage } from '../src/lib/svgCodeMirror'
import { getElementSchema } from '../src/lib/svgSchema'

let failures = 0

function check(label: string, ok: boolean) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failures += 1
}

check('svg offers style', getElementSchema('svg')?.children.includes('style') === true)
check('defs offers style', getElementSchema('defs')?.children.includes('style') === true)
check('style has no builder attributes', getElementSchema('style')?.attributes.length === 0)

const empty = '<svg viewBox="0 0 100 100"></svg>'
const inserted = insertChildElement(empty, empty.indexOf('<svg') + 1, 'style', 'tag-only')
check('insert bare style', inserted?.content.includes('<style></style>') === true)

const source = `<svg><style>
.shape { fill: red; }
@media (min-width: 20px) {
  .shape { stroke: blue; }
}
</style><rect class="shape"/></svg>`
const root = parseIndexedDocument(source)
const style = root?.children.find((child) => child.tag === 'style')
check('style is one direct tree node', Boolean(style && style.children.length === 0))
check('style exposes CSS content', style?.text?.includes('.shape { fill: red; }') === true)

if (style) {
  const offset = cursorOffsetForPath(source, style.path)
  check(
    'style path resolves to style',
    findElementAtOffset(source, offset ?? -1)?.tagName === 'style',
  )

  const nextCss = '\n.shape { fill: green; }\n'
  const updated = updateStyleContent(source, style.path, nextCss)
  check('plain style update replaces only content', updated?.content.includes(nextCss) === true)

  const deleted = deleteChildElement(source, style.path)
  check('delete style keeps sibling', deleted?.content.includes('<rect class="shape"/>') === true)
}

const cdataSource = '<svg><style><![CDATA[.shape { fill: red; }]]></style></svg>'
const cdataStyle = parseIndexedDocument(cdataSource)?.children[0]
check('CDATA body is exposed without wrapper', cdataStyle?.text === '.shape { fill: red; }')
if (cdataStyle) {
  const updated = updateStyleContent(
    cdataSource,
    cdataStyle.path,
    '.shape::after { content: "]]>"; }',
  )
  check('CDATA update preserves wrapper', updated?.content.includes('<![CDATA[') === true)
  check('CDATA terminator is safely split', updated?.content.includes(']]]]><![CDATA[>') === true)
}

const css = parseCssStylesheet(style?.text ?? '')
check('CSS parser finds top-level and nested rules', css.rules.length === 3)
check(
  'nested rule depth is retained',
  css.rules.some((rule) => rule.depth === 1),
)
const firstRule = css.rules[0]
const firstDeclaration = firstRule?.declarations[0]
if (firstRule && firstDeclaration) {
  const disabled = toggleCssDeclaration(style?.text ?? '', firstDeclaration)
  check('declaration can be disabled as a CSS comment', disabled.includes('/* fill: red; */'))
  const disabledDeclaration = parseCssStylesheet(disabled).rules[0]?.declarations[0]
  check('disabled declaration remains structured', disabledDeclaration?.disabled === true)
  check(
    'declaration can be enabled again',
    Boolean(
      disabledDeclaration &&
      toggleCssDeclaration(disabled, disabledDeclaration).includes('fill: red;'),
    ),
  )
  check(
    'declaration can be added before the rule close',
    addCssDeclaration(style?.text ?? '', firstRule).includes('property: value;'),
  )
}

const mixedSource =
  '<svg><style>.shape { fill: red; }</style><style><![CDATA[.other { stroke: blue; }]]></style></svg>'
const mixedTree = svgLanguage.parser.parse(mixedSource)
check(
  'mixed editor parser mounts CSS in plain style text',
  mixedTree.resolveInner(mixedSource.indexOf('shape') + 1, 1).name === 'ClassName',
)
check(
  'mixed editor parser mounts CSS in CDATA',
  mixedTree.resolveInner(mixedSource.indexOf('other') + 1, 1).name === 'ClassName',
)

console.log(failures ? `\n${failures} failing check(s)` : '\nall checks pass')
process.exit(failures ? 1 : 0)
