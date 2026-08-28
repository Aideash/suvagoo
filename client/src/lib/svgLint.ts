import { xmlLanguage } from '@codemirror/lang-xml'
import type { SyntaxNode, Tree } from '@lezer/common'
import {
  ANIMATION_ELEMENTS,
  DESCRIPTIVE_ELEMENTS,
  FILTER_PRIMITIVE_ELEMENTS,
  getElementSchema,
  isAnimationTag,
  isDescriptiveTag,
} from './svgSchema'

export type SvgLintSeverity = 'error' | 'warning'

export interface SvgLintProblem {
  from: number
  to: number
  severity: SvgLintSeverity
  message: string
  /** Stable identifier for the check that produced the problem. */
  rule: string
}

/** A malformed document cascades; past this many problems the rest is noise. */
const MAX_PROBLEMS = 200

/**
 * Valid SVG elements the builder schema leaves out because they hold no
 * geometry to edit. Without them the linter would call `<metadata>` unknown.
 */
const EXTRA_SVG_TAGS = ['metadata', 'style', 'script', 'switch', 'a', 'view'] as const

/** Elements that may sit under any parent, so the nesting rules skip them. */
const ANYWHERE_TAGS = new Set<string>([
  ...EXTRA_SVG_TAGS,
  ...ANIMATION_ELEMENTS,
  ...DESCRIPTIVE_ELEMENTS,
])

const LIGHT_SOURCE_PARENTS = ['feDiffuseLighting', 'feSpecularLighting'] as const

/**
 * Where a specialised element is the only thing that makes sense. Written as
 * "this child needs that parent" rather than read off each schema's `children`
 * list, because those lists are curated for the insert menu and are narrower
 * than SVG allows — a `<linearGradient>` directly under `<svg>` is valid markup
 * that the menu simply never offers there.
 */
const REQUIRED_PARENTS: Record<string, readonly string[]> = {
  stop: ['linearGradient', 'radialGradient'],
  tspan: ['text', 'tspan', 'textPath'],
  textPath: ['text', 'tspan'],
  mpath: ['animateMotion'],
  feMergeNode: ['feMerge'],
  feFuncR: ['feComponentTransfer'],
  feFuncG: ['feComponentTransfer'],
  feFuncB: ['feComponentTransfer'],
  feFuncA: ['feComponentTransfer'],
  feDistantLight: LIGHT_SOURCE_PARENTS,
  fePointLight: LIGHT_SOURCE_PARENTS,
  feSpotLight: LIGHT_SOURCE_PARENTS,
  ...Object.fromEntries(FILTER_PRIMITIVE_ELEMENTS.map((tag) => [tag, ['filter']])),
}

/** Attributes every element accepts, whatever it is. */
const CORE_ATTRIBUTES = [
  'id',
  'class',
  'style',
  'lang',
  'tabindex',
  'role',
  'requiredExtensions',
  'requiredFeatures',
  'systemLanguage',
  'externalResourcesRequired',
] as const

/**
 * Attributes the builder schema omits because it only writes SVG 2, kept so
 * that a file exported by an older tool does not light up.
 */
const LEGACY_ATTRIBUTES_BY_TAG: Record<string, readonly string[]> = {
  svg: ['version', 'baseProfile', 'zoomAndPan', 'contentScriptType', 'contentStyleType'],
}

/**
 * Presentation attributes, which apply to anything that gets painted. Withheld
 * from filter and animation elements: neither is painted, so a `stroke` on one
 * does nothing and is worth pointing out.
 */
const PRESENTATION_ATTRIBUTES = [
  'alignment-baseline',
  'baseline-shift',
  'clip',
  'clip-path',
  'clip-rule',
  'color',
  'color-interpolation',
  'color-rendering',
  'cursor',
  'direction',
  'display',
  'dominant-baseline',
  'fill',
  'fill-opacity',
  'fill-rule',
  'filter',
  'font-family',
  'font-size',
  'font-size-adjust',
  'font-stretch',
  'font-style',
  'font-variant',
  'font-weight',
  'image-rendering',
  'isolation',
  'kerning',
  'letter-spacing',
  'marker',
  'marker-end',
  'marker-mid',
  'marker-start',
  'mask',
  'mix-blend-mode',
  'opacity',
  'overflow',
  'paint-order',
  'pointer-events',
  'shape-rendering',
  'stop-color',
  'stop-opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'text-decoration',
  'text-rendering',
  'transform',
  'transform-origin',
  'unicode-bidi',
  'vector-effect',
  'visibility',
  'white-space',
  'word-spacing',
  'writing-mode',
] as const

