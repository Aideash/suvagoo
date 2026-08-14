<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  createCollection,
  deleteCollection,
  listCollections,
  updateCollection,
  type Collection,
} from '../api/collections'
import { deleteSvg, listSvgs, type SvgMeta } from '../api/svgs'
import SvgCard from '../components/SvgCard.vue'
import ThemePicker from '../components/ThemePicker.vue'

/** Sentinel for the folder filter: show every SVG. */
const FILTER_ALL = ''
/** Sentinel for SVGs with no collection. */
const FILTER_UNFILED = '__unfiled__'

const svgs = ref<SvgMeta[]>([])
const collections = ref<Collection[]>([])
const loading = ref(true)
const error = ref('')
const searchQuery = ref('')
const collectionFilter = ref(FILTER_ALL)

const filteredSvgs = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const folder = collectionFilter.value

  return svgs.value.filter((svg) => {
    if (folder === FILTER_UNFILED) {
      if (svg.collectionId) return false
    } else if (folder !== FILTER_ALL) {
      if (svg.collectionId !== folder) return false
    }

    if (!query) return true
    return svg.name.toLowerCase().includes(query)
  })
})

const newSvgTo = computed(() => {
  if (
    collectionFilter.value &&
    collectionFilter.value !== FILTER_UNFILED &&
    collections.value.some((collection) => collection.id === collectionFilter.value)
  ) {
    return { path: '/edit', query: { collection: collectionFilter.value } }
  }
  return '/edit'
})

const selectedCollection = computed(() =>
  collections.value.find((collection) => collection.id === collectionFilter.value),
)

const collectionNameById = computed(() => {
  const map = new Map<string, string>()
  for (const collection of collections.value) {
    map.set(collection.id, collection.name)
  }
  return map
})

function collectionNameFor(svg: SvgMeta): string | null {
  if (!svg.collectionId) return null
  return collectionNameById.value.get(svg.collectionId) ?? null
}

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    const [svgList, collectionList] = await Promise.all([listSvgs(), listCollections()])
    svgs.value = svgList
    collections.value = collectionList
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load SVGs'
  } finally {
    loading.value = false
  }
}

async function handleDelete(id: string) {
  const svg = svgs.value.find((s) => s.id === id)
  if (!svg) return

  const confirmed = window.confirm(`Delete "${svg.name}"?`)
  if (!confirmed) return

  try {
    await deleteSvg(id)
    svgs.value = svgs.value.filter((s) => s.id !== id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete SVG'
  }
}

async function handleCreateFolder() {
  const name = window.prompt('New folder name')
  if (name == null) return
  const trimmed = name.trim()
  if (!trimmed) return

  try {
    const created = await createCollection({ name: trimmed })
    collections.value = [...collections.value, created].sort((a, b) => a.name.localeCompare(b.name))
    collectionFilter.value = created.id
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create folder'
  }
}

async function handleRenameFolder() {
  const current = selectedCollection.value
  if (!current) return

  const name = window.prompt('Rename folder', current.name)
  if (name == null) return
  const trimmed = name.trim()
  if (!trimmed || trimmed === current.name) return

  try {
    const updated = await updateCollection(current.id, { name: trimmed })
    collections.value = collections.value
      .map((collection) => (collection.id === updated.id ? updated : collection))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to rename folder'
  }
}

async function handleDeleteFolder() {
  const current = selectedCollection.value
  if (!current) return

  const confirmed = window.confirm(
    `Delete folder "${current.name}"? SVGs in it will become unfiled.`,
  )
  if (!confirmed) return

  try {
    await deleteCollection(current.id)
    collections.value = collections.value.filter((collection) => collection.id !== current.id)
    for (const svg of svgs.value) {
      if (svg.collectionId === current.id) {
        svg.collectionId = null
      }
    }
    collectionFilter.value = FILTER_ALL
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete folder'
  }
}

function emptyMessage(): string {
  const query = searchQuery.value.trim()
  const folder = selectedCollection.value?.name
  if (collectionFilter.value === FILTER_UNFILED && query) {
    return `No unfiled SVGs match “${query}”.`
  }
  if (collectionFilter.value === FILTER_UNFILED) {
    return 'No unfiled SVGs.'
  }
  if (folder && query) {
    return `No SVGs in “${folder}” match “${query}”.`
  }
  if (folder) {
    return `No SVGs in “${folder}”.`
  }
  if (query) {
    return `No SVGs match “${query}”.`
  }
  return 'No SVGs match.'
}

onMounted(loadData)
</script>

<template>
  <div class="list-view">
    <header class="page-header">
      <h1>Suvagoo</h1>
      <div class="list-view__filters">
        <select
          v-model="collectionFilter"
          class="input list-view__folder"
          aria-label="Filter by folder"
        >
          <option :value="FILTER_ALL">All</option>
          <option :value="FILTER_UNFILED">Unfiled</option>
          <option v-for="collection in collections" :key="collection.id" :value="collection.id">
            {{ collection.name }}
          </option>
        </select>
        <button
          type="button"
          class="btn btn--secondary"
          title="New folder"
          aria-label="New folder"
          @click="handleCreateFolder"
        >
          <span class="material-icons sm">create_new_folder</span>
        </button>
        <button
          type="button"
          class="btn btn--secondary"
          title="Rename folder"
          aria-label="Rename folder"
          :disabled="!selectedCollection"
          @click="handleRenameFolder"
        >
          <span class="material-icons sm">drive_file_rename_outline</span>
        </button>
        <button
          type="button"
          class="btn btn--secondary"
          title="Delete folder"
          aria-label="Delete folder"
          :disabled="!selectedCollection"
          @click="handleDeleteFolder"
        >
          <span class="material-icons sm">folder_delete</span>
        </button>
        <input
          v-model="searchQuery"
          class="input list-view__search"
          type="search"
          placeholder="Search SVGs…"
          aria-label="Search SVGs"
        />
      </div>
      <div class="page-header__actions">
        <RouterLink :to="newSvgTo" class="btn btn--primary">New SVG</RouterLink>
        <ThemePicker />
      </div>
    </header>

    <main class="page-content">
      <p v-if="loading" class="empty-state">Loading…</p>
      <p v-else-if="error" class="error-banner">{{ error }}</p>

      <div v-else-if="svgs.length === 0" class="empty-state">
        <p>No SVGs yet. Create your first one!</p>
        <RouterLink :to="newSvgTo" class="btn btn--primary">New SVG</RouterLink>
      </div>

      <div v-else-if="filteredSvgs.length === 0" class="empty-state">
        <p>{{ emptyMessage() }}</p>
      </div>

      <div v-else class="svg-grid">
        <SvgCard
          v-for="svg in filteredSvgs"
          :key="svg.id"
          :svg="svg"
          :collection-name="collectionNameFor(svg)"
          @delete="handleDelete"
        />
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.list-view__filters {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  flex: 1;
  min-width: 0;
}

.list-view__folder {
  flex: 0 1 12rem;
  min-width: 8rem;
  max-width: 14rem;
}

.list-view__search {
  flex: 1;
  min-width: 0;
  max-width: 28rem;
}

.svg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: $spacing-lg;
}
</style>
