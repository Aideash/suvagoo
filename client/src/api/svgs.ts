export interface SvgMeta {
  id: string
  name: string
  collectionId?: string | null
  createdAt: string
  updatedAt: string
}

export interface SvgRecord extends SvgMeta {
  content: string
}

export interface CreateSvgInput {
  name: string
  content: string
  collectionId?: string | null
}

export interface UpdateSvgInput {
  name?: string
  content?: string
  collectionId?: string | null
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? res.statusText)
  }
  if (res.status === 204) {
    return undefined as T
  }
  return res.json() as Promise<T>
}

export async function listSvgs(): Promise<SvgMeta[]> {
  const res = await fetch('/api/svgs')
  return handleResponse<SvgMeta[]>(res)
}

export async function getSvg(id: string): Promise<SvgRecord> {
  const res = await fetch(`/api/svgs/${id}`)
  return handleResponse<SvgRecord>(res)
}

export async function createSvg(input: CreateSvgInput): Promise<SvgRecord> {
  const res = await fetch('/api/svgs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return handleResponse<SvgRecord>(res)
}

export async function updateSvg(id: string, input: UpdateSvgInput): Promise<SvgRecord> {
  const res = await fetch(`/api/svgs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return handleResponse<SvgRecord>(res)
}

export async function deleteSvg(id: string): Promise<void> {
  const res = await fetch(`/api/svgs/${id}`, { method: 'DELETE' })
  await handleResponse<void>(res)
}

export const STARTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="currentColor"/>
</svg>`