/** Namespaces, ARIA, data attributes, event handlers, and reserved prefixes. */
function isExemptAttribute(name: string): boolean {
  if (name.startsWith('ignore-') || name.startsWith('data-') || name.startsWith('aria-')) {
    return true
  }
  if (name === 'xmlns' || name.startsWith('xmlns:') || name.startsWith('xml:')) return true
  if (name.startsWith('xlink:')) return true
  return /^on[a-z]+$/.test(name)
}

interface ScanResult {
  problems: SvgLintProblem[]
  /** Set when the document is broken in a way that makes a parse meaningless. */
  fatal: boolean
}

/** Offsets of every line start, for turning an offset into a line number. */
function lineStarts(source: string): number[] {
  const starts = [0]
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') starts.push(i + 1)
  }
  return starts
}

function lineNumberAt(starts: number[], offset: number): number {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (starts[mid] <= offset) low = mid
    else high = mid - 1
  }
  return low + 1
}

/**
 * Reports the problems a grammar cannot place usefully. An unclosed quote
 * swallows the rest of the file, so the parser only notices at the very end;
 * this walks the tags itself to point at the quote that opened the run.
 */
function scanTokens(source: string): ScanResult {
  const problems: SvgLintProblem[] = []
  let i = 0

  const fail = (from: number, to: number, message: string, rule: string): ScanResult => {
    problems.push({ from, to: Math.min(to, source.length), severity: 'error', message, rule })
    return { problems, fatal: true }
  }

  const unterminatedValue = (quoteStart: number, quote: '"' | "'"): ScanResult =>
    fail(
      quoteStart,
      quoteStart + 1,
      `Unterminated attribute value: this ${quote === '"' ? 'double' : 'single'} quote is never closed.`,
      'unterminated-value',
    )

  while (i < source.length) {
    if (source[i] !== '<') {
      i += 1
      continue
    }

    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4)
      if (end < 0) {
        return fail(i, i + 4, 'Unterminated comment: no matching `-->`.', 'unterminated-comment')
      }
      i = end + 3
      continue
    }

    if (source.startsWith('<![CDATA[', i)) {
      const end = source.indexOf(']]>', i + 9)
      if (end < 0) {
        return fail(
          i,
          i + 9,
          'Unterminated CDATA section: no matching `]]>`.',
          'unterminated-cdata',
        )
      }
      i = end + 3
      continue
    }

    if (source.startsWith('<?', i)) {
      const end = source.indexOf('?>', i + 2)
      if (end < 0) {
        return fail(
          i,
          i + 2,
          'Unterminated processing instruction: no matching `?>`.',
          'unterminated-instruction',
        )
      }
      i = end + 2
      continue
    }

    // Nothing that can start a tag, so this is text that forgot to escape.
    if (!/[A-Za-z_/!?]/.test(source[i + 1] ?? '')) {
      return fail(i, i + 1, 'A `<` in text must be written as `&lt;`.', 'bare-less-than')
    }

    const tagStart = i
    let cursor = i + 1
    let quote: '"' | "'" | null = null
    let quoteStart = -1
    let closed = false

    while (cursor < source.length) {
      const ch = source[cursor]

      if (quote) {
        // XML forbids `<` inside an attribute value, so the quote never closed.
        if (ch === '<') return unterminatedValue(quoteStart, quote)
        if (ch === quote) quote = null
        cursor += 1
        continue
      }

      if (ch === '"' || ch === "'") {
        quote = ch
        quoteStart = cursor
        cursor += 1
        continue
      }

      if (ch === '<') break

      if (ch === '>') {
        closed = true
        cursor += 1
        break
      }

      if (ch === '=') {
        cursor = reportUnquotedValue(source, cursor, problems)
        continue
      }

      cursor += 1
    }

    if (quote) return unterminatedValue(quoteStart, quote)
    if (!closed)
      return fail(tagStart, tagStart + 1, 'Unclosed tag: no matching `>`.', 'unclosed-tag')

    i = cursor
  }

  return { problems, fatal: false }
}

