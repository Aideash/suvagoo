import {
  COMMENTED_ELEMENT_TAG,
  DEFAULT_SNIPPET_MODE,
  defaultAttributeValue,
  defaultTextNodeContent,
  formatPathSegment,
  getElementSchema,
  getSnippetForTag,
  holdsCharacterData,
  isCommentedElementTag,
  isDescriptiveTag,
  isStyleTag,
  isTextContainerTag,
  isTextNodeTag,
  normalizeTagName,
  parseViewBoxFromContent,
  TEXT_NODE_TAG,
  type SnippetMode,
  type ViewBox,
} from './svgSchema'

export interface PathSegment {
  tag: string
  index: number
}

export interface IndexedDocumentNode {
  tag: string
  attributes: Record<string, string>
  /** Character data when this is a `text_node` or `style` element. */
  text: string | null
  /** Editable source range for character data, excluding an optional CDATA wrapper. */
  textStart?: number
  textEnd?: number
  textCdata?: boolean
  /** True when this node is an element wrapped in `<!-- … -->`. */
  commentedOut?: boolean
  /** Real SVG tag when `commentedOut` (path tag is `commented_element`). */
  commentedTag?: string
  children: IndexedDocumentNode[]
  path: PathSegment[]
  openTagStart: number
  openTagEnd: number
  closeTagEnd: number | null
  selfClosing: boolean
}

/** @deprecated Use IndexedDocumentNode */
export type DocumentNode = IndexedDocumentNode

export interface ElementContext {
  tagName: string
  depth: number
  path: PathSegment[]
  openTagStart: number
  openTagEnd: number
  existingAttributes: Record<string, string>
  commentedOut?: boolean
}

export interface EditResult {
  content: string
  cursor: number
}

export interface AttributeContext {
  path: PathSegment[]
  tagName: string
  attrName: string
  value: string
  valueStart: number
  valueEnd: number
  quoted: boolean
  quoteChar: '"' | "'" | null
}

interface OpenFrame {
  tagName: string
  tagIndex: number
  openTagStart: number
  openTagEnd: number
  attributes: Record<string, string>
  selfClosing: boolean
  childTagCounts: Map<string, number>
}

const TAG_NAME = /^\s*\/?([A-Za-z_][\w:.-]*)/

function stripPrefix(name: string): string {
  return normalizeTagName(name)
}

