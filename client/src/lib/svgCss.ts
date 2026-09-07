import { cssLanguage } from '@codemirror/lang-css'
import type { SyntaxNode } from '@lezer/common'

export interface CssDeclaration {
  from: number
  to: number
  name: string
  value: string
  nameFrom: number
  nameTo: number
  valueFrom: number
  valueTo: number
  disabled: boolean
}

export interface CssRule {
  from: number
  to: number
  header: string
  headerFrom: number
  headerTo: number
  bodyFrom: number
  bodyTo: number
  depth: number
  declarations: CssDeclaration[]
  canDeclare: boolean
}

export interface CssStylesheetModel {
  rules: CssRule[]
  hasSyntaxErrors: boolean
}

function directChildren(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = []
  const cursor = node.cursor()
  if (!cursor.firstChild()) return children
  do children.push(cursor.node)
  while (cursor.nextSibling())
  return children
}

function trimRange(source: string, from: number, to: number): { from: number; to: number } {
  while (from < to && /\s/.test(source[from])) from += 1
  while (to > from && /\s/.test(source[to - 1])) to -= 1
  return { from, to }
}

function parseDeclaration(source: string, node: SyntaxNode): CssDeclaration | null {
  const nameNode = node.getChild('PropertyName')
  if (!nameNode) return null
  const colon = source.indexOf(':', nameNode.to)
  if (colon < 0 || colon >= node.to) return null
  const valueRange = trimRange(source, colon + 1, node.to)
  return {
    from: node.from,
    to: node.to,
    name: source.slice(nameNode.from, nameNode.to),
    value: source.slice(valueRange.from, valueRange.to),
    nameFrom: nameNode.from,
    nameTo: nameNode.to,
    valueFrom: valueRange.from,
    valueTo: valueRange.to,
    disabled: false,
  }
}

function parseDisabledDeclaration(source: string, node: SyntaxNode): CssDeclaration | null {
  const raw = source.slice(node.from, node.to)
  const match = /^\/\*\s*([-\w]+)\s*:\s*([\s\S]*?);?\s*\*\/$/.exec(raw)
  if (!match) return null
  return {
    from: node.from,
    to: node.to,
    name: match[1],
    value: match[2].trim(),
    nameFrom: node.from,
    nameTo: node.to,
    valueFrom: node.from,
    valueTo: node.to,
    disabled: true,
  }
}

function blockFor(node: SyntaxNode): SyntaxNode | null {
  return node.getChild('Block') ?? node.getChild('KeyframeList')
}

function collectRule(source: string, node: SyntaxNode, depth: number, rules: CssRule[]): void {
  const block = blockFor(node)
  if (!block) return
  const headerRange = trimRange(source, node.from, block.from)
  const declarations: CssDeclaration[] = []
  const nested: SyntaxNode[] = []

  for (const child of directChildren(block)) {
    if (child.name === 'Declaration') {
      const declaration = parseDeclaration(source, child)
      if (declaration) declarations.push(declaration)
    } else if (child.name === 'Comment') {
      const declaration = parseDisabledDeclaration(source, child)
      if (declaration) declarations.push(declaration)
    } else if (blockFor(child)) {
      nested.push(child)
    }
  }

  rules.push({
    from: node.from,
    to: node.to,
    header: source.slice(headerRange.from, headerRange.to),
    headerFrom: headerRange.from,
    headerTo: headerRange.to,
    bodyFrom: block.from + 1,
    bodyTo: Math.max(block.from + 1, block.to - 1),
    depth,
    declarations,
    canDeclare:
      node.name === 'RuleSet' ||
      node.name === 'KeyframeSelector' ||
      (node.name === 'AtRule' && nested.length === 0),
  })
  for (const child of nested) collectRule(source, child, depth + 1, rules)
}

export function parseCssStylesheet(source: string): CssStylesheetModel {
  const tree = cssLanguage.parser.parse(source)
  const rules: CssRule[] = []
  for (const child of directChildren(tree.topNode)) {
    if (blockFor(child)) collectRule(source, child, 0, rules)
  }

  let hasSyntaxErrors = false
  tree.iterate({
    enter(node) {
      if (node.type.isError) hasSyntaxErrors = true
    },
  })
  return { rules, hasSyntaxErrors }
}

export function replaceCssRange(source: string, from: number, to: number, value: string): string {
  return source.slice(0, from) + value + source.slice(to)
}

export function deleteCssDeclaration(source: string, declaration: CssDeclaration): string {
  let to = declaration.to
  while (to < source.length && /[ \t]/.test(source[to])) to += 1
  if (source[to] === ';') to += 1
  return replaceCssRange(source, declaration.from, to, '')
}

export function toggleCssDeclaration(source: string, declaration: CssDeclaration): string {
  let to = declaration.to
  if (!declaration.disabled) {
    while (to < source.length && /[ \t]/.test(source[to])) to += 1
    if (source[to] === ';') to += 1
  }
  const replacement = declaration.disabled
    ? `${declaration.name}: ${declaration.value};`
    : `/* ${source.slice(declaration.from, to).trim().replace(/;?$/, ';')} */`
  return replaceCssRange(source, declaration.from, to, replacement)
}

export function addCssDeclaration(source: string, rule: CssRule): string {
  const beforeClose = source.slice(rule.bodyFrom, rule.bodyTo)
  const trailingLine = /\n([ \t]*)$/.exec(beforeClose)
  const closingIndent = trailingLine?.[1] ?? ''
  const indent = `${closingIndent}  `
  const insertAt = trailingLine ? rule.bodyTo - closingIndent.length : rule.bodyTo
  const prefix = trailingLine ? '' : '\n'
  return replaceCssRange(source, insertAt, insertAt, `${prefix}${indent}property: value;\n`)
}

export function addCssRule(source: string): string {
  const prefix = source.trim() ? '\n\n' : ''
  return `${source}${prefix}.class-name {\n  property: value;\n}`
}
