/** Prepare document markup for rendering in a preview surface. */

import DOMPurify from 'dompurify'

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