function parseAttributes(openTagSource: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const pattern = /([:@A-Za-z_][\w:.-]*)\s*(=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null

  const attrSource = openTagSource.replace(TAG_NAME, '')

  while ((match = pattern.exec(attrSource))) {
    const name = match[1]
    if (name === '/' || name.startsWith('?')) continue
    const value = match[3] ?? match[4] ?? match[5] ?? ''
    attrs[name] = value
  }
  return attrs
}

function skipXmlDeclaration(content: string, index: number): number {
  if (content.startsWith('<?', index)) {
    const end = content.indexOf('?>', index + 2)
    return end >= 0 ? end + 2 : content.length
  }
  return index
}

function skipComment(content: string, index: number): number {
  if (content.startsWith('<!--', index)) {
    const end = content.indexOf('-->', index + 4)
    return end >= 0 ? end + 3 : content.length
  }
  return index
}

function skipCdata(content: string, index: number): number {
  if (content.startsWith('<![CDATA[', index)) {
    const end = content.indexOf(']]>', index + 9)
    return end >= 0 ? end + 3 : content.length
  }
  return index
}

/**
 * Rewrite comment closers so a parent wrap cannot be truncated by nested
 * comments. Uses `- ->` (not `-- >`) so the result stays valid XML — the
 * XML spec forbids `--` inside comment content, which is also what DOMParser
 * rejects.
 */
export function escapeCommentClosers(value: string): string {
  return value.replaceAll('-->', '- ->')
}

/**
 * Inverse of `escapeCommentClosers` before parsing or restoring a commented
 * element. Also accepts the earlier `-- >` form.
 */
export function unescapeCommentClosers(value: string): string {
  return value.replaceAll('-- >', '-->').replaceAll('- ->', '-->')
}

/**
 * True when `body` (comment interior) is a single element plus optional
 * whitespace. Nested closers must already be escaped as `- ->` (or legacy
 * `-- >`) in the source body.
 */
function tryParseSingleElementFragment(body: string): IndexedDocumentNode | null {
  const unescaped = unescapeCommentClosers(body)
  const leading = /^\s*/.exec(unescaped)?.[0].length ?? 0
  if (leading >= unescaped.length || unescaped[leading] !== '<') return null
  if (
    unescaped.startsWith('<!--', leading) ||
    unescaped.startsWith('<?', leading) ||
    unescaped.startsWith('<!', leading)
  ) {
    return null
  }

  const tag = readTagAt(unescaped, leading)
  if (!tag || tag.isClose) return null

  let end: number
  if (tag.isSelfClosing) {
    end = tag.end
  } else {
    const closeAt = findMatchingCloseTag(unescaped, tag.tagName, tag.end)
    if (closeAt == null) return null
    const closeTag = readTagAt(unescaped, closeAt)
    if (!closeTag) return null
    end = closeTag.end
  }

  if (unescaped.slice(end).trim() !== '') return null
  return parseIndexedDocument(unescaped.slice(leading, end))
}

function readCommentSpan(content: string, index: number): { end: number; body: string } | null {
  if (!content.startsWith('<!--', index)) return null
  const close = content.indexOf('-->', index + 4)
  if (close < 0) return { end: content.length, body: content.slice(index + 4) }
  return { end: close + 3, body: content.slice(index + 4, close) }
}

function readTagAt(
  content: string,
  index: number,
): {
  source: string
  end: number
  isClose: boolean
  isSelfClosing: boolean
  tagName: string
} | null {
  if (content[index] !== '<') return null

  const closeStart = index + 1
  const isClose = content[closeStart] === '/'
  const tagStart = isClose ? closeStart + 1 : closeStart
  const nameMatch = TAG_NAME.exec(content.slice(tagStart))
  if (!nameMatch) return null

  const tagName = stripPrefix(nameMatch[1])
  let cursor = tagStart + nameMatch[0].length
  let quote: "'" | '"' | null = null

  while (cursor < content.length) {
    const ch = content[cursor]
    if (quote) {
      if (ch === quote) quote = null
      cursor += 1
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      cursor += 1
      continue
    }
    if (ch === '>') {
      const source = content.slice(index, cursor + 1)
      const isSelfClosing = !isClose && source.endsWith('/>')
      return { source, end: cursor + 1, isClose, isSelfClosing, tagName }
    }
    cursor += 1
  }

  return null
}

export function encodeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function attachTextNode(
  parent: IndexedDocumentNode,
  childCounts: Map<string, number>,
  raw: string,
  start: number,
  end: number,
): void {
  if (end <= start) return
  if (isTextContainerTag(parent.tag) && !raw.trim()) return
  const index = childCounts.get(TEXT_NODE_TAG) ?? 0
  childCounts.set(TEXT_NODE_TAG, index + 1)
  parent.children.push({
    tag: TEXT_NODE_TAG,
    attributes: {},
    text: decodeXmlText(raw),
    children: [],
    path: [...parent.path, { tag: TEXT_NODE_TAG, index }],
    openTagStart: start,
    openTagEnd: end,
    closeTagEnd: end,
    selfClosing: false,
  })
}

function attachStyleContent(
  node: IndexedDocumentNode,
  raw: string,
  start: number,
  end: number,
): void {
  const cdata = /^(\s*)<!\[CDATA\[([\s\S]*?)\]\]>(\s*)$/.exec(raw)
  if (cdata) {
    node.text = cdata[2]
    node.textStart = start + cdata[1].length + '<![CDATA['.length
    node.textEnd = end - cdata[3].length - ']]>'.length
    node.textCdata = true
    return
  }

  node.text = decodeXmlText(raw)
  node.textStart = start
  node.textEnd = end
  node.textCdata = false
}

export function pathsEqual(a: PathSegment[], b: PathSegment[]): boolean {
  return (
    a.length === b.length &&
    a.every((segment, index) => {
      const other = b[index]
      return segment.tag === other.tag && segment.index === other.index
    })
  )
}

/**
 * Drop XML comments. Attribute values are left alone so a literal `<!--`
 * inside quotes is not mistaken for markup.
 */
export function stripXmlComments(content: string): string {
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

export function isXmlParsable(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed) return true
  try {
    // Comments are not part of the live tree; stripping them avoids false
    // failures from `--` inside comments (illegal in XML, used by our nest
    // escape and by some prose notes).
    const doc = new DOMParser().parseFromString(stripXmlComments(trimmed), 'image/svg+xml')
    return !doc.querySelector('parsererror')
  } catch {
    return false
  }
}

export function parseIndexedDocument(content: string): IndexedDocumentNode | null {
  const trimmed = content.trim()
  if (!trimmed) return null

  const rootCounts = new Map<string, number>()
  let root: IndexedDocumentNode | null = null
  const stack: {
    node: IndexedDocumentNode
    childCounts: Map<string, number>
    textStart: number
  }[] = []
  let i = 0

  function flushCharacterData(frame: (typeof stack)[number], end: number) {
    if (!holdsCharacterData(frame.node.tag)) return
    attachTextNode(
      frame.node,
      frame.childCounts,
      content.slice(frame.textStart, end),
      frame.textStart,
      end,
    )
  }

  while (i < content.length) {
    if (content[i] !== '<') {
      i += 1
      continue
    }

    const cdataTo = skipCdata(content, i)
    if (cdataTo !== i) {
      const parent = stack.at(-1)
      if (parent) {
        flushCharacterData(parent, i)
        parent.textStart = cdataTo
      }
      i = cdataTo
      continue
    }

    const comment = readCommentSpan(content, i)
    if (comment) {
      const parent = stack.at(-1)
      const inner =
        comment.end <= content.length ? tryParseSingleElementFragment(comment.body) : null
      if (inner && parent) {
        flushCharacterData(parent, i)
        const index = parent.childCounts.get(COMMENTED_ELEMENT_TAG) ?? 0
        parent.childCounts.set(COMMENTED_ELEMENT_TAG, index + 1)
        parent.node.children.push({
          tag: COMMENTED_ELEMENT_TAG,
          commentedOut: true,
          commentedTag: inner.tag,
          attributes: inner.attributes,
          text: null,
          children: [],
          path: [...parent.node.path, { tag: COMMENTED_ELEMENT_TAG, index }],
          openTagStart: i,
          openTagEnd: comment.end,
          closeTagEnd: comment.end,
          selfClosing: true,
        })
        parent.textStart = comment.end
        i = comment.end
        continue
      }
      if (parent) {
        flushCharacterData(parent, i)
        parent.textStart = comment.end
      }
      i = comment.end
      continue
    }

    const declTo = skipXmlDeclaration(content, i)
    if (declTo !== i) {
      const parent = stack.at(-1)
      if (parent) {
        flushCharacterData(parent, i)
        parent.textStart = declTo
      }
      i = declTo
      continue
    }

    const tag = readTagAt(content, i)
    if (!tag) break

    if (tag.isClose) {
      for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
        if (stack[depth].node.tag === tag.tagName) {
          const frame = stack[depth]
          frame.node.closeTagEnd = tag.end
          if (isStyleTag(frame.node.tag)) {
            attachStyleContent(
              frame.node,
              content.slice(frame.node.openTagEnd, i),
              frame.node.openTagEnd,
              i,
            )
          } else {
            flushCharacterData(frame, i)
          }
          stack.splice(depth)
          const parent = stack.at(-1)
          if (parent) parent.textStart = tag.end
          break
        }
      }
    } else {
      const parent = stack.at(-1)
      if (parent) flushCharacterData(parent, i)

      const inner = tag.source.slice(1, tag.source.endsWith('/>') ? -2 : -1)
      const attributes = parseAttributes(inner)

      let path: PathSegment[]
      if (parent) {
        const index = parent.childCounts.get(tag.tagName) ?? 0
        parent.childCounts.set(tag.tagName, index + 1)
        path = [...parent.node.path, { tag: tag.tagName, index }]
      } else {
        const index = rootCounts.get(tag.tagName) ?? 0
        rootCounts.set(tag.tagName, index + 1)
        path = [{ tag: tag.tagName, index }]
      }

      const node: IndexedDocumentNode = {
        tag: tag.tagName,
        attributes,
        text: null,
        children: [],
        path,
        openTagStart: i,
        openTagEnd: tag.end,
        closeTagEnd: tag.isSelfClosing ? tag.end : null,
        selfClosing: tag.isSelfClosing,
      }

      if (parent) {
        parent.node.children.push(node)
      } else {
        root = node
      }

      if (tag.isSelfClosing) {
        if (parent) parent.textStart = tag.end
      } else {
        stack.push({ node, childCounts: new Map(), textStart: tag.end })
      }
    }

    i = tag.end
  }

  return root
}

