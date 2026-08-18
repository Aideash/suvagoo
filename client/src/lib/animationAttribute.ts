/**
 * Support for the SMIL animation elements, whose attributes only make sense in
 * relation to the element they are attached to: `attributeName` picks a target
 * on the parent, and `from`/`to`/`by` are then values of that target attribute.
 */

import { getAttributeSchema, type AttributeSchema } from './attributeSchema'
import { findElementByPath, type AttributeContext, type PathSegment } from './svgDocument'
import { getElementSchema, isAnimationTag, normalizeTagName } from './svgSchema'

export { isAnimationTag }

/** Attributes whose value is drawn from the animated attribute's own type. */
const ANIMATED_VALUE_ATTRS = new Set(['from', 'to', 'by'])

/**
 * Structural attributes with nothing to interpolate. `xmlns` and `id` change
 * identity rather than appearance, `class`/`style` are indirections that a SMIL
 * animation cannot address, and `result` names a filter primitive's output for
 * later primitives to read, which the spec declares un-animatable.
 */
const NON_ANIMATABLE_ATTRS = new Set(['id', 'class', 'style', 'xmlns', 'href', 'result'])

/** The only attributes `animateTransform` can target. */
const TRANSFORM_ATTRS = ['transform', 'gradientTransform', 'patternTransform']

export interface AnimationTarget {
  /** Tag of the element being animated. */
  tagName: string
  path: PathSegment[]
  /** Attribute names the parent can have animated. */
  attributes: string[]
}

/**
 * The element an animation element is attached to, along with the attributes it
 * makes sense to animate on it.
 */
export function resolveAnimationTarget(
  content: string,
  path: PathSegment[],
): AnimationTarget | null {
  const own = path.at(-1)
  if (!own || !isAnimationTag(own.tag)) return null

  const parentPath = path.slice(0, -1)
  if (!parentPath.length) return null

  const parent = findElementByPath(content, parentPath)
  if (!parent) return null

  const schema = getElementSchema(parent.tagName)
  const declared = schema?.attributes ?? []
  const candidates =
    normalizeTagName(own.tag) === 'animatetransform'
      ? TRANSFORM_ATTRS.filter((name) => declared.includes(name))
      : declared.filter((name) => !NON_ANIMATABLE_ATTRS.has(name))

  return {
    tagName: parent.tagName,
    path: parentPath,
    attributes: [...new Set(candidates)].sort((a, b) => a.localeCompare(b)),
  }
}

export interface AnimatedValueTarget {
  schema: AttributeSchema
  /** Name of the attribute being animated, as authored. */
  attrName: string
  targetTag: string
  targetPath: PathSegment[]
}

/**
 * Type of the value in a `from`/`to`/`by` attribute, taken from the attribute
 * the animation targets, so animating `fill` offers a colour picker and
 * animating `r` offers the numeric control for the parent's coordinate space.
 *
 * Returns null when there is nothing to infer from: `animateTransform` writes
 * transform-function parameters rather than a single typed value, and
 * `animateMotion` has no target attribute at all.
 */
export function resolveAnimatedValueTarget(
  content: string,
  attribute: AttributeContext,
): AnimatedValueTarget | null {
  if (!isAnimationTag(attribute.tagName)) return null
  if (!ANIMATED_VALUE_ATTRS.has(attribute.attrName.toLowerCase())) return null

  const tag = normalizeTagName(attribute.tagName)
  if (tag === 'animatetransform' || tag === 'animatemotion') return null

  const self = findElementByPath(content, attribute.path)
  const attrName = self?.existingAttributes.attributeName?.trim()
  if (!attrName) return null

  const target = resolveAnimationTarget(content, attribute.path)
  if (!target) return null

  return {
    schema: getAttributeSchema(attrName, target.tagName),
    attrName,
    targetTag: target.tagName,
    targetPath: target.path,
  }
}

export interface ParsedClockValue {
  number: number
  /** 's' or 'ms'; a bare number is seconds in SMIL, so it normalises to 's'. */
  unit: string
}

/**
 * Clock values that are a single number with an optional time unit. Anything
 * richer — `indefinite`, event references like `click+1s`, `hh:mm:ss` — returns
 * null so the caller can fall back to editing the raw text.
 */
export function parseClockValue(value: string): ParsedClockValue | null {
  const match = /^([+-]?\d*\.?\d+)(s|ms)?$/i.exec(value.trim())
  if (!match) return null

  const number = Number.parseFloat(match[1])
  if (!Number.isFinite(number)) return null

  return { number, unit: match[2]?.toLowerCase() ?? 's' }
}

export function formatClockValue(number: number, unit: string): string {
  const rounded = Math.round(number * 1000) / 1000
  return `${rounded}${unit === 'ms' ? 'ms' : 's'}`
}

export const INDEFINITE = 'indefinite'

export function isIndefinite(value: string): boolean {
  return value.trim().toLowerCase() === INDEFINITE
}

/**
 * Values a timing attribute accepts that are not clock values, offered as
 * completions. `begin` and `end` additionally take event names, which is the
 * part of the grammar least likely to be guessed.
 */
const TIMING_KEYWORDS: Record<string, readonly string[]> = {
  dur: [INDEFINITE],
  repeatdur: [INDEFINITE],
  begin: [INDEFINITE, 'click', 'mousedown', 'mouseover', 'mouseout', 'focusin', 'focusout'],
  end: [INDEFINITE, 'click', 'mousedown', 'mouseover', 'mouseout'],
}

export function timingKeywords(attrName: string): readonly string[] {
  return TIMING_KEYWORDS[attrName.toLowerCase()] ?? [INDEFINITE]
}

/**
 * Repeat counts are a number of runs or the `indefinite` keyword; a null number
 * means the value is neither and should be edited as text.
 */
export function parseRepeatCount(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d*\.?\d+$/.test(trimmed)) return null

  const number = Number.parseFloat(trimmed)
  return Number.isFinite(number) ? number : null
}

const ANIMATION_TAG_PATTERN = /<(animate|animateTransform|animateMotion|set)\b/i

/** Whether markup contains anything that would drive an SMIL timeline. */
export function hasAnimation(markup: string): boolean {
  return ANIMATION_TAG_PATTERN.test(markup)
}
