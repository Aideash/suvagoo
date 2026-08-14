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

export interface SvgMeta {
  id: string
  name: string
  /** Null/omitted means the SVG is not in a collection. */
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
