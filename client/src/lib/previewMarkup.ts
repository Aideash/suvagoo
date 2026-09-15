/** Prepare document markup for rendering in a preview surface. */

import DOMPurify from 'dompurify'
import {
  isXmlParsable,
  parseIndexedDocument,
  stripXmlComments,
  type IndexedDocumentNode,
} from './svgDocument'

const OPEN_TAG = /<([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g
const ATTRIBUTE = /([A-Za-z][\w:.-]*)(\s*=\s*)(["'])([^"']*)\3/g

const TRANSFORM_ATTRIBUTES = new Set(['transform', 'gradientTransform', 'patternTransform'])

/**
 * `none` is the identity transform, but Blink parses these attributes with the
 * SVG 1.1 function grammar, which has no keyword form, so it reports
 * `Expected transform function, "none"` and ignores the value. Dropping the
 * attribute renders the same result without the console error.
 */
function dropNoneTransforms(content: string): string {
  return content.replace(OPEN_TAG, (tag, tagName: string, attrs: string, selfClosing: string) => {
    if (!/none/i.test(attrs)) return tag
    const stripped = attrs.replace(ATTRIBUTE, (attr, name: string, _eq, _quote, value: string) =>
      TRANSFORM_ATTRIBUTES.has(name) && value.trim().toLowerCase() === 'none' ? '' : attr,
    )
    return stripped === attrs ? tag : `<${tagName}${stripped}${selfClosing}>`
  })
}

/**
 * Elements the SVG profile withholds but the editor offers, so a document that
 * uses them has to render:
 *
 * - `animate` and `set`, because animation is the usual vehicle for turning a
 *   static `href` into a script URL. DOMPurify's separate guard on
 *   `attributeName` values naming `href` stays in force, which is the part of
 *   that protection that matters for markup authored here.
 * - `use`, whose `href` is still validated against the URI allowlist, so a
 *   `javascript:` target loses the attribute.
 * - `foreignObject`. Its HTML children are dropped all the same: DOMPurify only
 *   treats `annotation-xml` as an HTML integration point, and adding
 *   `foreignobject` to that set is what reopens SVG-to-HTML namespace
 *   confusion. The box renders with its text content.
 */
const EXTRA_TAGS = ['animate', 'set', 'use', 'foreignobject']

/** Animation values absent from the profile's attribute allowlist. */
const EXTRA_ATTRIBUTES = ['from', 'to', 'calcmode']

/**
 * DOMPurify's default data-URI allowlist covers `<image>` but not `<feImage>`,
 * so `href="data:image/svg+xml,…"` (and other `data:` images) was stripped from
 * filter inputs while the same value on `<image>` survived.
 *
 * Extending the list matches `<image>`: `javascript:` and other non-allowlisted
 * schemes are still rejected; modern browsers decode feImage targets as images
 * (no script execution), same as SVG-as-`<img>`. Nested SVG data URIs remain a
 * historical XSS surface in very old browsers — acceptable here because preview
 * markup comes from user-owned documents, not untrusted multi-tenant input.
 */
const EXTRA_DATA_URI_TAGS = ['feImage']

export function sanitizeSvgMarkup(content: string): string {
  if (!content.trim()) return ''
  return DOMPurify.sanitize(dropNoneTransforms(content), {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: EXTRA_TAGS,
    ADD_ATTR: EXTRA_ATTRIBUTES,
    ADD_DATA_URI_TAGS: EXTRA_DATA_URI_TAGS,
  })
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

/** Offset just past the tag name, where further attributes can be inserted. */
const OPEN_TAG_NAME = /^<\s*[A-Za-z_][\w:.-]*/

export interface PreviewImage {
  /** Source for an `<img>`, holding the document on its own. */
  src: string
  /** Whether the document states its own size, in units an image can use. */
  intrinsicSize: boolean
}

/** Attribute lookup that tolerates the casing the author wrote. */
function attributeValue(node: IndexedDocumentNode, name: string): string | undefined {
  const lower = name.toLowerCase()
  const key = Object.keys(node.attributes).find((candidate) => candidate.toLowerCase() === lower)
  return key == null ? undefined : node.attributes[key]
}

function escapeAttributeValue(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

/**
 * Percentages resolve against a viewport, which an image is not given, so a
 * document sized that way has no usable size of its own.
 */
function statesOwnSize(node: IndexedDocumentNode): boolean {
  const width = attributeValue(node, 'width')?.trim()
  const height = attributeValue(node, 'height')?.trim()
  if (!width || !height) return false
  return !width.endsWith('%') && !height.endsWith('%')
}

function withRootAttributes(markup: string, node: IndexedDocumentNode, added: string[]): string {
  if (!added.length) return markup

  const openTag = markup.slice(node.openTagStart, node.openTagEnd)
  const nameEnd = OPEN_TAG_NAME.exec(openTag)?.[0].length
  if (nameEnd == null) return markup

  const rewritten = `${openTag.slice(0, nameEnd)} ${added.join(' ')}${openTag.slice(nameEnd)}`
  return markup.slice(0, node.openTagStart) + rewritten + markup.slice(node.openTagEnd)
}

/**
 * A document rendered inline shares the page's id space and its stylesheet, so
 * two previews that both define `filter#blur` paint with whichever definition
 * loaded last, and a `<style>` block inside one of them reaches the whole page.
 * Handing the markup to an `<img>` gives each document its own context instead.
 *
 * `currentColor` has nothing to inherit from in an image, so `color` is written
 * onto the root as a presentation attribute: it seeds inheritance the way the
 * page used to, and gives way to anything the document declares for itself.
 *
 * Null when the markup cannot stand alone as an XML document, where the caller
 * should render it inline rather than show a broken image.
 */
export function buildPreviewImage(sanitized: string, color: string): PreviewImage | null {
  const root = parseIndexedDocument(sanitized)
  if (!root || root.tag !== 'svg') return null

  const added: string[] = []
  if (!attributeValue(root, 'xmlns')) added.push(`xmlns="${SVG_NS}"`)
  // An undeclared prefix is fatal to an XML parser, unlike the HTML one.
  if (!attributeValue(root, 'xmlns:xlink') && /\bxlink:/.test(sanitized)) {
    added.push(`xmlns:xlink="${XLINK_NS}"`)
  }
  if (color && !attributeValue(root, 'color')) {
    added.push(`color="${escapeAttributeValue(color)}"`)
  }

  const standalone = withRootAttributes(sanitized, root, added)
  // Comments never paint; stripping them keeps the data URI valid XML even when
  // a comment body contains `--` (illegal per the XML spec).
  const forImage = stripXmlComments(standalone)
  if (!isXmlParsable(forImage)) return null

  return {
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(forImage)}`,
    intrinsicSize: statesOwnSize(root),
  }
}
