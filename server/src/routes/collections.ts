import { Router } from 'express'
import {
  createCollection,
  deleteCollection,
  listCollections,
  updateCollection,
} from '../storage/collections.js'
import { clearCollectionFromSvgs } from '../storage/fs.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const collections = await listCollections()
    res.json(collections)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to list collections' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { name } = req.body as { name?: string }
    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required' })
      return
    }
    const collection = await createCollection({ name })
    res.status(201).json(collection)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create collection'
    res.status(400).json({ error: message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const { name } = req.body as { name?: string }
    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required' })
      return
    }
    const collection = await updateCollection(req.params.id, { name })
    if (!collection) {
      res.status(404).json({ error: 'Collection not found' })
      return
    }
    res.json(collection)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update collection'
    res.status(400).json({ error: message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteCollection(req.params.id)
    if (!deleted) {
      res.status(404).json({ error: 'Collection not found' })
      return
    }
    await clearCollectionFromSvgs(req.params.id)
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete collection' })
  }
})

export default router