/** @deprecated Use parseIndexedDocument */
export function parseDocumentTree(content: string): IndexedDocumentNode | null {
  return parseIndexedDocument(content)
}

export function findNodeByPath(
  root: IndexedDocumentNode | null,
  path: PathSegment[],
): IndexedDocumentNode | null {
  if (!root || !path.length) return null
  if (pathsEqual(root.path, path)) return root

  for (const child of root.children) {
    const found = findNodeByPath(child, path)
    if (found) return found
  }

  return null
}

/** Deepest indexed node whose source span covers `offset`. */
export function findNodeCoveringOffset(
  root: IndexedDocumentNode | null,
  offset: number,
): IndexedDocumentNode | null {
  if (!root) return null

  function walk(node: IndexedDocumentNode): IndexedDocumentNode | null {
    const end = node.closeTagEnd ?? node.openTagEnd
    if (offset < node.openTagStart || offset >= end) return null
    for (const child of node.children) {
      const hit = walk(child)
      if (hit) return hit
    }
    return node
  }

  return walk(root)
}

export function findElementByPath(content: string, path: PathSegment[]): ElementContext | null {
  const node = findNodeByPath(parseIndexedDocument(content), path)
  if (!node) return null
  return nodeToContext(node)
}

function nodeToContext(node: IndexedDocumentNode): ElementContext {
  return {
    tagName: node.commentedOut ? (node.commentedTag ?? node.tag) : node.tag,
    depth: Math.max(0, node.path.length - 1),
    path: node.path,
    openTagStart: node.openTagStart,
    openTagEnd: node.openTagEnd,
    existingAttributes: node.attributes,
    commentedOut: node.commentedOut === true,
  }
}

export function cursorOffsetForPath(content: string, path: PathSegment[]): number | null {
  const node = findNodeByPath(parseIndexedDocument(content), path)
  if (!node) return null

  if (node.commentedOut || isCommentedElementTag(node.tag)) {
    return node.openTagStart
  }

  if (isTextNodeTag(node.tag)) {
    return node.openTagStart
  }

  if (node.selfClosing) {
    const openTag = content.slice(node.openTagStart, node.openTagEnd)
    return node.openTagEnd - (openTag.endsWith('/>') ? 2 : 1)
  }

  // Keep the caret on the open tag so text containers stay distinct from their text child.
  if (holdsCharacterData(node.tag)) {
    return Math.max(node.openTagStart, node.openTagEnd - 1)
  }

  return node.openTagEnd
}

