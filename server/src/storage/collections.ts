import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Collection, CreateCollectionInput, UpdateCollectionInput } from '../types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../../data')
const COLLECTIONS_PATH = path.join(DATA_DIR, 'collections.json')

async function ensureCollectionsFile(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  try {
    await access(COLLECTIONS_PATH)
  } catch {
    await writeFile(COLLECTIONS_PATH, '[]', 'utf-8')
  }
}

async function readCollections(): Promise<Collection[]> {
  await ensureCollectionsFile()
  const raw = await readFile(COLLECTIONS_PATH, 'utf-8')
  return JSON.parse(raw) as Collection[]
}

async function writeCollections(collections: Collection[]): Promise<void> {
  await writeFile(COLLECTIONS_PATH, JSON.stringify(collections, null, 2), 'utf-8')
}

export async function listCollections(): Promise<Collection[]> {
  const collections = await readCollections()
  return collections.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getCollection(id: string): Promise<Collection | null> {
  const collections = await readCollections()
  return collections.find((entry) => entry.id === id) ?? null
}

export async function collectionExists(id: string): Promise<boolean> {
  return (await getCollection(id)) != null
}

export async function createCollection(input: CreateCollectionInput): Promise<Collection> {
  const name = input.name.trim()
  if (!name) {
    throw new Error('Collection name is required')
  }

  const now = new Date().toISOString()
  const collection: Collection = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
  }

  const collections = await readCollections()
  collections.push(collection)
  await writeCollections(collections)
  return collection
}

export async function updateCollection(
  id: string,
  input: UpdateCollectionInput,
): Promise<Collection | null> {
  const collections = await readCollections()
  const idx = collections.findIndex((entry) => entry.id === id)
  if (idx === -1) return null

  const name = input.name.trim()
  if (!name) {
    throw new Error('Collection name is required')
  }

  const collection = collections[idx]
  collection.name = name
  collection.updatedAt = new Date().toISOString()
  collections[idx] = collection
  await writeCollections(collections)
  return collection
}

export async function deleteCollection(id: string): Promise<boolean> {
  const collections = await readCollections()
  const idx = collections.findIndex((entry) => entry.id === id)
  if (idx === -1) return false

  collections.splice(idx, 1)
  await writeCollections(collections)
  return true
}
