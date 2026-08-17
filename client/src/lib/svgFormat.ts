/** Re-lay out document source without changing what it renders. */

export type SvgFormatLayout = 'pretty' | 'compact'

const INDENT = '  '
const MAX_LINE_WIDTH = 100
/** Above this an element earns a line per attribute, even when it would fit. */
const INLINE_ATTRIBUTE_LIMIT = 3

/**
 * Whitespace inside these renders, so their source is copied through
 * untouched rather than re-indented.
 */
/** Attributes whose grammar tolerates a line break between tokens. */
const SPLITTABLE_ATTRIBUTES = new Set([
  'd',
  'transform',
  'gradientTransform',
  'patternTransform',
  'points',
  'values',
  'style',
])

const PRESERVE_TAGS = new Set([
  'text',
  'tspan',
  'textpath',
  'tref',
  'altglyph',
  'title',
  'desc',
  'style',
  'script',
  'metadata',
])

interface Attribute {
  name: string
  value: string
  quote: '"' | "'"
  /** Attributes written without a value, e.g. a stray flag in hand-typed markup. */
  bare: boolean
}

type FormatNode =
  | {
      kind: 'element'
      name: string
      attrs: Attribute[]
      selfClosing: boolean
      children: FormatNode[]
      start: number
      end: number
    }
  | { kind: 'raw'; text: string }
  | { kind: 'text'; text: string }

interface ScannedTag {
  source: string
  end: number
  isClose: boolean
  isSelfClosing: boolean
  name: string
}

const TAG_NAME = /^\/?([A-Za-z_][\w:.-]*)/

function readTagAt(content: string, index: number): ScannedTag | null {
  if (content[index] !== '<') return null

  const isClose = content[index + 1] === '/'
  const nameStart = isClose ? index + 2 : index + 1
  const nameMatch = TAG_NAME.exec(content.slice(nameStart))
  if (!nameMatch) return null

  let cursor = nameStart + nameMatch[0].length
  let quote: '"' | "'" | null = null

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
      return {
        source,
        end: cursor + 1,
        isClose,
        isSelfClosing: !isClose && source.endsWith('/>'),
        name: nameMatch[1],
      }
    }
    cursor += 1
  }

  return null
}

