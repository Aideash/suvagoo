import {
  DEFAULT_SNIPPET_MODE,
  defaultAttributeValue,
  defaultTextNodeContent,
  formatPathSegment,
  getElementSchema,
  getSnippetForTag,
  holdsCharacterData,
  isDescriptiveTag,
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
  /** Character data when `tag` is `text_node`; otherwise null. */
  text: string | null
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

export function pathsEqual(a: PathSegment[], b: PathSegment[]): boolean {
  return (
    a.length === b.length &&
    a.every((segment, index) => {
      const other = b[index]
      return segment.tag === other.tag && segment.index === other.index
    })
  )
}

export function isXmlParsable(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed) return true
  try {
    const doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml')
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

    const skipTo = skipXmlDeclaration(content, skipComment(content, skipCdata(content, i)))
    if (skipTo !== i) {
      const parent = stack.at(-1)
      if (parent) {
        flushCharacterData(parent, i)
        parent.textStart = skipTo
      }
      i = skipTo
      continue
    }

    const tag = readTagAt(content, i)
    if (!tag) break

    if (tag.isClose) {
      for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
        if (stack[depth].node.tag === tag.tagName) {
          const frame = stack[depth]
          frame.node.closeTagEnd = tag.end
          flushCharacterData(frame, i)
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

export function findElementByPath(content: string, path: PathSegment[]): ElementContext | null {
  const node = findNodeByPath(parseIndexedDocument(content), path)
  if (!node) return null
  return nodeToContext(node)
}

function nodeToContext(node: IndexedDocumentNode): ElementContext {
  return {
    tagName: node.tag,
    depth: Math.max(0, node.path.length - 1),
    path: node.path,
    openTagStart: node.openTagStart,
    openTagEnd: node.openTagEnd,
    existingAttributes: node.attributes,
  }
}

export function cursorOffsetForPath(content: string, path: PathSegment[]): number | null {
  const node = findNodeByPath(parseIndexedDocument(content), path)
  if (!node) return null

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
  if (!element) return null

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
  const escaped = attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(\\b${escaped}\\s*=\\s*)("([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'i')
  if (!pattern.test(openTag)) return null
  return openTag.replace(pattern, (_match, prefix, rawValue) => {
    if (rawValue.startsWith('"')) return `${prefix}"${newValue}"`
    if (rawValue.startsWith("'")) return `${prefix}'${newValue}'`
    return `${prefix}${newValue}`
  })
}

export function updateAttribute(
  content: string,
  path: PathSegment[],
  attrName: string,
  newValue: string,
): EditResult | null {
  const context = findElementByPath(content, path)
  if (!context) return null
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
  const escaped = attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`\\s\\b${escaped}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'=<>\`]+)`, 'i')
  if (!pattern.test(openTag)) return null
  return openTag.replace(pattern, '')
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
  if (!context) return null

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
  if (!context || isTextNodeTag(context.tagName)) return null

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

export function deleteAttribute(
  content: string,
  path: PathSegment[],
  attrName: string,
): EditResult | null {
  const context = findElementByPath(content, path)
  if (!context) return null

  const openTag = content.slice(context.openTagStart, context.openTagEnd)
  const updated = removeAttributeFromOpenTag(openTag, attrName)
  if (!updated) return null

  const next = content.slice(0, context.openTagStart) + updated + content.slice(context.openTagEnd)
  const cursor = Math.min(context.openTagStart + updated.length, next.length)
  return { content: next, cursor }
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
