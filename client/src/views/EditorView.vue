<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listCollections, createCollection, type Collection } from '../api/collections'
import { STARTER_SVG, createSvg, getSvg, updateSvg } from '../api/svgs'
import SvgEditor from '../components/SvgEditor.vue'
import SvgPreview from '../components/SvgPreview.vue'
import SvgStructureExplorer from '../components/SvgStructureExplorer.vue'
import ThemePicker from '../components/ThemePicker.vue'
import {
  cursorOffsetForPath,
  deleteAttribute,
  deleteChildElement,
  findElementAtOffset,
  insertAttribute,
  insertChildElement,
  remapPathsAfterDelete,
  updateAttribute,
  type AttributeContext,
  type PathSegment,
} from '../lib/svgDocument'
import { parsePoints } from '../lib/pointsAttribute'
import { parsePathD } from '../lib/pathAttribute'
import { buildDefsPreview } from '../lib/defsPreview'
import { buildIsolatedPreview } from '../lib/isolatedPreview'
import type { HandleSurface } from '../lib/handleEdit'
import {
  contentViewportAtOffset,
  isResourceContent,
  viewportAtOffsetForAttribute,
} from '../lib/svgViewport'
import { useAutosavePreference } from '../composables/useAutosavePreference'
import { useSnippetMode } from '../composables/useSnippetMode'
import { bakeTransform } from '../lib/bakeTransform'
import { selectionPivot } from '../lib/selectionBounds'
import {
  applySessionToPreviewContent,
  createIdentitySession,
  isIdentitySession,
  type TransformSessionValues,
} from '../lib/transformSession'

const route = useRoute()
const router = useRouter()
const { snippetMode } = useSnippetMode()
const { autosaveEnabled, toggleAutosave } = useAutosavePreference()

const AUTOSAVE_DELAY_MS = 1000

const isEditing = computed(() => Boolean(route.params.id))
const name = ref('Untitled SVG')
/** Empty string means unfiled; HTML <select> cannot round-trip null. */
const collectionId = ref('')
const NEW_FOLDER = '__new_folder__'
const collections = ref<Collection[]>([])
/** Value held while the New Folder prompt is open so cancel can restore it. */
const previousCollectionId = ref('')
const content = ref(STARTER_SVG)
const cursorOffset = ref(0)
const builderError = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref('')

type PersistSnapshot = { name: string; content: string; collectionId: string }

let lastPersisted: PersistSnapshot = {
  name: name.value,
  content: content.value,
  collectionId: collectionId.value,
}
let autosaveTimer: ReturnType<typeof setTimeout> | undefined

const editorRef = ref<InstanceType<typeof SvgEditor> | null>(null)
const explorerRef = ref<InstanceType<typeof SvgStructureExplorer> | null>(null)
const explorerOpen = ref(true)

const selectedPaths = ref<PathSegment[][]>([])
const transformSession = ref<TransformSessionValues>(createIdentitySession())
const bakeWarning = ref('')

const previewState = ref<{
  attribute: AttributeContext | null
  selectedPointIndex: number | null
  selectedCommandIndex: number | null
  selectedPathHandleIndex: number | null
}>({
  attribute: null,
  selectedPointIndex: null,
  selectedCommandIndex: null,
  selectedPathHandleIndex: null,
})

const previewContent = computed(() =>
  applySessionToPreviewContent(content.value, selectedPaths.value, transformSession.value),
)

const pointsEdit = computed(() => {
  const attr = previewState.value.attribute
  if (!attr || attr.attrName !== 'points') return null
  // Handles edit real source geometry; hide while a non-identity session is active.
  if (!isIdentitySession(transformSession.value)) return null
  const points = parsePoints(attr.value)
  if (!points) return null
  return {
    path: attr.path,
    points,
    selectedIndex: previewState.value.selectedPointIndex,
  }
})

