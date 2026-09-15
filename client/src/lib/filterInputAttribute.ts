import {
  findNodeByPath,
  parseIndexedDocument,
  pathsEqual,
  type IndexedDocumentNode,
  type PathSegment,
} from './svgDocument'
import { getElementSchema, isTextNodeTag } from './svgSchema'

export const STANDARD_FILTER_INPUTS = [
  'SourceGraphic',
  'SourceAlpha',
  'BackgroundImage',
  'BackgroundAlpha',
  'FillPaint',
  'StrokePaint',
] as const

export interface FilterInputOption {
  /** Stable list key, as expected by ValueSuggestInput. */
  key: string
  value: string
  kind: 'standard' | 'result'
  /** Primitive that produces a result option. */
  tag?: string
}

function filterPathFor(path: PathSegment[]): PathSegment[] | null {
  for (let index = path.length - 1; index >= 0; index -= 1) {
    if (path[index].tag.toLowerCase() === 'filter') return path.slice(0, index + 1)
  }
  return null
}

/**
 * Inputs available to a primitive: the standard SVG sources followed by named
 * outputs from completed, earlier primitives in the same filter pipeline.
 */
export function collectFilterInputOptions(
  content: string,
  currentPath: PathSegment[],
): FilterInputOption[] {
  const standard: FilterInputOption[] = STANDARD_FILTER_INPUTS.map((value) => ({
    key: `standard:${value}`,
    value,
    kind: 'standard',
  }))
  const filterPath = filterPathFor(currentPath)
  if (!filterPath) return standard

  const root = parseIndexedDocument(content)
  const filter = findNodeByPath(root, filterPath)
  if (!filter) return standard

  // A nested feMergeNode belongs to its top-level feMerge primitive. Stopping
  // before that parent avoids offering the merge's not-yet-produced result.
  const currentPrimitivePath = currentPath.slice(0, filterPath.length + 1)
  const seen = new Set<string>(STANDARD_FILTER_INPUTS)
  const results: FilterInputOption[] = []

  for (const primitive of filter.children) {
    if (isTextNodeTag(primitive.tag) || primitive.commentedOut) continue
    if (pathsEqual(primitive.path, currentPrimitivePath)) break
    addResultOption(primitive, seen, results)
  }

  return [...standard, ...results]
}

function addResultOption(
  primitive: IndexedDocumentNode,
  seen: Set<string>,
  results: FilterInputOption[],
) {
  const value = primitive.attributes.result?.trim()
  if (!value || seen.has(value)) return
  seen.add(value)
  results.push({
    key: `result:${value}`,
    value,
    kind: 'result',
    tag: getElementSchema(primitive.tag)?.tag ?? primitive.tag,
  })
}

/**
 * Whole-value completion for the filter input combobox. An exact current value
 * keeps every option visible so clicking an existing value still opens a useful
 * picker; partial values narrow to prefix matches, then mid-word matches.
 */
export function suggestFilterInputs(
  query: string,
  options: readonly FilterInputOption[],
): FilterInputOption[] {
  const needle = query.trim().toLowerCase()
  if (!needle || options.some((option) => option.value.toLowerCase() === needle)) {
    return [...options]
  }

  const prefix: FilterInputOption[] = []
  const infix: FilterInputOption[] = []
  for (const option of options) {
    const value = option.value.toLowerCase()
    if (value.startsWith(needle)) prefix.push(option)
    else if (value.includes(needle)) infix.push(option)
  }
  return [...prefix, ...infix]
}
