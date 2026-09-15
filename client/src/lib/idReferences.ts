import {
  parseIndexedDocument,
  pathsEqual,
  type IndexedDocumentNode,
  type PathSegment,
} from './svgDocument'
import { getElementSchema, isTextNodeTag } from './svgSchema'

/** An `id` defined somewhere in the document, with the element that owns it. */
export interface DocumentId {
  id: string
  tag: string
}

export interface IdSuggestion extends DocumentId {
  /** Stable list key, as expected by ValueSuggestInput. */
  key: string
}

/** A ready-to-apply completion: the whole new attribute value plus caret offset. */
export interface IdCompletion extends IdSuggestion {
  value: string
  caret: number
}

/** Attributes whose `#id` fragment is written bare rather than inside `url()`. */
const FRAGMENT_ATTRS = new Set(['href', 'xlink:href'])

/** Element types each referencing attribute is most likely pointing at. */
const PREFERRED_TARGETS: Record<string, readonly string[]> = {
  fill: ['linearGradient', 'radialGradient', 'pattern'],
  stroke: ['linearGradient', 'radialGradient', 'pattern'],
  filter: ['filter'],
  'clip-path': ['clipPath'],
  mask: ['mask'],
  'marker-start': ['marker'],
  'marker-mid': ['marker'],
  'marker-end': ['marker'],
}

