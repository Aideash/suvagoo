import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatPathD, parsePathD } from '../src/lib/pathAttribute'
import {
  buildCompletion,
  completionTailD,
  DEFAULT_COMPLETION_OPTIONS,
  type CompletionOptions,
} from '../src/lib/pathCompletion'

const cases: { label: string; d: string; options: Partial<CompletionOptions> }[] = [
  {
    label: 'rightward, arc, +3',
    d: 'M 3 12 L 21 12',
    options: { mode: 'retrace', width: 3, connector: 'arc' },
  },
  {
    label: 'rightward, arc, flipped',
    d: 'M 3 12 L 21 12',
    options: { mode: 'retrace', width: 3, connector: 'arc', flip: true },
  },
  {
    label: 'rightward, line, +3',
    d: 'M 3 12 L 21 12',
    options: { mode: 'retrace', width: 3, connector: 'line' },
  },
  {
    label: 'downward, arc, +3',
    d: 'M 12 3 L 12 21',
    options: { mode: 'retrace', width: 3, connector: 'arc' },
  },
  {
    label: 'curve, arc, +3',
    d: 'M 3 16 C 8 6 16 6 21 16',
    options: { mode: 'retrace', width: 3, connector: 'arc' },
  },
  {
    label: 'half heart, line, +3',
    d: 'M 12 21 C 4 14 2 9 5 6 C 7 4 10 5 12 8',
    options: { mode: 'reflect', width: 3, connector: 'line' },
  },
  {
    label: 'half heart, arc, flipped',
    d: 'M 12 21 C 4 14 2 9 5 6 C 7 4 10 5 12 8',
    options: { mode: 'reflect', width: 3, connector: 'arc', flip: true },
  },
  {
    label: 'half rect, copy, line +3',
    d: 'M 3 3 H 21 V 14',
    options: { mode: 'copy', width: 3, connector: 'line' },
  },
  {
    label: 'arc, reflect, arc +3',
    d: 'M 3 14 A 8 5 30 0 1 21 14',
    options: { mode: 'reflect', width: 3, connector: 'arc' },
  },
]

const cell = 24
const gap = 6
const cols = 3
const parts: string[] = []

cases.forEach((item, i) => {
  const commands = parsePathD(item.d)
  const result = buildCompletion(commands, { ...DEFAULT_COMPLETION_OPTIONS, ...item.options })
  const out = result ? formatPathD(result.commands) : ''
  console.log(`${item.label}\n  ${out}\n`)

  const x = (i % cols) * (cell + gap)
  const y = Math.floor(i / cols) * (cell + gap + 5)
  parts.push(`<g transform="translate(${x} ${y})">`)
  parts.push(`<rect width="${cell}" height="${cell}" fill="#fff" stroke="#ddd" stroke-width="0.2"/>`)
  if (out) parts.push(`<path d="${out}" fill="#6ea8fe" fill-opacity="0.35"/>`)
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

const rows = Math.ceil(cases.length / cols)
writeFileSync(
  join(import.meta.dirname, 'scratch-width-check.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${cols * (cell + gap) + 2} ${rows * (cell + gap + 5) + 2}" width="900"><rect x="-2" y="-2" width="100%" height="100%" fill="#fff"/>${parts.join('')}</svg>`,
)