/** Walks past `name=value`, warning when the value carries no quotes. */
function reportUnquotedValue(source: string, equals: number, problems: SvgLintProblem[]): number {
  let cursor = equals + 1
  while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1

  const ch = source[cursor]
  if (ch === undefined || ch === '"' || ch === "'" || ch === '>' || ch === '<') return cursor

  const start = cursor
  while (cursor < source.length && !/[\s>]/.test(source[cursor])) cursor += 1
  problems.push({
    from: start,
    to: cursor,
    severity: 'warning',
    message: 'Attribute value should be quoted.',
    rule: 'unquoted-value',
  })
  return cursor
}

/** The `OpenTag` or `SelfClosingTag` that names an `Element`. */
function tagNode(element: SyntaxNode): SyntaxNode | null {
  const first = element.firstChild
  if (!first) return null
  return first.name === 'OpenTag' || first.name === 'SelfClosingTag' ? first : null
}

function tagNameNode(element: SyntaxNode): SyntaxNode | null {
  return tagNode(element)?.getChild('TagName') ?? null
}

function textOf(source: string, node: SyntaxNode | null): string {
  return node ? source.slice(node.from, node.to) : ''
}

/** Diagnostics need width to be clickable, and zero-length nodes have none. */
function visibleRange(source: string, from: number, to: number): { from: number; to: number } {
  if (to > from) return { from, to }
  if (from < source.length) return { from, to: from + 1 }
  return { from: Math.max(0, from - 1), to: from }
}

function collectSyntaxProblems(
  source: string,
  tree: Tree,
  starts: number[],
  problems: SvgLintProblem[],
): void {
  /** Scanner findings are more specific than the parser's recovery errors. */
  const explained = problems.slice()
  const seenErrors = new Set<number>()

  tree.iterate({
    enter: (node) => {
      if (problems.length >= MAX_PROBLEMS) return false

      if (node.name === 'MismatchedCloseTag') {
        const closing = textOf(source, node.node.getChild('TagName'))
        const parent = node.node.parent
        const opened = parent?.name === 'Element' ? tagNameNode(parent) : null
        problems.push({
          from: node.from,
          to: node.to,
          severity: 'error',
          message: opened
            ? `Closing tag \`</${closing}>\` does not match \`<${textOf(source, opened)}>\` opened on line ${lineNumberAt(starts, opened.from)}.`
            : `Stray closing tag \`</${closing}>\`: nothing is open here.`,
          rule: opened ? 'mismatched-close-tag' : 'stray-close-tag',
        })
        return
      }

      if (node.name === 'MissingCloseTag') {
        const parent = node.node.parent
        // A mismatched tag already explains why the element never closed.
        if (parent?.getChild('MismatchedCloseTag')) return
        const opened = parent?.name === 'Element' ? tagNameNode(parent) : null
        problems.push({
          ...(opened
            ? { from: opened.from, to: opened.to }
            : visibleRange(source, node.from, node.to)),
          severity: 'error',
          message: opened
            ? `\`<${textOf(source, opened)}>\` is never closed.`
            : 'Element is never closed.',
          rule: 'missing-close-tag',
        })
        return
      }

      if (node.type.isError) {
        if (seenErrors.has(node.from)) return
        seenErrors.add(node.from)
        const covered = explained.some(
          (problem) => node.from >= problem.from && node.from <= problem.to,
        )
        if (covered) return
        problems.push({
          ...visibleRange(source, node.from, node.to),
          severity: 'error',
          message: 'Unexpected syntax.',
          rule: 'syntax-error',
        })
      }
    },
  })
}

/** Canonical spelling of a tag, or null when SVG has no such element. */
function canonicalTag(name: string): string | null {
  const schema = getElementSchema(name)
  if (schema) return schema.tag
  const lowered = name.toLowerCase()
  return EXTRA_SVG_TAGS.find((tag) => tag === lowered) ?? null
}

