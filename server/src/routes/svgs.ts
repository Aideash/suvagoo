import { Router } from 'express'
import { createSvg, deleteSvg, getSvg, listSvgs, updateSvg } from '../storage/fs.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const svgs = await listSvgs()
    res.json(svgs)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to list SVGs' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const svg = await getSvg(req.params.id)
    if (!svg) {
      res.status(404).json({ error: 'SVG not found' })
      return
    }
    res.json(svg)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to get SVG' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { name, content, collectionId } = req.body as {
      name?: string
      content?: string
      collectionId?: string | null
    }
    if (!content) {
      res.status(400).json({ error: 'content is required' })
      return
    }
    const svg = await createSvg({
      name: name ?? 'Untitled SVG',
      content,
      collectionId,
    })
    res.status(201).json(svg)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create SVG'
    res.status(400).json({ error: message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const { name, content, collectionId } = req.body as {
      name?: string
      content?: string
      collectionId?: string | null
    }
    const svg = await updateSvg(req.params.id, { name, content, collectionId })
    if (!svg) {
      res.status(404).json({ error: 'SVG not found' })
      return
    }
    res.json(svg)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update SVG'
    res.status(400).json({ error: message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteSvg(req.params.id)
    if (!deleted) {
      res.status(404).json({ error: 'SVG not found' })
      return
    }
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete SVG' })
  }
})

export default router