export function findElementAtOffset(content: string, offset: number): ElementContext | null {
  const clamped = Math.max(0, Math.min(offset, content.length))
  const stack: OpenFrame[] = []
  const rootTagCounts = new Map<string, number>()
  let i = 0
  let candidate: ElementContext | null = null

  while (i < content.length) {
    if (content[i] !== '<') {
      i += 1
      continue
    }

    const next = skipXmlDeclaration(content, i)
    if (next !== i) {
      i = next
      continue
    }
    const comment = skipComment(content, i)
    if (comment !== i) {
      i = comment
      continue
    }
    const cdata = skipCdata(content, i)
    if (cdata !== i) {
      i = cdata
      continue
    }

    const tag = readTagAt(content, i)
    if (!tag) break

    if (tag.isClose) {
      for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
        if (stack[depth].tagName === tag.tagName) {
          stack.splice(depth)
          break
        }
      }
    } else {
      const inner = tag.source.slice(1, tag.source.endsWith('/>') ? -2 : -1)
      const attributes = parseAttributes(inner)

      let tagIndex: number
      if (stack.length) {
        const parent = stack[stack.length - 1]
        tagIndex = parent.childTagCounts.get(tag.tagName) ?? 0
        parent.childTagCounts.set(tag.tagName, tagIndex + 1)
      } else {
        tagIndex = rootTagCounts.get(tag.tagName) ?? 0
        rootTagCounts.set(tag.tagName, tagIndex + 1)
      }

      const frame: OpenFrame = {
        tagName: tag.tagName,
        tagIndex,
        openTagStart: i,
        openTagEnd: tag.end,
        attributes,
        selfClosing: tag.isSelfClosing,
        childTagCounts: new Map(),
      }

      if (clamped >= i && clamped <= tag.end) {
        const inOpenTag = clamped < tag.end || tag.isSelfClosing || !holdsCharacterData(tag.tagName)
        if (inOpenTag) {
          return frameToContext(stack, frame)
        }
      }

      if (!tag.isSelfClosing) {
        stack.push(frame)
      }
    }

    if (tag.end <= clamped && stack.length) {
      candidate = frameToContext(stack.slice(0, -1), stack[stack.length - 1])
    }

    i = tag.end
  }

  const covering = findNodeCoveringOffset(parseIndexedDocument(content), clamped)
  if (covering?.commentedOut) return nodeToContext(covering)

  return textNodeContextAtOffset(content, clamped, candidate) ?? candidate
}

function textNodeContextAtOffset(
  content: string,
  offset: number,
  element: ElementContext | null,
): ElementContext | null {
  if (!element || !holdsCharacterData(element.tagName)) return null
  const parent = findNodeByPath(parseIndexedDocument(content), element.path)
  if (!parent) return null
  const hit = parent.children.find((child) => {
    if (!isTextNodeTag(child.tag)) return false
    const end = child.closeTagEnd ?? child.openTagEnd
    return offset >= child.openTagStart && offset < end
  })
  if (!hit) return null
  return {
    tagName: TEXT_NODE_TAG,
    depth: element.depth + 1,
    path: hit.path,
    openTagStart: hit.openTagStart,
    openTagEnd: hit.closeTagEnd ?? hit.openTagEnd,
    existingAttributes: {},
  }
}

function frameToContext(ancestors: OpenFrame[], frame: OpenFrame): ElementContext {
  const path: PathSegment[] = [
    ...ancestors.map((item) => ({ tag: item.tagName, index: item.tagIndex })),
    { tag: frame.tagName, index: frame.tagIndex },
  ]
  return {
    tagName: frame.tagName,
    depth: ancestors.length,
    path,
    openTagStart: frame.openTagStart,
    openTagEnd: frame.openTagEnd,
    existingAttributes: frame.attributes,
  }
}

function lineIndentAt(content: string, index: number): string {
  const lineStart = content.lastIndexOf('\n', Math.max(0, index - 1)) + 1
  const line = content.slice(lineStart, index)
  const match = /^[\t ]*/.exec(line)
  return match?.[0] ?? ''
}

function findMatchingCloseTag(content: string, tagName: string, fromIndex: number): number | null {
  let depth = 1
  let i = fromIndex

  while (i < content.length) {
    if (content[i] !== '<') {
      i += 1
      continue
    }

    const comment = skipComment(content, i)
    if (comment !== i) {
      i = comment
      continue
    }

    const tag = readTagAt(content, i)
    if (!tag) break

    if (tag.isClose) {
      if (tag.tagName === tagName) {
        depth -= 1
        if (depth === 0) return i
      }
    } else if (!tag.isSelfClosing && tag.tagName === tagName) {
      depth += 1
    }

    i = tag.end
  }

  return null
}

interface AttributeRange {
  name: string
  value: string
  nameStart: number
  nameEnd: number
  valueStart: number
  valueEnd: number
  quoted: boolean
  quoteChar: '"' | "'" | null
}

function parseAttributeRanges(openTagSource: string, openTagStart: number): AttributeRange[] {
  const ranges: AttributeRange[] = []
  const pattern = /([:@A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(openTagSource))) {
    const name = match[1]
    if (name === '/' || name.startsWith('?')) continue
    const rawValue = match[2]
    const value = match[3] ?? match[4] ?? match[5] ?? ''
    const nameStart = openTagStart + match.index
    const nameEnd = nameStart + name.length
    const valueTokenStart = openTagStart + match.index + match[0].indexOf(rawValue)
    const quoted = rawValue.startsWith('"') || rawValue.startsWith("'")
    const quoteChar = quoted ? (rawValue[0] as '"' | "'") : null
    const valueStart = quoted ? valueTokenStart + 1 : valueTokenStart
    const valueEnd = quoted
      ? valueTokenStart + rawValue.length - 1
      : valueTokenStart + rawValue.length
    ranges.push({
      name,
      value,
      nameStart,
      nameEnd,
      valueStart,
      valueEnd,
      quoted,
      quoteChar,
    })
  }
  return ranges
}

