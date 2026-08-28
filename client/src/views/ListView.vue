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

const unfiledCount = computed(() => svgs.value.filter((svg) => !svg.collectionId).length)

const countByCollectionId = computed(() => {
  const map = new Map<string, number>()
  for (const svg of svgs.value) {
    if (!svg.collectionId) continue
    map.set(svg.collectionId, (map.get(svg.collectionId) ?? 0) + 1)
  }
  return map
})

const listHeading = computed(() => {
  if (collectionFilter.value === FILTER_UNFILED) return 'Unfiled'
  return selectedCollection.value?.name ?? 'All SVGs'
})

const resultSummary = computed(() => {
  const count = filteredSvgs.value.length
  const noun = count === 1 ? 'SVG' : 'SVGs'
  const query = searchQuery.value.trim()
  if (query) return `${count} ${noun} matching “${query}”`
  return `${count} ${noun}`
})

function collectionNameFor(svg: SvgMeta): string | null {
  if (!svg.collectionId) return null
  return collectionNameById.value.get(svg.collectionId) ?? null
}

function collectionCount(id: string): number {
  return countByCollectionId.value.get(id) ?? 0
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
    <header class="page-header list-view__header">
      <h1 class="page-header__brand">
        <img class="page-header__logo" src="/favicon.svg" alt="" width="32" height="32" />
        Suvagoo
      </h1>
      <div class="search-field list-view__search">
        <span class="material-icons sm search-field__icon" aria-hidden="true">search</span>
        <input
          id="svg-search"
          name="svg-search"
          v-model="searchQuery"
          class="input"
          type="search"
          placeholder="Search SVGs…"
          aria-label="Search SVGs"
        />
      </div>
      <div class="page-header__actions">
        <RouterLink :to="newSvgTo" class="btn btn--primary">
          New SVG
          <!-- <span class="material-icons sm" aria-hidden="true">add</span> -->
        </RouterLink>
        <ThemePicker />
      </div>
    </header>

    <div class="list-view__body">
      <aside class="list-view__sidebar">
        <nav class="list-view__nav" aria-labelledby="folder-nav-heading">
          <h2 id="folder-nav-heading" class="visually-hidden">Folders</h2>
          <ul class="list-view__folders">
            <li>
              <button
                type="button"
                class="list-view__folder"
                :class="{ 'list-view__folder--active': collectionFilter === FILTER_ALL }"
                :aria-current="collectionFilter === FILTER_ALL ? 'true' : undefined"
                @click="collectionFilter = FILTER_ALL"
              >
                <span class="material-icons sm" aria-hidden="true">grid_view</span>
                <span class="list-view__folder-name">All</span>
                <span class="list-view__folder-count">{{ svgs.length }}</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                class="list-view__folder"
                :class="{ 'list-view__folder--active': collectionFilter === FILTER_UNFILED }"
                :aria-current="collectionFilter === FILTER_UNFILED ? 'true' : undefined"
                @click="collectionFilter = FILTER_UNFILED"
              >
                <span class="material-icons sm" aria-hidden="true">folder_off</span>
                <span class="list-view__folder-name">Unfiled</span>
                <span class="list-view__folder-count">{{ unfiledCount }}</span>
              </button>
            </li>
            <li v-for="collection in collections" :key="collection.id">
              <button
                type="button"
                class="list-view__folder"
                :class="{ 'list-view__folder--active': collectionFilter === collection.id }"
                :aria-current="collectionFilter === collection.id ? 'true' : undefined"
                @click="collectionFilter = collection.id"
              >
                <span class="material-icons sm" aria-hidden="true">{{
                  collectionFilter === collection.id ? 'folder_open' : 'folder'
                }}</span>
                <span class="list-view__folder-name">{{ collection.name }}</span>
                <span class="list-view__folder-count">{{ collectionCount(collection.id) }}</span>
              </button>
            </li>
          </ul>
        </nav>
        <div class="list-view__folder-actions">
          <button
            type="button"
            class="btn btn--secondary btn--icon"
            title="New folder"
            aria-label="New folder"
            @click="handleCreateFolder"
          >
            <span class="material-icons sm" aria-hidden="true">create_new_folder</span>
          </button>
          <button
            type="button"
            class="btn btn--secondary btn--icon"
            title="Rename folder"
            aria-label="Rename folder"
            :disabled="!selectedCollection"
            @click="handleRenameFolder"
          >
            <span class="material-icons sm" aria-hidden="true">drive_file_rename_outline</span>
          </button>
          <button
            type="button"
            class="btn btn--secondary btn--icon"
            title="Delete folder"
            aria-label="Delete folder"
            :disabled="!selectedCollection"
            @click="handleDeleteFolder"
          >
            <span class="material-icons sm" aria-hidden="true">folder_delete</span>
          </button>
        </div>
      </aside>

      <main id="main-content" class="list-view__main">
        <div class="list-view__main-header">
          <h2 class="list-view__heading">{{ listHeading }}</h2>
          <p v-if="!loading && !error" class="list-view__count" aria-live="polite">
            {{ resultSummary }}
          </p>
        </div>

        <p v-if="loading" class="empty-state" role="status">Loading…</p>
        <p v-else-if="error" class="error-banner" role="alert">{{ error }}</p>

        <div v-else-if="svgs.length === 0" class="empty-state">
          <p>No SVGs yet. Create your first one!</p>
          <RouterLink :to="newSvgTo" class="btn btn--primary">
            New SVG
            <span class="material-icons sm" aria-hidden="true">add_circle_outline</span>
          </RouterLink>
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
            :show-folder="collectionFilter === FILTER_ALL"
            @delete="handleDelete"
          />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.list-view {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.list-view__header {
  flex-shrink: 0;
}

.list-view__search {
  flex: 1;
  min-width: 12rem;
  max-width: 32rem;
}

.list-view__body {
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}

.list-view__sidebar {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
  width: 16rem;
  flex-shrink: 0;
  padding: $spacing-md;
  background: $color-surface;
  border-right: 1px solid $color-border;
}

.list-view__nav {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.list-view__folders {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
}

.list-view__folder {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  width: 100%;
  margin: 0;
  padding: $spacing-sm $spacing-md;
  border: none;
  border-radius: $radius-sm;
  background: transparent;
  color: $color-text;
  font: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;

  &:hover:not(&--active) {
    background: $color-surface-hover;
  }

  &--active {
    background: var(--accent-dim);
    color: $color-text;
  }

  .material-icons {
    color: $color-text-muted;
  }

  &--active .material-icons {
    color: $color-accent;
  }
}

.list-view__folder-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-view__folder-count {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: var(--text-faint);
}

.list-view__folder-actions {
  display: flex;
  gap: $spacing-sm;
  flex-shrink: 0;
  padding-top: $spacing-sm;
  border-top: 1px solid $color-border;
}

a.btn--primary {
  font-weight: 700;
  &:hover {
    color: var(--on-accent);
  }
}

.list-view__main {
  flex: 1;
  min-width: 0;
  padding: $spacing-xl;
}

.list-view__main-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: $spacing-md;
  margin-bottom: $spacing-lg;
}

.list-view__heading {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.list-view__count {
  margin: 0;
  font-size: 0.875rem;
  color: $color-text-muted;
}

.svg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: $spacing-lg;
}

@media (max-width: 800px) {
  .list-view__header {
    flex-wrap: wrap;
    padding-left: $spacing-md;
    padding-right: $spacing-md;
  }

  .list-view__search {
    flex: 1 1 100%;
    max-width: none;
    order: 3;
  }

  .list-view__body {
    flex-direction: column;
  }

  .list-view__sidebar {
    flex-direction: row;
    align-items: center;
    width: auto;
    min-width: 0;
    border-right: none;
    border-bottom: 1px solid $color-border;
  }

  .list-view__nav {
    flex: 1;
    min-width: 0;
    overflow: auto;
  }

  .list-view__folders {
    flex-direction: row;
  }

  .list-view__folder {
    width: auto;
    flex-shrink: 0;
  }

  .list-view__folder-name {
    overflow: visible;
    text-overflow: unset;
  }

  .list-view__folder-actions {
    flex-shrink: 0;
    padding-top: 0;
    padding-left: $spacing-sm;
    border-top: none;
    border-left: 1px solid $color-border;
  }

  .list-view__main {
    padding: $spacing-lg $spacing-md;
  }
}
</style>
