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

export function sanitizeSvgMarkup(content: string): string {
  if (!content.trim()) return ''
  return DOMPurify.sanitize(dropNoneTransforms(content), {
    USE_PROFILES: { svg: true, svgFilters: true },
  })
}