function attributeValueCursor(
  openTagSource: string,
  attrName: string,
  openTagStart: number,
): number | null {
  for (const range of parseAttributeRanges(openTagSource, openTagStart)) {
    if (range.name !== attrName) continue
    return range.valueStart
  }
  return null
}

export function findAttributeAtOffset(content: string, offset: number): AttributeContext | null {
  const element = findElementAtOffset(content, offset)
  if (!element || element.commentedOut) return null

  const openTag = content.slice(element.openTagStart, element.openTagEnd)
  for (const range of parseAttributeRanges(openTag, element.openTagStart)) {
    const inName = offset >= range.nameStart && offset <= range.nameEnd
    const inValue = offset >= range.valueStart && offset <= range.valueEnd
    if (!inName && !inValue) continue
    return {
      path: element.path,
      tagName: element.tagName,
      attrName: range.name,
      value: range.value,
      valueStart: range.valueStart,
      valueEnd: range.valueEnd,
      quoted: range.quoted,
      quoteChar: range.quoteChar,
    }
  }

  return null
}

function replaceAttributeValue(openTag: string, attrName: string, newValue: string): string | null {
  const ranges = parseAttributeRanges(openTag, 0)
  const range = ranges.find((entry) => entry.name === attrName)
  if (!range) return null

  const encoded =
    range.quoteChar === '"'
      ? `"${newValue}"`
      : range.quoteChar === "'"
        ? `'${newValue}'`
        : newValue
  // Replace the whole value token (quotes included when present).
  const valueTokenStart = range.quoted ? range.valueStart - 1 : range.valueStart
  const valueTokenEnd = range.quoted ? range.valueEnd + 1 : range.valueEnd
  return openTag.slice(0, valueTokenStart) + encoded + openTag.slice(valueTokenEnd)
}

export function updateAttribute(
  content: string,
  path: PathSegment[],
  attrName: string,
  newValue: string,
): EditResult | null {
  const context = findElementByPath(content, path)
  if (!context || context.commentedOut) return null
  if (context.existingAttributes[attrName] === undefined) return null

  const openTag = content.slice(context.openTagStart, context.openTagEnd)
  const updated = replaceAttributeValue(openTag, attrName, newValue)
  if (!updated) return null

  const next = content.slice(0, context.openTagStart) + updated + content.slice(context.openTagEnd)

  const cursor =
    attributeValueCursor(updated, attrName, context.openTagStart) ??
    Math.min(context.openTagStart + updated.length, next.length)

  return { content: next, cursor }
}

function removeAttributeFromOpenTag(openTag: string, attrName: string): string | null {
  const ranges = parseAttributeRanges(openTag, 0)
  const range = ranges.find((entry) => entry.name === attrName)
  if (!range) return null

  const valueTokenStart = range.quoted ? range.valueStart - 1 : range.valueStart
  const valueTokenEnd = range.quoted ? range.valueEnd + 1 : range.valueEnd
  // Include the whitespace before the attribute name.
  let start = range.nameStart
  while (start > 0 && /[ \t\r\n]/.test(openTag[start - 1])) start -= 1
  // Keep at least one space if we would glue the previous token to the next.
  if (start === range.nameStart && start > 0) {
    // no leading whitespace — unusual but avoid eating into the tag name
  }
  return openTag.slice(0, start) + openTag.slice(valueTokenEnd)
}

/**
 * An element that owns its line takes that whole line with it — its indentation
 * and the newline that ends it, but never the newline before it as well, or the
 * next sibling gets pulled up onto the previous line.
 */
function trimDeletionRange(content: string, start: number, end: number) {
  let nextStart = start
  while (nextStart > 0 && /[ \t]/.test(content[nextStart - 1])) {
    nextStart -= 1
  }
  const ownsLine = nextStart === 0 || content[nextStart - 1] === '\n'
  if (!ownsLine) return { start: nextStart, end }

  let nextEnd = end
  while (nextEnd < content.length && /[ \t]/.test(content[nextEnd])) {
    nextEnd += 1
  }
  if (nextEnd < content.length && content[nextEnd] === '\n') {
    nextEnd += 1
  }

  return { start: nextStart, end: nextEnd }
}

/**
 * `viewBox` names the coordinate space the inserted value should be sized to.
 * Callers that know the element sits in a narrower space (a marker, a symbol)
 * pass that space; the document viewport is the fallback.
 */
export function insertAttribute(
  content: string,
  offset: number,
  attrName: string,
  viewBox: ViewBox = parseViewBoxFromContent(content),
): EditResult | null {
  const context = findElementAtOffset(content, offset)
  if (!context || context.commentedOut) return null

  const openTag = content.slice(context.openTagStart, context.openTagEnd)
  const existing = context.existingAttributes[attrName]
  if (existing !== undefined) {
    const valueCursor = attributeValueCursor(openTag, attrName, context.openTagStart)
    if (valueCursor != null) {
      return { content, cursor: valueCursor }
    }
  }

  // An animation element takes its values from the element it is attached to, so
  // the parent is named alongside the element the attribute lands on.
  const value = defaultAttributeValue(attrName, viewBox, context.tagName, context.path.at(-2)?.tag)
  const insertion = ` ${attrName}="${value}"`
  const insertAt = context.openTagEnd - (openTag.endsWith('/>') ? 2 : 1)
  const next = content.slice(0, insertAt) + insertion + content.slice(insertAt)
  const cursor = insertAt + insertion.indexOf('"') + 1
  return { content: next, cursor }
}