const pathEdit = computed(() => {
  const attr = previewState.value.attribute
  if (!attr || attr.attrName !== 'd') return null
  if (!isIdentitySession(transformSession.value)) return null
  const commands = parsePathD(attr.value)
  if (!commands) return null
  return {
    path: attr.path,
    commands,
    selectedCommandIndex: previewState.value.selectedCommandIndex,
    selectedHandleIndex: previewState.value.selectedPathHandleIndex,
  }
})

const defsPreview = computed(() => buildDefsPreview(previewContent.value, cursorOffset.value))
const isolatedPreview = computed(() =>
  buildIsolatedPreview(previewContent.value, cursorOffset.value),
)

/**
 * Geometry declared inside a resource is painted elsewhere and in another
 * coordinate space, so its handles belong on the isolated preview.
 */
const handleSurface = computed<HandleSurface | null>(() => {
  const attr = previewState.value.attribute
  if (!attr) return null
  if (!isResourceContent(attr.path)) return 'document'
  return isolatedPreview.value ? 'isolated' : null
})

onMounted(async () => {
  loading.value = true
  error.value = ''
  try {
    collections.value = await listCollections()

    if (isEditing.value) {
      const svg = await getSvg(route.params.id as string)
      name.value = svg.name
      collectionId.value = svg.collectionId ?? ''
      previousCollectionId.value = collectionId.value
      content.value = svg.content
    } else {
      const fromQuery = route.query.collection
      if (typeof fromQuery === 'string' && collections.value.some((c) => c.id === fromQuery)) {
        collectionId.value = fromQuery
      }
      previousCollectionId.value = collectionId.value
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load SVG'
  } finally {
    loading.value = false
    rememberPersisted()
  }
})

async function onCollectionChange() {
  if (collectionId.value !== NEW_FOLDER) {
    previousCollectionId.value = collectionId.value
    return
  }

  const name = window.prompt('New folder name')
  if (name == null) {
    collectionId.value = previousCollectionId.value
    return
  }
  const trimmed = name.trim()
  if (!trimmed) {
    collectionId.value = previousCollectionId.value
    return
  }

  try {
    const created = await createCollection({ name: trimmed })
    collections.value = [...collections.value, created].sort((a, b) => a.name.localeCompare(b.name))
    collectionId.value = created.id
    previousCollectionId.value = created.id
  } catch (err) {
    collectionId.value = previousCollectionId.value
    error.value = err instanceof Error ? err.message : 'Failed to create folder'
  }
}

function currentSnapshot(): PersistSnapshot {
  return {
    name: name.value,
    content: content.value,
    collectionId: collectionId.value,
  }
}

function rememberPersisted(snapshot: PersistSnapshot = currentSnapshot()) {
  lastPersisted = snapshot
}

function isDirty(snapshot: PersistSnapshot = currentSnapshot()): boolean {
  return (
    snapshot.name !== lastPersisted.name ||
    snapshot.content !== lastPersisted.content ||
    snapshot.collectionId !== lastPersisted.collectionId
  )
}

function clearAutosaveTimer() {
  if (autosaveTimer !== undefined) {
    clearTimeout(autosaveTimer)
    autosaveTimer = undefined
  }
}

function scheduleAutosave() {
  clearAutosaveTimer()
  if (!autosaveEnabled.value || loading.value) return
  if (collectionId.value === NEW_FOLDER) return
  if (!isDirty()) return

  autosaveTimer = setTimeout(() => {
    autosaveTimer = undefined
    void runAutosave()
  }, AUTOSAVE_DELAY_MS)
}

async function persistSvg(snapshot: PersistSnapshot = currentSnapshot()): Promise<string> {
  const folderId =
    snapshot.collectionId && snapshot.collectionId !== NEW_FOLDER ? snapshot.collectionId : null

  if (isEditing.value) {
    await updateSvg(route.params.id as string, {
      name: snapshot.name,
      content: snapshot.content,
      collectionId: folderId,
    })
    return route.params.id as string
  }

  const created = await createSvg({
    name: snapshot.name,
    content: snapshot.content,
    collectionId: folderId,
  })
  return created.id
}

async function commitSave(exitAfter: boolean) {
  clearAutosaveTimer()
  saving.value = true
  error.value = ''
  const snapshot = currentSnapshot()
  try {
    const id = await persistSvg(snapshot)
    rememberPersisted(snapshot)
    if (exitAfter) {
      await router.push({ name: 'list' })
      return
    }
    if (!isEditing.value) {
      await router.replace({ name: 'edit', params: { id } })
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save SVG'
  } finally {
    saving.value = false
  }
}

async function save() {
  await commitSave(false)
}

async function saveAndExit() {
  await commitSave(true)
}

async function runAutosave() {
  if (!autosaveEnabled.value || loading.value || saving.value) return
  if (collectionId.value === NEW_FOLDER) return
  if (!isDirty()) return

  saving.value = true
  error.value = ''
  const snapshot = currentSnapshot()
  try {
    const id = await persistSvg(snapshot)
    rememberPersisted(snapshot)
    if (!isEditing.value) {
      await router.replace({ name: 'edit', params: { id } })
    }
    if (isDirty()) scheduleAutosave()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save SVG'
  } finally {
    saving.value = false
  }
}

function cancel() {
  if (isEditing.value) {
    router.push({ name: 'view', params: { id: route.params.id } })
  } else {
    router.push({ name: 'list' })
  }
}

function onInsertChild(tagName: string) {
  builderError.value = ''
  const result = insertChildElement(
    content.value,
    cursorOffset.value,
    tagName,
    snippetMode.value,
    contentViewportAtOffset(content.value, cursorOffset.value).viewBox,
  )
  if (!result) {
    builderError.value = `Could not insert <${tagName}> at the cursor.`
    return
  }
  editorRef.value?.applyChange(result.content, result.cursor)
}

function onInsertAttribute(name: string) {
  builderError.value = ''
  const result = insertAttribute(
    content.value,
    cursorOffset.value,
    name,
    viewportAtOffsetForAttribute(content.value, cursorOffset.value, name).viewBox,
  )
  if (!result) {
    builderError.value = `Could not insert attribute ${name} at the cursor.`
    return
  }
  editorRef.value?.applyChange(result.content, result.cursor)
}

function onSelectElement(path: PathSegment[]) {
  builderError.value = ''
  const offset = cursorOffsetForPath(content.value, path)
  if (offset == null) {
    builderError.value = 'Could not locate that element in the source.'
    return
  }
  editorRef.value?.setCursor(offset)
}

function onSelectionChange(paths: PathSegment[][]) {
  selectedPaths.value = paths
  bakeWarning.value = ''
  const pivot = selectionPivot(content.value, paths)
  // Refresh pivot when selection changes; keep tx/ty/angle/scale if already editing.
  if (isIdentitySession(transformSession.value)) {
    transformSession.value = createIdentitySession(pivot)
  } else {
    transformSession.value = { ...transformSession.value, cx: pivot.cx, cy: pivot.cy }
  }
}

function onTransformCommit() {
  bakeWarning.value = ''
  if (selectedPaths.value.length === 0 || isIdentitySession(transformSession.value)) return

  const result = bakeTransform(content.value, selectedPaths.value, transformSession.value)
  const cursor =
    cursorOffsetForPath(result.content, selectedPaths.value[0] ?? []) ?? cursorOffset.value
  editorRef.value?.applyChange(result.content, cursor)

  if (result.skipped.length) {
    const tags = [...new Set(result.skipped.map((s) => s.tag))].join(', ')
    bakeWarning.value = `Skipped ${result.skipped.length} element(s): ${tags}`
  }

  // Path identities change when tags convert (e.g. circle → path).
  if (result.convertedToPath.length > 0) {
    selectedPaths.value = []
    transformSession.value = createIdentitySession()
  } else {
    transformSession.value = createIdentitySession(
      selectionPivot(result.content, selectedPaths.value),
    )
  }
}

function onTransformCancel() {
  bakeWarning.value = ''
  selectedPaths.value = []
  transformSession.value = createIdentitySession()
}

function onTransformSessionUpdate(session: TransformSessionValues) {
  transformSession.value = session
  bakeWarning.value = ''
}

function onEscapeTransform(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (selectedPaths.value.length === 0 && isIdentitySession(transformSession.value)) return
  event.preventDefault()
  onTransformCancel()
}

// Any edit that lands supersedes the last failed action's message.
watch(content, () => {
  builderError.value = ''
})

watch([content, name, collectionId], () => {
  scheduleAutosave()
})

watch(autosaveEnabled, (enabled) => {
  if (enabled) scheduleAutosave()
  else clearAutosaveTimer()
})

watch(selectedPaths, (paths) => {
  if (paths.length === 0 && !isIdentitySession(transformSession.value)) {
    transformSession.value = createIdentitySession()
  }
})

onMounted(() => {
  window.addEventListener('keydown', onEscapeTransform)
})

onBeforeUnmount(() => {
  clearAutosaveTimer()
  window.removeEventListener('keydown', onEscapeTransform)
})

function onDeleteChild(path: PathSegment[]) {
  builderError.value = ''
  const result = deleteChildElement(content.value, path)
  if (!result) {
    builderError.value = 'Could not delete that element.'
    return
  }
  const remaining = remapPathsAfterDelete(selectedPaths.value, path)
  if (remaining.length !== selectedPaths.value.length) {
    transformSession.value = createIdentitySession(selectionPivot(result.content, remaining))
  }
  selectedPaths.value = remaining
  editorRef.value?.applyChange(result.content, result.cursor)
}

function onDeleteAttribute(name: string) {
  builderError.value = ''
  const path = findElementAtOffset(content.value, cursorOffset.value)?.path
  if (!path) {
    builderError.value = `Could not delete attribute ${name}.`
    return
  }
  const result = deleteAttribute(content.value, path, name)
  if (!result) {
    builderError.value = `Could not delete attribute ${name}.`
    return
  }
  editorRef.value?.applyChange(result.content, result.cursor)
}

function onUpdateAttribute(path: PathSegment[], name: string, value: string) {
  builderError.value = ''
  const result = updateAttribute(content.value, path, name, value)
  if (!result) {
    builderError.value = `Could not update attribute ${name}.`
    return
  }
  editorRef.value?.applyChange(result.content, result.cursor)
}

function onPreviewStateChange(state: {
  attribute: AttributeContext | null
  selectedPointIndex: number | null
  selectedCommandIndex: number | null
  selectedPathHandleIndex: number | null
}) {
  previewState.value = state
}

function onPreviewSelectPoint(index: number) {
  explorerRef.value?.setSelectedPointIndex(index)
}

function onPreviewSelectPathHandle(handleIndex: number, commandIndex: number) {
  explorerRef.value?.setSelectedCommandIndex(commandIndex)
  explorerRef.value?.setSelectedPathHandleIndex(handleIndex)
}

function onPreviewUpdatePoints(value: string) {
  const attr = previewState.value.attribute
  if (!attr) return
  onUpdateAttribute(attr.path, attr.attrName, value)
}

function onPreviewUpdatePath(value: string) {
  const attr = previewState.value.attribute
  if (!attr) return
  onUpdateAttribute(attr.path, attr.attrName, value)
}

watch(
  [name, isEditing],
  () => {
    document.title = isEditing.value ? `${name.value} — Suvagoo` : 'New SVG — Suvagoo'
  },
  { immediate: true },
)
</script>

<template>
  <div class="editor-view">
    <h1 class="visually-hidden">{{ isEditing ? `Edit ${name}` : 'New SVG' }}</h1>
    <header class="page-header">
      <div class="editor-view__header-left">
        <button type="button" class="btn btn--secondary" @click="cancel">← View</button>
        <input
          id="svg-name"
          name="svg-name"
          v-model="name"
          type="text"
          class="input editor-view__name"
          placeholder="SVG name"
          aria-label="SVG name"
        />
        <select
          id="svg-folder"
          name="svg-folder"
          v-model="collectionId"
          class="input editor-view__folder"
          aria-label="Folder"
          :disabled="loading"
          @change="onCollectionChange"
        >
          <option value="">No folder</option>
          <option v-for="collection in collections" :key="collection.id" :value="collection.id">
            {{ collection.name }}
          </option>
          <option :value="NEW_FOLDER">New folder…</option>
        </select>
      </div>
      <div class="page-header__actions">
        <div class="editor-view__autosave">
          <span id="autosave-label" class="editor-view__autosave-label">Autosave</span>
          <button
            type="button"
            class="editor-view__autosave-track"
            role="switch"
            :aria-checked="autosaveEnabled"
            aria-labelledby="autosave-label"
            :title="
              autosaveEnabled
                ? 'Autosave on — click to save only manually'
                : 'Autosave off — click to save changes automatically'
            "
            :disabled="loading"
            @click="toggleAutosave"
          >
            <span
              class="editor-view__autosave-thumb"
              :class="{ 'editor-view__autosave-thumb--on': autosaveEnabled }"
            />
          </button>
        </div>
        <button
          type="button"
          class="btn btn--secondary"
          :disabled="saving || loading"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button
          type="button"
          class="btn btn--primary"
          :disabled="saving || loading"
          @click="saveAndExit"
        >
          {{ saving ? 'Saving…' : 'Save & exit' }}
        </button>
        <span class="separator" style="width: 5px"></span>
        <ThemePicker />
      </div>
    </header>

    <p v-if="error" class="error-banner editor-view__error" role="alert">{{ error }}</p>
    <p v-if="builderError" class="error-banner editor-view__error" role="alert">
      {{ builderError }}
    </p>
    <p v-if="loading" class="editor-view__loading" role="status">Loading…</p>

    <main v-else id="main-content" class="editor-view__workspace">
      <aside
        id="structure-panel"
        class="editor-view__explorer"
        :class="{ 'editor-view__explorer--collapsed': !explorerOpen }"
      >
        <div class="editor-view__explorer-header">
          <h2 v-if="explorerOpen" class="editor-view__label">Structure</h2>
          <button
            type="button"
            class="editor-view__explorer-toggle"
            :title="explorerOpen ? 'Collapse structure panel' : 'Expand structure panel'"
            :aria-label="explorerOpen ? 'Collapse structure panel' : 'Expand structure panel'"
            :aria-expanded="explorerOpen"
            aria-controls="structure-panel"
            @click="explorerOpen = !explorerOpen"
          >
            <span class="material-icons sm" aria-hidden="true">
              {{ explorerOpen ? 'chevron_left' : 'account_tree' }}
            </span>
          </button>
        </div>
        <SvgStructureExplorer
          ref="explorerRef"
          v-show="explorerOpen"
          :content="content"
          :cursor-offset="cursorOffset"
          :selected-paths="selectedPaths"
          :transform-session="transformSession"
          :bake-warning="bakeWarning"
          @insert-child="onInsertChild"
          @insert-attribute="onInsertAttribute"
          @select-element="onSelectElement"
          @selection-change="onSelectionChange"
          @delete-child="onDeleteChild"
          @delete-attribute="onDeleteAttribute"
          @update-attribute="onUpdateAttribute"
          @update:transform-session="onTransformSessionUpdate"
          @transform-commit="onTransformCommit"
          @transform-cancel="onTransformCancel"
          @preview-state-change="onPreviewStateChange"
        />
      </aside>

      <div class="editor-view__main">
        <section class="editor-view__pane editor-view__pane--code">
          <h2 class="editor-view__label">Code</h2>
          <SvgEditor
            ref="editorRef"
            v-model="content"
            @cursor-change="cursorOffset = $event"
            @format-error="builderError = $event"
            @copy-error="builderError = $event"
          />
        </section>
        <section class="editor-view__pane editor-view__pane--preview">
          <h2 class="editor-view__label">Preview</h2>
          <SvgPreview
            :content="previewContent"
            :points-edit="pointsEdit"
            :path-edit="pathEdit"
            :defs-preview="defsPreview"
            :isolated-preview="isolatedPreview"
            :handle-surface="handleSurface"
            show-axes
            @select-point="onPreviewSelectPoint"
            @update-points="onPreviewUpdatePoints"
            @select-path-handle="onPreviewSelectPathHandle"
            @update-path="onPreviewUpdatePath"
          />
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.editor-view {
  display: flex;
  flex-direction: column;
  height: 100vh;

  &__header-left {
    display: flex;
    align-items: center;
    gap: $spacing-md;
    flex: 1;

    button {
      text-wrap: nowrap;
    }
  }

  &__name {
    flex: 1;
    max-width: 320px;
  }

  &__folder {
    flex: 0 1 10rem;
    min-width: 7rem;
    max-width: 12rem;
    cursor: pointer;
  }

  &__autosave {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    margin-right: $spacing-xs;
  }

  &__autosave-label {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $color-text-muted;
    white-space: nowrap;
  }

  &__autosave-track {
    position: relative;
    width: 32px;
    height: 18px;
    padding: 0;
    border: 1px solid $color-border;
    border-radius: 999px;
    background: $color-bg;
    cursor: pointer;
    flex-shrink: 0;
    transition:
      background 0.15s,
      border-color 0.15s;

    &:hover:not(:disabled) {
      border-color: var(--border-strong);
    }

    &:focus-visible {
      outline: 2px solid $color-accent;
      outline-offset: 2px;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__autosave-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: $color-text-muted;
    transition:
      transform 0.15s ease,
      background 0.15s;

    &--on {
      transform: translateX(16px);
      background: $color-accent;
    }
  }

  &__error {
    margin: $spacing-md $spacing-xl 0;
  }

  &__loading {
    padding: $spacing-xl;
    color: $color-text-muted;
    text-align: center;
  }

  &__workspace {
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 0;
    overflow: hidden;
  }

  &__explorer {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
    width: min(320px, 34vw);
    min-width: 220px;
    flex-shrink: 0;
    min-height: 0;
    transition:
      width 0.2s ease,
      min-width 0.2s ease;
    padding: $spacing-md $spacing-sm;
    border-right: 1px solid var(--border);
    background: var(--bg-raised);
    box-shadow: 0 0 20px 0 rgba(0, 0, 0, 0.4);

    &--collapsed {
      width: 40px;
      min-width: 40px;
      align-items: center;
    }
  }

  &__explorer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-xs;
    flex-shrink: 0;

    .editor-view__explorer--collapsed & {
      justify-content: center;
    }
  }

  &__explorer-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    padding: 0;
    border-width: 1px;
    border-style: solid;
    border-color: transparent;
    border-radius: $radius-sm;
    background: $color-surface;
    color: $color-text-muted;
    cursor: pointer;
    transition:
      background 0.12s,
      color 0.12s,
      border-color 0.12s;

    &:hover {
      background: $color-surface-hover;
      color: $color-text;
      border-color: var(--border-strong);
    }

    .editor-view__explorer--collapsed & {
      border-color: var(--border);
    }
  }

  &__main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    gap: $spacing-md;
    padding: $spacing-md $spacing-xl $spacing-xl;
    overflow: hidden;
  }

  &__pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    gap: $spacing-sm;

    &--code {
      max-height: 40cqh;
      min-height: 0;
      overflow: hidden;
    }

    &--preview {
      flex: 1 0 min(240px, 32vh);
      min-height: 120px;
      overflow: hidden;
    }
  }

  &__label {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: $color-text-muted;
  }

  &__explorer :deep(.svg-explorer) {
    flex: 1;
    min-height: 0;
  }

  &__pane--code :deep(.svg-editor) {
    flex: 1;
    min-height: 0;
  }

  &__pane--preview :deep(.svg-preview) {
    flex: 1;
    min-height: 0;
  }
}
</style>
