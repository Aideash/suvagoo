import { mkdir, readFile, writeFile, unlink, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CreateSvgInput, SvgMeta, SvgRecord, UpdateSvgInput } from '../types.js'
import { collectionExists } from './collections.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../../data')
const SVGS_DIR = path.join(DATA_DIR, 'svgs')
const INDEX_PATH = path.join(DATA_DIR, 'index.json')

async function ensureDataDir(): Promise<void> {
  await mkdir(SVGS_DIR, { recursive: true })
  try {
    await access(INDEX_PATH)
  } catch {
    await writeFile(INDEX_PATH, '[]', 'utf-8')
  }
}

async function readIndex(): Promise<SvgMeta[]> {
  await ensureDataDir()
  const raw = await readFile(INDEX_PATH, 'utf-8')
  return JSON.parse(raw) as SvgMeta[]
}

async function writeIndex(index: SvgMeta[]): Promise<void> {
  await writeFile(INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8')
}

function svgPath(id: string): string {
  return path.join(SVGS_DIR, `${id}.svg`)
}

export function isValidSvgContent(content: string): boolean {
  return /<svg[\s>]/i.test(content)
}

export async function listSvgs(): Promise<SvgMeta[]> {
  const index = await readIndex()
  return index.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export async function getSvg(id: string): Promise<SvgRecord | null> {
  const index = await readIndex()
  const meta = index.find((entry) => entry.id === id)
  if (!meta) return null

  try {
    const content = await readFile(svgPath(id), 'utf-8')
    return { ...meta, content }
  } catch {
    return null
  }
}

async function resolveCollectionId(
  collectionId: string | null | undefined,
): Promise<string | null | undefined> {
  if (collectionId === undefined) return undefined
  if (collectionId === null || collectionId === '') return null
  if (!(await collectionExists(collectionId))) {
    throw new Error('Collection not found')
  }
  return collectionId
}

export async function createSvg(input: CreateSvgInput): Promise<SvgRecord> {
  if (!isValidSvgContent(input.content)) {
    throw new Error('Content must contain a root <svg> element')
  }

  const collectionId = await resolveCollectionId(input.collectionId)
  const now = new Date().toISOString()
  const meta: SvgMeta = {
    id: crypto.randomUUID(),
    name: input.name.trim() || 'Untitled SVG',
    collectionId: collectionId ?? null,
    createdAt: now,
    updatedAt: now,
  }

  await writeFile(svgPath(meta.id), input.content, 'utf-8')

  const index = await readIndex()
  index.push(meta)
  await writeIndex(index)

  return { ...meta, content: input.content }
}

export async function updateSvg(id: string, input: UpdateSvgInput): Promise<SvgRecord | null> {
  const index = await readIndex()
  const idx = index.findIndex((entry) => entry.id === id)
  if (idx === -1) return null

  const meta = index[idx]

  if (input.content !== undefined) {
    if (!isValidSvgContent(input.content)) {
      throw new Error('Content must contain a root <svg> element')
    }
    await writeFile(svgPath(id), input.content, 'utf-8')
  }

  if (input.name !== undefined) {
    meta.name = input.name.trim() || 'Untitled SVG'
  }

  if (input.collectionId !== undefined) {
    meta.collectionId = (await resolveCollectionId(input.collectionId)) ?? null
  }

  meta.updatedAt = new Date().toISOString()
  index[idx] = meta
  await writeIndex(index)

  const content = input.content ?? (await readFile(svgPath(id), 'utf-8'))
  return { ...meta, content }
}

/** Clears `collectionId` on every SVG that referenced a deleted collection. */
export async function clearCollectionFromSvgs(collectionId: string): Promise<void> {
  const index = await readIndex()
  let changed = false
  for (const entry of index) {
    if (entry.collectionId === collectionId) {
      entry.collectionId = null
      changed = true
    }
  }
  if (changed) {
    await writeIndex(index)
  }
}

export async function deleteSvg(id: string): Promise<boolean> {
  const index = await readIndex()
  const idx = index.findIndex((entry) => entry.id === id)
  if (idx === -1) return false

  index.splice(idx, 1)
  await writeIndex(index)

  try {
    await unlink(svgPath(id))
  } catch {
    // File may already be missing
  }

  return true
}