/**
 * The element's name as the document spells it, which is what a close tag has to
 * repeat: XML is case-sensitive, and the parsed name is lowercased with any
 * namespace prefix removed, so `<feGaussianBlur/>` would otherwise be closed as
 * `</fegaussianblur>`.
 */
function authoredTagName(openTag: string): string | null {
  return /^<\s*([A-Za-z_][\w:.-]*)/.exec(openTag)?.[1] ?? null
}

/**
 * Land the caret where the next edit is most likely to go: inside the open tag
 * of a self-closing element, and between the tags of a container.
 */
function cursorInsideInsertedTag(content: string, start: number): number {
  const tag = readTagAt(content, start)
  if (!tag) return start
  return tag.isSelfClosing ? tag.end - 2 : tag.end
}

function insertTextNodeChild(content: string, context: ElementContext): EditResult | null {
  if (!holdsCharacterData(context.tagName)) return null

  const parent = findNodeByPath(parseIndexedDocument(content), context.path)
  if (!parent) return null

  const hasText = parent.children.some((child) => isTextNodeTag(child.tag))
  const hasElements = parent.children.some((child) => !isTextNodeTag(child.tag))
  if (isDescriptiveTag(context.tagName) && hasText) return null
  if (isTextContainerTag(context.tagName) && hasText && !hasElements) return null

  const text = encodeXmlText(defaultTextNodeContent(context.tagName))
  const openTag = content.slice(context.openTagStart, context.openTagEnd)

  if (openTag.endsWith('/>')) {
    const tagName = authoredTagName(openTag) ?? context.tagName
    const replacementOpen = openTag.replace(/\/>$/, '>')
    const block = `${replacementOpen}${text}</${tagName}>`
    const next = content.slice(0, context.openTagStart) + block + content.slice(context.openTagEnd)
    return { content: next, cursor: context.openTagStart + replacementOpen.length }
  }

  const closeIndex = findMatchingCloseTag(content, context.tagName, context.openTagEnd)
  if (closeIndex == null) return null

  if (isDescriptiveTag(context.tagName) && content.slice(context.openTagEnd, closeIndex).length) {
    return null
  }

  const next = content.slice(0, closeIndex) + text + content.slice(closeIndex)
  return { content: next, cursor: closeIndex }
}

export function insertChildElement(
  content: string,
  offset: number,
  childTag: string,
  snippetMode: SnippetMode = DEFAULT_SNIPPET_MODE,
  viewBox: ViewBox = parseViewBoxFromContent(content),
): EditResult | null {
  const context = findElementAtOffset(content, offset)
  if (!context || context.commentedOut || isTextNodeTag(context.tagName)) return null

  const schema = getElementSchema(context.tagName)
  const normalizedChild = normalizeTagName(childTag)
  // The content model only decides the bare form a shape is written in; what may
  // be nested inside it is `children`, which is how `<circle/>` still accepts an
  // animation element.
  if (schema?.contentModel === 'empty' && !schema.children.length) return null
  if (
    schema &&
    schema.children.length &&
    !schema.children.some((tag) => normalizeTagName(tag) === normalizedChild)
  ) {
    return null
  }

  if (isTextNodeTag(childTag)) {
    return insertTextNodeChild(content, context)
  }

  const snippet = getSnippetForTag(childTag, viewBox, snippetMode, context.tagName)
  const parentIndent = lineIndentAt(content, context.openTagStart)
  const childIndent = `${parentIndent}  `
  const formatted = snippet
    .split('\n')
    .map((line) => `${childIndent}${line}`)
    .join('\n')

  const openTag = content.slice(context.openTagStart, context.openTagEnd)
  if (openTag.endsWith('/>')) {
    const tagName = authoredTagName(openTag) ?? context.tagName
    const replacementOpen = openTag.replace(/\/>$/, '>')
    const block = `${replacementOpen}\n${formatted}\n${parentIndent}</${tagName}>`
    const next = content.slice(0, context.openTagStart) + block + content.slice(context.openTagEnd)
    const insertedAt = context.openTagStart + replacementOpen.length + 1 + childIndent.length
    return { content: next, cursor: cursorInsideInsertedTag(next, insertedAt) }
  }

  const closeIndex = findMatchingCloseTag(content, context.tagName, context.openTagEnd)
  if (closeIndex == null) return null

  // Absorb the whitespace already sitting before the close tag, so repeated
  // inserts do not leave a trail of blank lines behind.
  let insertAt = closeIndex
  while (insertAt > context.openTagEnd && /\s/.test(content[insertAt - 1])) insertAt -= 1

  const insertion = `\n${formatted}\n${parentIndent}`
  const next = content.slice(0, insertAt) + insertion + content.slice(closeIndex)
  const insertedAt = insertAt + 1 + childIndent.length
  return { content: next, cursor: cursorInsideInsertedTag(next, insertedAt) }
}