function collectRootProblems(
  source: string,
  tree: Tree,
  starts: number[],
  problems: SvgLintProblem[],
): void {
  const roots = tree.topNode.getChildren('Element')

  if (!roots.length) {
    // With syntax errors about, a missing root is a symptom rather than a cause.
    if (problems.some((problem) => problem.severity === 'error')) return
    const start = source.length - source.trimStart().length
    problems.push({
      ...visibleRange(source, start, Math.min(start + 1, source.length)),
      severity: 'error',
      message: 'Document has no root element.',
      rule: 'no-root',
    })
    return
  }

  const [first, ...extras] = roots
  const firstName = tagNameNode(first)
  const written = textOf(source, firstName)
  // Compared on the canonical spelling so `<SVG>` is left to the casing check.
  if (written && canonicalTag(written) !== 'svg') {
    problems.push({
      from: firstName ? firstName.from : first.from,
      to: firstName ? firstName.to : Math.min(first.from + 1, source.length),
      severity: 'error',
      message: `Root element must be \`<svg>\`, found \`<${written}>\`.`,
      rule: 'root-not-svg',
    })
  }

  const openedLine = lineNumberAt(starts, first.from)
  for (const extra of extras) {
    const nameNode = tagNameNode(extra)
    problems.push({
      from: nameNode ? nameNode.from : extra.from,
      to: nameNode ? nameNode.to : Math.min(extra.from + 1, source.length),
      severity: 'error',
      message: `Only one root element is allowed; \`<${written || 'svg'}>\` already opened on line ${openedLine}.`,
      rule: 'multiple-roots',
    })
  }
}

const allowedAttributesByTag = new Map<string, Set<string>>()

function allowedAttributes(tag: string): Set<string> | null {
  const cached = allowedAttributesByTag.get(tag)
  if (cached) return cached

  const schema = getElementSchema(tag)
  if (!schema) return null

  const painted =
    !isAnimationTag(tag) && !isDescriptiveTag(tag) && tag !== 'filter' && !tag.startsWith('fe')
  const allowed = new Set<string>([
    ...schema.attributes,
    ...CORE_ATTRIBUTES,
    ...(LEGACY_ATTRIBUTES_BY_TAG[tag] ?? []),
    ...(painted ? PRESENTATION_ATTRIBUTES : []),
  ])
  allowedAttributesByTag.set(tag, allowed)
  return allowed
}

interface IdDefinition {
  tag: string
  line: number
}

