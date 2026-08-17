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

  const single = formatSvgSingleLine(content)
  if (single == null) return null
  if (format === 'single') return single

  return `${DATA_URI_PREFIX}${encodeForDataUri(withNamespace(single))}`
}