export function updateTextNode(
  content: string,
  path: PathSegment[],
  value: string,
): EditResult | null {
  const node = findNodeByPath(parseIndexedDocument(content), path)
  if (!node || !isTextNodeTag(node.tag) || node.closeTagEnd == null) return null

  const encoded = encodeXmlText(value)
  const next = content.slice(0, node.openTagStart) + encoded + content.slice(node.closeTagEnd)
  return { content: next, cursor: node.openTagStart }
}

export function updateStyleContent(
  content: string,
  path: PathSegment[],
  value: string,
): EditResult | null {
  const node = findNodeByPath(parseIndexedDocument(content), path)
  if (!node || !isStyleTag(node.tag)) return null

  if (node.selfClosing) {
    const openTag = content.slice(node.openTagStart, node.openTagEnd)
    const tagName = authoredTagName(openTag) ?? 'style'
    const expanded = `${openTag.replace(/\/>$/, '>')}${encodeXmlText(value)}</${tagName}>`
    const next = content.slice(0, node.openTagStart) + expanded + content.slice(node.openTagEnd)
    return { content: next, cursor: node.openTagStart + openTag.replace(/\/>$/, '>').length }
  }
  if (node.textStart == null || node.textEnd == null || node.closeTagEnd == null) return null

  const encoded = node.textCdata ? value.replace(/\]\]>/g, ']]]]><![CDATA[>') : encodeXmlText(value)
  const next = content.slice(0, node.textStart) + encoded + content.slice(node.textEnd)
  return { content: next, cursor: node.textStart }
}

export function deleteAttribute(
  content: string,
  path: PathSegment[],
  attrName: string,
): EditResult | null {
  const context = findElementByPath(content, path)
  if (!context || context.commentedOut) return null

  const openTag = content.slice(context.openTagStart, context.openTagEnd)
  const updated = removeAttributeFromOpenTag(openTag, attrName)
  if (!updated) return null

  const next = content.slice(0, context.openTagStart) + updated + content.slice(context.openTagEnd)
  const cursor = Math.min(context.openTagStart + updated.length, next.length)
  return { content: next, cursor }
}

const IGNORED_ATTRIBUTE_RE = /^ignore-(\d+)-(.+)$/

/** `ignore-0-fill` → `{ id: 0, base: 'fill' }`; bare `ignore-foo` is not matched. */
export function parseIgnoredAttributeName(name: string): { id: number; base: string } | null {
  const match = IGNORED_ATTRIBUTE_RE.exec(name)
  if (!match) return null
  return { id: Number(match[1]), base: match[2] }
}

export function isIgnoredAttributeName(name: string): boolean {
  return parseIgnoredAttributeName(name) !== null
}

export function ignoredAttributeName(id: number, base: string): string {
  return `ignore-${id}-${base}`
}

/** Lowest unused non-negative id among `ignore-N-<base>` on the element. */
export function nextIgnoreId(existing: Record<string, string>, base: string): number {
  const used = new Set<number>()
  for (const name of Object.keys(existing)) {
    const parsed = parseIgnoredAttributeName(name)
    if (parsed && parsed.base === base) used.add(parsed.id)
  }
  let id = 0
  while (used.has(id)) id += 1
  return id
}

function renameAttributeInOpenTag(openTag: string, from: string, to: string): string | null {
  const ranges = parseAttributeRanges(openTag, 0)
  const range = ranges.find((entry) => entry.name === from)
  if (!range) return null
  if (ranges.some((entry) => entry.name === to)) return null
  return openTag.slice(0, range.nameStart) + to + openTag.slice(range.nameEnd)
}

export function renameAttribute(
  content: string,
  path: PathSegment[],
  from: string,
  to: string,
): EditResult | null {
  if (from === to) return null

  const context = findElementByPath(content, path)
  if (!context || context.commentedOut) return null
  if (context.existingAttributes[from] === undefined) return null
  if (context.existingAttributes[to] !== undefined) return null

  const openTag = content.slice(context.openTagStart, context.openTagEnd)
  const updated = renameAttributeInOpenTag(openTag, from, to)
  if (!updated) return null

  const next = content.slice(0, context.openTagStart) + updated + content.slice(context.openTagEnd)
  const cursor =
    attributeValueCursor(updated, to, context.openTagStart) ??
    Math.min(context.openTagStart + updated.length, next.length)
  return { content: next, cursor }
}

/**
 * Toggle an attribute between live and `ignore-N-<name>`. Un-ignoring while the
 * base name is already present parks the live value under a new ignore id first.
 */
export function toggleIgnoreAttribute(
  content: string,
  path: PathSegment[],
  attrName: string,
): EditResult | null {
  const context = findElementByPath(content, path)
  if (!context || context.commentedOut) return null
  if (context.existingAttributes[attrName] === undefined) return null

  const parsed = parseIgnoredAttributeName(attrName)
  if (parsed) {
    const { base } = parsed
    if (context.existingAttributes[base] !== undefined) {
      const parkName = ignoredAttributeName(nextIgnoreId(context.existingAttributes, base), base)
      const parked = renameAttribute(content, path, base, parkName)
      if (!parked) return null
      return renameAttribute(parked.content, path, attrName, base)
    }
    return renameAttribute(content, path, attrName, base)
  }

  const ignored = ignoredAttributeName(nextIgnoreId(context.existingAttributes, attrName), attrName)
  return renameAttribute(content, path, attrName, ignored)
}

