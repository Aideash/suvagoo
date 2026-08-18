/** Clipboard renderings of a document, none of which change what it draws. */

import { parseIndexedDocument } from './svgDocument'
import { formatSvgSingleLine, formatSvgSource, type SvgFormatLayout } from './svgFormat'

export type SvgCopyFormat = SvgFormatLayout | 'single' | 'dataUri'

export const DATA_URI_PREFIX = 'data:image/svg+xml,'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

/**
 * A data URI is fetched as a document of its own, so an undeclared namespace
 * that the editor tolerates would leave the copied value blank.
 */
function withNamespace(single: string): string {
  const root = parseIndexedDocument(single)
  if (!root || root.tag !== 'svg' || 'xmlns' in root.attributes) return single

  const insertAt = root.openTagStart + '<svg'.length
  return `${single.slice(0, insertAt)} xmlns="${SVG_NAMESPACE}"${single.slice(insertAt)}`
}

/**
 * Drop XML comments before encoding. Attribute values are left alone so a
 * literal `<!--` inside quotes is not mistaken for markup.
 */
function stripXmlComments(content: string): string {
  let out = ''
  let i = 0
  while (i < content.length) {
    if (content.startsWith('<!--', i)) {
      const end = content.indexOf('-->', i + 4)
      i = end >= 0 ? end + 3 : content.length
      continue
    }

    if (content[i] === '<') {
      if (content.startsWith('<![CDATA[', i)) {
        const end = content.indexOf(']]>', i + 9)
        const close = end >= 0 ? end + 3 : content.length
        out += content.slice(i, close)
        i = close
        continue
      }
      if (content.startsWith('<?', i)) {
        const end = content.indexOf('?>', i + 2)
        const close = end >= 0 ? end + 2 : content.length
        out += content.slice(i, close)
        i = close
        continue
      }

      let j = i + 1
      let quote: '"' | "'" | null = null
      while (j < content.length) {
        const ch = content[j]
        if (quote) {
          if (ch === quote) quote = null
        } else if (ch === '"' || ch === "'") {
          quote = ch
        } else if (ch === '>') {
          j += 1
          break
        }
        j += 1
      }
      out += content.slice(i, j)
      i = j
      continue
    }

    out += content[i]
    i += 1
  }
  return out
}

/**
 * `encodeURIComponent` leaves `!'()*` alone, and an unquoted CSS `url()` ends
 * at the first `)`. Encoding those four as well makes the result safe both
 * bare and inside either kind of quote.
 */
function encodeForDataUri(single: string): string {
  return encodeURIComponent(single).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/** Returns null when the markup cannot be walked, matching the formatter. */
export function buildSvgCopy(content: string, format: SvgCopyFormat): string | null {
  if (format === 'pretty' || format === 'compact') return formatSvgSource(content, format)

  const source = format === 'dataUri' ? stripXmlComments(content) : content
  const single = formatSvgSingleLine(source)
  if (single == null) return null
  if (format === 'single') return single

  return `${DATA_URI_PREFIX}${encodeForDataUri(withNamespace(single))}`
}
