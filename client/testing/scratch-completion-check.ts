import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatPathD, parsePathD } from '../src/lib/pathAttribute'
import {
  buildCompletion,
  canCompletePath,
  completionTailD,
  DEFAULT_COMPLETION_OPTIONS,
  type CompletionOptions,
} from '../src/lib/pathCompletion'

interface Case {
  label: string
  d: string
  options: Partial<CompletionOptions>
}

const cases: Case[] = [
  { label: 'half rectangle / copy', d: 'M 0 0 H 20 V 10', options: { mode: 'copy' } },
  {
    label: 'half heart / reflect',
    d: 'M 12 21 C 4 14 2 9 5 6 C 7 4 10 5 12 8',
    options: { mode: 'reflect' },
  },
  {
    label: 'stroke / retrace arc caps',
    d: 'M 2 12 C 6 4 14 4 18 12',
    options: { mode: 'retrace', width: 3, connector: 'arc' },
  },
  {
    label: 'stroke / retrace line caps',
    d: 'M 2 12 C 6 4 14 4 18 12',
    options: { mode: 'retrace', width: 3, connector: 'line' },
  },
  {
    label: 'stroke / retrace flipped',
    d: 'M 2 12 C 6 4 14 4 18 12',
    options: { mode: 'retrace', width: 3, connector: 'arc', flip: true },
  },
  { label: 'arc / retrace', d: 'M 2 12 A 8 5 30 0 1 18 12', options: { mode: 'retrace' } },
  { label: 'arc / reflect', d: 'M 2 12 A 8 5 30 0 1 18 12', options: { mode: 'reflect' } },
  { label: 'arc / copy', d: 'M 2 12 A 8 5 30 0 1 18 12', options: { mode: 'copy' } },
  {
    label: 'arc / reflect with width',
    d: 'M 2 12 A 8 5 30 0 1 18 12',
    options: { mode: 'reflect', width: 3, connector: 'arc' },
  },
  {
    label: 'smooth cubic / reflect',
    d: 'M 2 12 C 4 6 8 6 10 12 S 16 18 18 12',
    options: { mode: 'reflect' },
  },
  {
    label: 'quadratic + T / copy',
    d: 'M 2 12 Q 6 4 10 12 T 18 12',
    options: { mode: 'copy' },
  },
  {
    label: 'zigzag / copy with width',
    d: 'M 2 16 L 6 8 L 10 16 L 14 8',
    options: { mode: 'copy', width: 4, connector: 'line' },
  },
  {
    label: 'partial 2 steps / retrace',
    d: 'M 2 12 L 6 12 L 10 12 L 14 12 L 18 12',
    options: { mode: 'retrace', steps: 2, width: 3, connector: 'arc' },
  },
  {
    label: 'closed loop chord / reflect',
    d: 'M 10 4 C 18 4 18 18 10 18 C 6 16 6 6 10 4',
    options: { mode: 'reflect', width: 2, connector: 'line' },
  },
]

const edgeCases: { label: string; d: string; options: Partial<CompletionOptions> }[] = [
  { label: 'closed path rejected', d: 'M 0 0 H 5 V 5 Z', options: {} },
  { label: 'two subpaths rejected', d: 'M 0 0 L 5 5 M 8 8 L 9 9', options: {} },
  { label: 'lone move rejected', d: 'M 0 0', options: {} },
  { label: 'steps above max clamps', d: 'M 0 0 L 5 0', options: { steps: 99 } },
  { label: 'steps zero clamps', d: 'M 0 0 L 5 0', options: { steps: 0 } },
  { label: 'steps fractional clamps', d: 'M 0 0 L 5 0 L 9 3', options: { steps: 1.6 } },
  { label: 'degenerate chord', d: 'M 5 5 C 9 1 1 1 5 5', options: { mode: 'reflect' } },
  { label: 'relative input preserved', d: 'm 1 1 h 8 v 4', options: { mode: 'copy' } },
]

console.log('=== edge cases ===')
for (const item of edgeCases) {
  const commands = parsePathD(item.d)
  const result = buildCompletion(commands, { ...DEFAULT_COMPLETION_OPTIONS, ...item.options })
  console.log(`\n${item.label}`)
  console.log(`  eligible: ${canCompletePath(commands)}`)
  console.log(`  out     : ${result ? formatPathD(result.commands) : '(null)'}`)
}

console.log('\n=== rendered cases ===')
const cols = 4
const cell = 24
const gap = 6
const rows = Math.ceil(cases.length / cols)
const parts: string[] = []

cases.forEach((item, i) => {
  const commands = parsePathD(item.d)
  const result = buildCompletion(commands, { ...DEFAULT_COMPLETION_OPTIONS, ...item.options })
  const out = result ? formatPathD(result.commands) : ''
  console.log(`\n${item.label}\n  in : ${item.d}\n  out: ${out}`)

  const x = (i % cols) * (cell + gap)
  const y = Math.floor(i / cols) * (cell + gap + 5)
  parts.push(`<g transform="translate(${x} ${y})">`)
  parts.push(
    `<rect width="${cell}" height="${cell}" fill="#fff" stroke="#ddd" stroke-width="0.2"/>`,
  )
  if (out) parts.push(`<path d="${out}" fill="#6ea8fe" fill-opacity="0.35" stroke="none"/>`)
  parts.push(`<path d="${item.d}" fill="none" stroke="#333" stroke-width="0.5"/>`)
  if (result) {
    parts.push(
      `<path d="${completionTailD(result)}" fill="none" stroke="#e11d48" stroke-width="0.5"/>`,
    )
  }
  parts.push(
    `<text x="0" y="${cell + 3.5}" font-size="2" fill="#333" font-family="sans-serif">${item.label}</text>`,
  )
  parts.push('</g>')
})

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${cols * (cell + gap) + 2} ${rows * (cell + gap + 5) + 2}" width="${cols * (cell + gap) * 8}"><rect x="-2" y="-2" width="100%" height="100%" fill="#fff"/>${parts.join('')}</svg>`
const out = join(import.meta.dirname, 'scratch-completion-check.svg')
writeFileSync(out, svg)
console.log(`\nwrote ${out}`)
