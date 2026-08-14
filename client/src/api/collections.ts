export interface Collection {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface CreateCollectionInput {
  name: string
}

export interface UpdateCollectionInput {
  name: string
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

export async function listCollections(): Promise<Collection[]> {
  const res = await fetch('/api/collections')
  return handleResponse<Collection[]>(res)
}

export async function createCollection(input: CreateCollectionInput): Promise<Collection> {
  const res = await fetch('/api/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return handleResponse<Collection>(res)
}

export async function updateCollection(
  id: string,
  input: UpdateCollectionInput,
): Promise<Collection> {
  const res = await fetch(`/api/collections/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return handleResponse<Collection>(res)
}

export async function deleteCollection(id: string): Promise<void> {
  const res = await fetch(`/api/collections/${id}`, { method: 'DELETE' })
  await handleResponse<void>(res)
}