/**
 * A shape only spells out an open and close tag so it can hold something —
 * usually an animation. Once that content is gone the pair says nothing the
 * self-closing form does not, so fold it back.
 */
function collapseToSelfClosing(content: string, path: PathSegment[]): EditResult | null {
  if (!path.length) return null

  const node = findNodeByPath(parseIndexedDocument(content), path)
  if (!node || node.selfClosing || node.closeTagEnd == null) return null
  if (node.children.length) return null
  if (getElementSchema(node.tag)?.contentModel !== 'empty') return null

  const closeTagStart = content.lastIndexOf('<', node.closeTagEnd - 1)
  if (closeTagStart < node.openTagEnd) return null
  if (content.slice(node.openTagEnd, closeTagStart).trim()) return null

  const openTag = content.slice(node.openTagStart, node.openTagEnd)
  const selfClosed = openTag.replace(/\s*>$/, '/>')
  const next = content.slice(0, node.openTagStart) + selfClosed + content.slice(node.closeTagEnd)
  return { content: next, cursor: node.openTagStart + selfClosed.length - 2 }
}

export function deleteChildElement(content: string, path: PathSegment[]): EditResult | null {
  const node = findNodeByPath(parseIndexedDocument(content), path)
  if (!node) return null

  const end = node.closeTagEnd ?? node.openTagEnd
  const trimmed = isTextNodeTag(node.tag)
    ? { start: node.openTagStart, end }
    : trimDeletionRange(content, node.openTagStart, end)
  const next = content.slice(0, trimmed.start) + content.slice(trimmed.end)
  const cursor = Math.min(trimmed.start, next.length)
  return collapseToSelfClosing(next, path.slice(0, -1)) ?? { content: next, cursor }
}

/**
 * Wrap a live element in `<!-- … -->`, escaping any `-->` in the range so
 * nested comments cannot truncate the wrap.
 */
export function commentOutElement(content: string, path: PathSegment[]): EditResult | null {
  if (path.length <= 1) return null

  const node = findNodeByPath(parseIndexedDocument(content), path)
  if (!node) return null
  if (node.commentedOut || isCommentedElementTag(node.tag) || isTextNodeTag(node.tag)) return null

  const end = node.closeTagEnd ?? node.openTagEnd
  const slice = content.slice(node.openTagStart, end)
  const replacement = `<!--${escapeCommentClosers(slice)}-->`
  const next = content.slice(0, node.openTagStart) + replacement + content.slice(end)
  return { content: next, cursor: node.openTagStart }
}

/** Restore a commented-out element by unescaping its body and removing the wrappers. */
export function uncommentElement(content: string, path: PathSegment[]): EditResult | null {
  const node = findNodeByPath(parseIndexedDocument(content), path)
  if (!node?.commentedOut) return null

  const end = node.closeTagEnd ?? node.openTagEnd
  const raw = content.slice(node.openTagStart, end)
  if (!raw.startsWith('<!--') || !raw.endsWith('-->')) return null

  const restored = unescapeCommentClosers(raw.slice(4, -3))
  const next = content.slice(0, node.openTagStart) + restored + content.slice(end)
  return { content: next, cursor: node.openTagStart }
}

export function toggleCommentElement(content: string, path: PathSegment[]): EditResult | null {
  const node = findNodeByPath(parseIndexedDocument(content), path)
  if (!node) return null
  if (node.commentedOut || isCommentedElementTag(node.tag)) {
    return uncommentElement(content, path)
  }
  return commentOutElement(content, path)
}

/**
 * Deleting an element renumbers the same-tag siblings that follow it, so a
 * stored selection has to shift down with them or it starts pointing at its
 * neighbour. Anything inside the deleted subtree has nothing left to point at.
 */
export function remapPathsAfterDelete(
  paths: PathSegment[][],
  deleted: PathSegment[],
): PathSegment[][] {
  if (!deleted.length) return paths

  const depth = deleted.length - 1
  const parent = deleted.slice(0, depth)
  const removed = deleted[depth]
  const kept: PathSegment[][] = []

  for (const path of paths) {
    if (path.length <= depth) {
      kept.push(path)
      continue
    }
    if (!pathsEqual(path.slice(0, depth), parent)) {
      kept.push(path)
      continue
    }

    const segment = path[depth]
    if (segment.tag !== removed.tag) {
      kept.push(path)
      continue
    }
    if (segment.index === removed.index) continue
    if (segment.index < removed.index) {
      kept.push(path)
      continue
    }

    const shifted = [...path]
    shifted[depth] = { tag: segment.tag, index: segment.index - 1 }
    kept.push(shifted)
  }

  return kept
}

export function formatElementPath(path: PathSegment[]): string {
  if (!path.length) return '(none)'
  return path.map(formatPathSegment).join(' › ')
}

export function attributeIdentity(attr: Pick<AttributeContext, 'attrName' | 'path'>): string {
  const pathKey = attr.path.map((segment) => `${segment.tag}:${segment.index}`).join('/')
  return `${attr.attrName}@${pathKey}`
}

export function getViewBox(content: string): ViewBox {
  return parseViewBoxFromContent(content)
}
