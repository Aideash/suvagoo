export interface SvgMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface SvgRecord extends SvgMeta {
  content: string;
}

export interface CreateSvgInput {
  name: string;
  content: string;
}

export interface UpdateSvgInput {
  name?: string;
  content?: string;
}