function collectAttributeProblems(
  source: string,
  element: SyntaxNode,
  canonical: string | null,
  starts: number[],
  ids: Map<string, IdDefinition>,
  problems: SvgLintProblem[],
): void {
  const open = tagNode(element)
  if (!open) return

  const allowed = canonical ? allowedAttributes(canonical) : null
  const seen = new Set<string>()

  for (const attribute of open.getChildren('Attribute')) {
    if (problems.length >= MAX_PROBLEMS) return

    const nameNode = attribute.getChild('AttributeName')
    if (!nameNode) continue
    const name = textOf(source, nameNode)

    if (seen.has(name)) {
      problems.push({
        from: nameNode.from,
        to: nameNode.to,
        severity: 'error',
        message: `Duplicate attribute \`${name}\`.`,
        rule: 'duplicate-attribute',
      })
      continue
    }
    seen.add(name)

    if (name === 'id') {
      const valueNode = attribute.getChild('AttributeValue')
      const value = textOf(source, valueNode)
        .replace(/^['"]|['"]$/g, '')
        .trim()
      if (value) {
        const previous = ids.get(value)
        if (previous && valueNode) {
          problems.push({
            from: valueNode.from,
            to: valueNode.to,
            severity: 'warning',
            message: `Duplicate id \`${value}\`: already used by \`<${previous.tag}>\` on line ${previous.line}.`,
            rule: 'duplicate-id',
          })
        } else if (!previous) {
          ids.set(value, {
            tag: canonical ?? textOf(source, tagNameNode(element)),
            line: lineNumberAt(starts, nameNode.from),
          })
        }
      }
    }

    if (!allowed || isExemptAttribute(name) || allowed.has(name)) continue

    const canonicalAttribute = [...allowed].find(
      (candidate) => candidate.toLowerCase() === name.toLowerCase(),
    )
    problems.push({
      from: nameNode.from,
      to: nameNode.to,
      severity: 'warning',
      message: canonicalAttribute
        ? `Attribute names are case-sensitive: did you mean \`${canonicalAttribute}\`?`
        : `\`${name}\` is not a recognized attribute for \`<${canonical}>\`.`,
      rule: canonicalAttribute ? 'attribute-case' : 'unknown-attribute',
    })
  }
}

function collectSchemaProblems(
  source: string,
  tree: Tree,
  starts: number[],
  problems: SvgLintProblem[],
): void {
  const ids = new Map<string, IdDefinition>()

  const walk = (element: SyntaxNode, parent: string | null): void => {
    if (problems.length >= MAX_PROBLEMS) return

    const nameNode = tagNameNode(element)
    const written = textOf(source, nameNode)
    // A prefixed name belongs to another vocabulary, which we cannot judge.
    if (!written || written.includes(':')) return

    const canonical = canonicalTag(written)
    const range = nameNode
      ? { from: nameNode.from, to: nameNode.to }
      : visibleRange(source, element.from, element.from)

    if (!canonical) {
      problems.push({
        ...range,
        severity: 'warning',
        message: `Unrecognized SVG element \`<${written}>\`.`,
        rule: 'unknown-element',
      })
    } else if (canonical !== written) {
      problems.push({
        ...range,
        severity: 'warning',
        message: `SVG element names are case-sensitive: did you mean \`<${canonical}>\`?`,
        rule: 'element-case',
      })
    }

    if (canonical && parent) {
      const required = REQUIRED_PARENTS[canonical]
      const parentSchema = getElementSchema(parent)
      if (required && !required.includes(parent)) {
        const list = required.map((tag) => `\`<${tag}>\``).join(' or ')
        problems.push({
          ...range,
          severity: 'warning',
          message: `\`<${canonical}>\` is only valid inside ${list}.`,
          rule: 'invalid-nesting',
        })
      } else if (parentSchema?.contentModel === 'empty' && !ANYWHERE_TAGS.has(canonical)) {
        problems.push({
          ...range,
          severity: 'warning',
          message: `\`<${canonical}>\` is not valid inside \`<${parent}>\`, which takes no child elements.`,
          rule: 'invalid-nesting',
        })
      }
    }

    collectAttributeProblems(source, element, canonical, starts, ids, problems)

    // Anything below a foreignObject is host markup, not SVG.
    if (canonical === 'foreignObject') return

    for (const child of element.getChildren('Element')) walk(child, canonical)
  }

  for (const root of tree.topNode.getChildren('Element')) walk(root, null)
}

/**
 * One problem per range, keeping the graver one: a `<div>` root is already
 * explained by the root rule, so the unknown element warning on the same name
 * adds nothing.
 */
function strongestPerRange(problems: SvgLintProblem[]): SvgLintProblem[] {
  const byRange = new Map<string, SvgLintProblem>()
  for (const problem of problems) {
    const key = `${problem.from}:${problem.to}`
    const kept = byRange.get(key)
    if (!kept || (kept.severity === 'warning' && problem.severity === 'error')) {
      byRange.set(key, problem)
    }
  }
  return [...byRange.values()]
}

/**
 * Every problem found in `source`, as document offsets. Kept free of editor
 * types so it can be called on any string, and parses the document itself
 * rather than reading the editor's syntax tree, which only covers the part of
 * a long document that has been scrolled into view.
 */
export function lintSvgSource(source: string): SvgLintProblem[] {
  if (!source.trim()) return []

  const scan = scanTokens(source)
  if (scan.fatal) return scan.problems

  const problems = scan.problems
  const starts = lineStarts(source)
  const tree = xmlLanguage.parser.parse(source)

  collectSyntaxProblems(source, tree, starts, problems)
  collectRootProblems(source, tree, starts, problems)
  collectSchemaProblems(source, tree, starts, problems)

  return strongestPerRange(problems)
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .slice(0, MAX_PROBLEMS)
}