/** Characters an id may contain, used to find the token around the caret. */
const ID_CHARS = /^[\w.:-]*/
const URL_FRAGMENT = /url\(\s*(['"]?)#([\w.:-]*)$/i
const BARE_FRAGMENT = /^\s*#([\w.:-]*)$/

/**
 * Every `id` in the document, in document order, first definition wins.
 * Reads the indexed tree rather than DOMParser so ids stay available while the
 * markup is mid-edit and not yet well-formed.
 */
export function collectDocumentIds(content: string): DocumentId[] {
  const found: DocumentId[] = []
  const seen = new Set<string>()

  function walk(node: IndexedDocumentNode) {
    if (isTextNodeTag(node.tag) || node.commentedOut) return
    const id = node.attributes.id?.trim()
    if (id && !seen.has(id)) {
      seen.add(id)
      // The parse tree lowercases tags; show the spelling SVG authors expect.
      found.push({ id, tag: getElementSchema(node.tag)?.tag ?? node.tag })
    }
    for (const child of node.children) walk(child)
  }

  const root = parseIndexedDocument(content)
  if (root) walk(root)
  return found
}

/**
 * Another element already claiming `id`, if any. Pass `excludePath` for the
 * element currently being edited so its own value does not count as a conflict.
 */
export function findDocumentIdConflict(
  content: string,
  id: string,
  excludePath?: PathSegment[],
): DocumentId | null {
  const needle = id.trim()
  if (!needle) return null

  function walk(node: IndexedDocumentNode): DocumentId | null {
    if (isTextNodeTag(node.tag) || node.commentedOut) return null
    const nodeId = node.attributes.id?.trim()
    if (nodeId === needle && (!excludePath || !pathsEqual(node.path, excludePath))) {
      return { id: nodeId, tag: getElementSchema(node.tag)?.tag ?? node.tag }
    }
    for (const child of node.children) {
      const found = walk(child)
      if (found) return found
    }
    return null
  }

  const root = parseIndexedDocument(content)
  return root ? walk(root) : null
}

/** Shortest completion first so typing narrows towards the obvious match. */
function byCompletionLength(a: DocumentId, b: DocumentId): number {
  return a.id.length - b.id.length || a.id.localeCompare(b.id)
}

interface FragmentToken {
  /** Offset of the first character of the partial id. */
  start: number
  /** Offset just past the partial id, ignoring what the caret splits. */
  end: number
  needle: string
  /** Quote the user opened inside `url(`, if any. */
  quote: string
  insideUrl: boolean
}

function findFragmentToken(value: string, caret: number, attrName: string): FragmentToken | null {
  const clamped = Math.max(0, Math.min(caret, value.length))
  const before = value.slice(0, clamped)
  const trailing = ID_CHARS.exec(value.slice(clamped))?.[0] ?? ''

  const urlMatch = URL_FRAGMENT.exec(before)
  if (urlMatch) {
    const needle = urlMatch[2]
    return {
      start: clamped - needle.length,
      end: clamped + trailing.length,
      needle: needle + trailing,
      quote: urlMatch[1],
      insideUrl: true,
    }
  }

  if (!FRAGMENT_ATTRS.has(attrName.toLowerCase())) return null

  const bareMatch = BARE_FRAGMENT.exec(before)
  if (!bareMatch) return null
  const needle = bareMatch[1]
  return {
    start: clamped - needle.length,
    end: clamped + trailing.length,
    needle: needle + trailing,
    quote: '',
    insideUrl: false,
  }
}

/**
 * Ids matching the partial fragment, ordered so the element types this
 * attribute usually references come first, prefix matches ahead of mid-word.
 */
function rankIds(ids: readonly DocumentId[], needle: string, attrName: string): DocumentId[] {
  const preferred = new Set(
    (PREFERRED_TARGETS[attrName.toLowerCase()] ?? []).map((tag) => tag.toLowerCase()),
  )
  const lower = needle.toLowerCase()

  const preferredPrefix: DocumentId[] = []
  const otherPrefix: DocumentId[] = []
  const preferredInfix: DocumentId[] = []
  const otherInfix: DocumentId[] = []

  for (const entry of ids) {
    const id = entry.id.toLowerCase()
    const isPreferred = preferred.has(entry.tag.toLowerCase())
    if (!lower || id.startsWith(lower)) {
      if (isPreferred) preferredPrefix.push(entry)
      else otherPrefix.push(entry)
    } else if (id.includes(lower)) {
      if (isPreferred) preferredInfix.push(entry)
      else otherInfix.push(entry)
    }
  }

  // An empty needle keeps document order; otherwise closest match first.
  if (lower) {
    preferredPrefix.sort(byCompletionLength)
    otherPrefix.sort(byCompletionLength)
    preferredInfix.sort(byCompletionLength)
    otherInfix.sort(byCompletionLength)
  }

  return [...preferredPrefix, ...otherPrefix, ...preferredInfix, ...otherInfix]
}

/**
 * Ids matching a plain query, ranked for `attrName`. For fields that hold a
 * bare id rather than a whole attribute value, so there is no token to detect.
 */
export function suggestIds(
  query: string,
  ids: readonly DocumentId[],
  attrName: string,
  limit = 5,
): IdSuggestion[] {
  return rankIds(ids, query, attrName)
    .slice(0, limit)
    .map((entry) => ({ ...entry, key: entry.id }))
}

/**
 * Characters that close the reference. Only ever the paren the user already
 * opened, plus their own quote: the value sits inside a quoted attribute, so
 * adding a quote of our own would break the open tag.
 */
function closerFor(token: FragmentToken): string {
  return token.insideUrl ? `${token.quote})` : ''
}

/**
 * Completions for the `url(#…)` (or bare `#…`) fragment the caret sits in.
 * Empty when the caret is not inside such a fragment, so callers can fall back
 * to whatever other suggestions the attribute offers.
 */
export function suggestIdReferences(
  value: string,
  caret: number,
  ids: readonly DocumentId[],
  attrName: string,
  limit = 5,
): IdCompletion[] {
  if (!ids.length) return []
  const token = findFragmentToken(value, caret, attrName)
  if (!token) return []

  const rest = value.slice(token.end)
  const prefix = value.slice(0, token.start)
  const closer = closerFor(token)
  const closing = rest.startsWith(closer) ? '' : closer

  return suggestIds(token.needle, ids, attrName, limit).map((entry) => ({
    ...entry,
    value: `${prefix}${entry.id}${closing}${rest}`,
    // Past the closing paren either way, so the value is ready to leave.
    caret: prefix.length + entry.id.length + closer.length,
  }))
}
