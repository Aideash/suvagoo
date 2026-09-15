import {
  commentOutElement,
  parseIndexedDocument,
  stripXmlComments,
  uncommentElement,
  unescapeCommentClosers,
} from '../src/lib/svgDocument'

let failures = 0

function check(label: string, ok: boolean) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failures += 1
}

const src =
  '<svg><g id="wrap"><rect id="r" width="10"/><!-- Earth --><circle r="5"/></g></svg>'
const root = parseIndexedDocument(src)
const g = root?.children[0]
check(
  'prose comment is not indexed',
  g?.children.length === 2 && g.children.every((c) => c.tag === 'rect' || c.tag === 'circle'),
)

const rectPath = g?.children.find((c) => c.tag === 'rect')?.path
const commented = rectPath ? commentOutElement(src, rectPath) : null
check('comment-out wraps element', commented?.content.includes('<!--<rect id="r" width="10"/>-->') === true)

const after = commented ? parseIndexedDocument(commented.content) : null
const commentedNode = after?.children[0]?.children.find((c) => c.commentedOut)
check('commented element is indexed', commentedNode?.commentedTag === 'rect')
check('commented element keeps id', commentedNode?.attributes.id === 'r')
check('live circle index unchanged', after?.children[0]?.children.some((c) => c.tag === 'circle') === true)

const restored =
  commented && commentedNode ? uncommentElement(commented.content, commentedNode.path) : null
check('uncomment round-trip', restored?.content === src)

const nestedBase = '<svg><g><rect width="1"/></g></svg>'
const nestedRect = parseIndexedDocument(nestedBase)!.children[0].children[0].path
const childCommented = commentOutElement(nestedBase, nestedRect)!
const gPath = parseIndexedDocument(childCommented.content)!.children[0].path
const parentCommented = commentOutElement(childCommented.content, gPath)!
check('nested wrap escapes inner closer', parentCommented.content.includes('- ->'))
check(
  'nested wrap has single outer closer',
  (parentCommented.content.match(/-->/g) ?? []).length === 1,
)

const parentNode = parseIndexedDocument(parentCommented.content)!.children.find((c) => c.commentedOut)!
const parentRestored = uncommentElement(parentCommented.content, parentNode.path)!
check(
  'uncomment parent restores child comment',
  parseIndexedDocument(parentRestored.content)!.children[0].children.some((c) => c.commentedOut),
)

const withArrow = '<svg><text title="a --> b">x</text></svg>'
const textPath = parseIndexedDocument(withArrow)!.children[0].path
const arrowCommented = commentOutElement(withArrow, textPath)!
check('attr closer escaped', arrowCommented.content.includes('- ->'))
check(
  'attr closer restored',
  uncommentElement(
    arrowCommented.content,
    parseIndexedDocument(arrowCommented.content)!.children.find((c) => c.commentedOut)!.path,
  )?.content === withArrow,
)

check('root refuse', commentOutElement(src, [{ tag: 'svg', index: 0 }]) === null)

const textDoc = '<svg><text>Hi</text></svg>'
const textNodePath = parseIndexedDocument(textDoc)!.children[0].children[0].path
check('text_node refuse', commentOutElement(textDoc, textNodePath) === null)

const nestedSafe = '<svg><!--<g><!--<rect/>- -></g>--></svg>'
check(
  'XML-safe nest is indexed',
  parseIndexedDocument(nestedSafe)?.children.some((c) => c.commentedOut && c.commentedTag === 'g') ===
    true,
)

check(
  'nested comment strips for XML check',
  stripXmlComments(parentCommented.content) === '<svg></svg>',
)
check(
  'legacy -- > nest still unescapes',
  unescapeCommentClosers('<!--<rect/>-- >') === '<!--<rect/>-->',
)

if (failures) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nall passed')