function parseAttributes(openTagSource: string, tagName: string): Attribute[] {
  const inner = openTagSource.slice(1, openTagSource.endsWith('/>') ? -2 : -1).slice(tagName.length)
  const pattern = /([:@A-Za-z_][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  const attrs: Attribute[] = []
  let match: RegExpExecArray | null

  while ((match = pattern.exec(inner))) {
    const [, name, doubleQuoted, singleQuoted, unquoted] = match
    const value = doubleQuoted ?? singleQuoted ?? unquoted
    attrs.push({
      name,
      value: value ?? '',
      quote: singleQuoted != null ? "'" : '"',
      bare: value == null,
    })
  }

  return attrs
}

/** Spans that are copied through verbatim: comments, CDATA, declarations, doctype. */
function readOpaqueSpan(content: string, index: number): { text: string; end: number } | null {
  const spans: [string, string][] = [
    ['<!--', '-->'],
    ['<![CDATA[', ']]>'],
    ['<?', '?>'],
    ['<!', '>'],
  ]
  for (const [open, close] of spans) {
    if (!content.startsWith(open, index)) continue
    const found = content.indexOf(close, index + open.length)
    const end = found >= 0 ? found + close.length : content.length
    return { text: content.slice(index, end), end }
  }
  return null
}

/** Returns null when the markup cannot be walked cleanly, so it is left alone. */
function scanNodes(content: string): FormatNode[] | null {
  const roots: FormatNode[] = []
  const stack: Extract<FormatNode, { kind: 'element' }>[] = []
  let i = 0
  let textStart = 0

  const siblings = () => (stack.length ? stack[stack.length - 1].children : roots)

  const flushText = (until: number) => {
    if (until <= textStart) return
    siblings().push({ kind: 'text', text: content.slice(textStart, until) })
  }

  while (i < content.length) {
    if (content[i] !== '<') {
      i += 1
      continue
    }

    const opaque = readOpaqueSpan(content, i)
    if (opaque) {
      flushText(i)
      siblings().push({ kind: 'raw', text: opaque.text })
      i = opaque.end
      textStart = i
      continue
    }

    const tag = readTagAt(content, i)
    if (!tag) return null

    flushText(i)

    if (tag.isClose) {
      const open = stack.pop()
      if (!open || open.name !== tag.name) return null
      open.end = tag.end
    } else {
      const node: Extract<FormatNode, { kind: 'element' }> = {
        kind: 'element',
        name: tag.name,
        attrs: parseAttributes(tag.source, tag.name),
        selfClosing: tag.isSelfClosing,
        children: [],
        start: i,
        end: tag.end,
      }
      siblings().push(node)
      if (!tag.isSelfClosing) stack.push(node)
    }

    i = tag.end
    textStart = i
  }

  flushText(content.length)

  return stack.length ? null : roots
}

function hasRenderedText(node: Extract<FormatNode, { kind: 'element' }>): boolean {
  return node.children.some((child) => child.kind === 'text' && child.text.trim() !== '')
}

function isPreserved(node: Extract<FormatNode, { kind: 'element' }>): boolean {
  if (PRESERVE_TAGS.has(node.name.toLowerCase().replace(/^.*:/, ''))) return true
  if (node.attrs.some((attr) => attr.name === 'xml:space' && attr.value.trim() === 'preserve')) {
    return true
  }
  return hasRenderedText(node)
}

/**
 * A previous pretty pass leaves newlines inside the values it split. Only those
 * attributes are re-flattened; whitespace an author put anywhere else stays put.
 */
function attributeValue(attr: Attribute): string {
  if (!SPLITTABLE_ATTRIBUTES.has(attr.name) || !attr.value.includes('\n')) return attr.value
  return attr.value.trim().replace(/\s+/g, ' ')
}

function renderAttribute(attr: Attribute): string {
  if (attr.bare) return attr.name
  return `${attr.name}=${attr.quote}${attributeValue(attr)}${attr.quote}`
}

function openTagTail(node: Extract<FormatNode, { kind: 'element' }>): string {
  if (node.selfClosing) return '/>'
  if (node.children.every((child) => child.kind === 'text' && child.text.trim() === '')) {
    return `></${node.name}>`
  }
  return '>'
}

function inlineOpenTag(node: Extract<FormatNode, { kind: 'element' }>): string {
  const attrs = node.attrs.map(renderAttribute).join(' ')
  return `<${node.name}${attrs ? ` ${attrs}` : ''}${openTagTail(node)}`
}

function splitPath(value: string): string[] | null {
  const first = value.search(/[MmLlHhVvCcSsQqTtAaZz]/)
  if (first < 0 || value.slice(0, first).trim()) return null
  const commands = value.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g)
  if (!commands || commands.length < 2) return null
  return commands.map((command) => command.trim().replace(/\s+/g, ' ')).filter(Boolean)
}

function splitTransform(value: string): string[] | null {
  const functions = value.match(/[A-Za-z]+\s*\([^()]*\)/g)
  if (!functions || functions.length < 2) return null
  // Anything the pattern missed would be dropped by the rewrite.
  if (value.replace(/[A-Za-z]+\s*\([^()]*\)/g, '').trim()) return null
  return functions.map((fn) => fn.replace(/\s+/g, ' '))
}

function packTokens(tokens: string[], available: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const token of tokens) {
    const next = current ? `${current} ${token}` : token
    if (current && next.length > available) {
      lines.push(current)
      current = token
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines
}

function splitPoints(value: string, available: number): string[] | null {
  const tokens = value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
  if (!tokens.length || tokens.length % 2 !== 0) return null
  const pairs: string[] = []
  for (let i = 0; i < tokens.length; i += 2) {
    pairs.push(`${tokens[i]},${tokens[i + 1]}`)
  }
  const lines = packTokens(pairs, available)
  return lines.length > 1 ? lines : null
}

/** `feColorMatrix` values read as a 4x5 matrix; one row per line makes that visible. */
function splitColorMatrix(value: string): string[] | null {
  const tokens = value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
  if (tokens.length !== 20) return null
  const rows: string[] = []
  for (let i = 0; i < 20; i += 5) {
    rows.push(tokens.slice(i, i + 5).join(' '))
  }
  return rows
}

/** A matrix is worth reading as rows whether or not the line would overflow. */
function alwaysSplits(tagName: string, attr: Attribute): boolean {
  return tagName === 'feColorMatrix' && attr.name === 'values' && !attr.bare
}

/** Structured values past this length pull their element onto multiple lines. */
const COMPLEX_VALUE_LENGTH = 40

function isComplex(tagName: string, attr: Attribute): boolean {
  if (attr.bare || !SPLITTABLE_ATTRIBUTES.has(attr.name)) return false
  return alwaysSplits(tagName, attr) || attributeValue(attr).length > COMPLEX_VALUE_LENGTH
}

function splitStyle(value: string): string[] | null {
  const declarations = value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
  if (declarations.length < 2) return null
  return declarations.map((declaration) => `${declaration};`)
}

function splitValue(tagName: string, attr: Attribute, available: number): string[] | null {
  if (attr.bare) return null
  const value = attributeValue(attr)
  switch (attr.name) {
    case 'd':
      return splitPath(value)
    case 'transform':
    case 'gradientTransform':
    case 'patternTransform':
      return splitTransform(value)
    case 'points':
      return splitPoints(value, available)
    case 'values':
      return tagName === 'feColorMatrix' ? splitColorMatrix(value) : null
    case 'style':
      return splitStyle(value)
    default:
      return null
  }
}

/**
 * Continuation lines sit under the opening quote. XML normalizes the newlines
 * back to spaces, so this only changes how the value reads.
 */
function attributeLines(tagName: string, attr: Attribute, indent: string): string[] {
  const rendered = `${indent}${renderAttribute(attr)}`
  if (rendered.length <= MAX_LINE_WIDTH && !alwaysSplits(tagName, attr)) return [rendered]

  const head = `${indent}${attr.name}=${attr.quote}`
  const parts = splitValue(tagName, attr, MAX_LINE_WIDTH - head.length)
  if (!parts) return [rendered]

  const continuation = ' '.repeat(head.length)
  return parts.map((part, index) => {
    const prefix = index === 0 ? head : continuation
    const suffix = index === parts.length - 1 ? attr.quote : ''
    return `${prefix}${part}${suffix}`
  })
}

function pushIndented(lines: string[], text: string, indent: string) {
  const [first, ...rest] = text.split('\n')
  lines.push(`${indent}${first}`)
  lines.push(...rest)
}

function printNodes(
  nodes: FormatNode[],
  depth: number,
  layout: SvgFormatLayout,
  source: string,
  lines: string[],
) {
  const indent = INDENT.repeat(depth)

  for (const node of nodes) {
    if (node.kind === 'text') {
      const trimmed = node.text.trim()
      if (trimmed) pushIndented(lines, trimmed, indent)
      continue
    }

    if (node.kind === 'raw') {
      pushIndented(lines, node.text, indent)
      continue
    }

    if (isPreserved(node)) {
      pushIndented(lines, source.slice(node.start, node.end), indent)
      continue
    }

    const tail = openTagTail(node)
    const inline = inlineOpenTag(node)
    const wrap =
      layout === 'pretty' &&
      (node.attrs.length > INLINE_ATTRIBUTE_LIMIT ||
        indent.length + inline.length > MAX_LINE_WIDTH ||
        node.attrs.some((attr) => isComplex(node.name, attr)))

    if (wrap) {
      lines.push(`${indent}<${node.name}`)
      for (const attr of node.attrs) {
        lines.push(...attributeLines(node.name, attr, indent + INDENT))
      }
      lines.push(`${indent}${tail}`)
    } else {
      lines.push(`${indent}${inline}`)
    }

    if (tail !== '>') continue

    printNodes(node.children, depth + 1, layout, source, lines)
    lines.push(`${indent}</${node.name}>`)
  }
}

/**
 * Returns null when the source cannot be reformatted safely, so callers can
 * report the failure instead of writing mangled markup back.
 */
export function formatSvgSource(content: string, layout: SvgFormatLayout): string | null {
  if (!content.trim()) return content

  const nodes = scanNodes(content)
  if (!nodes) return null

  const lines: string[] = []
  printNodes(nodes, 0, layout, content, lines)
  return lines.join('\n')
}
