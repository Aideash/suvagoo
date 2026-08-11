<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
  updateAttribute,
  type AttributeContext,
  type PathSegment,
} from '../lib/svgDocument'
import { parsePoints } from '../lib/pointsAttribute'
import { parsePathD } from '../lib/pathAttribute'
import { useSnippetMode } from '../composables/useSnippetMode'

const route = useRoute()
const router = useRouter()
const { snippetMode } = useSnippetMode()

const isEditing = computed(() => Boolean(route.params.id))
const name = ref('Untitled SVG')
const content = ref(STARTER_SVG)
const cursorOffset = ref(0)
const builderError = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref('')

const editorRef = ref<InstanceType<typeof SvgEditor> | null>(null)
const explorerRef = ref<InstanceType<typeof SvgStructureExplorer> | null>(null)
const explorerOpen = ref(true)

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

const pointsEdit = computed(() => {
  const attr = previewState.value.attribute
  if (!attr || attr.attrName !== 'points') return null
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
  const commands = parsePathD(attr.value)
  if (!commands) return null
  return {
    path: attr.path,
    commands,
    selectedCommandIndex: previewState.value.selectedCommandIndex,
    selectedHandleIndex: previewState.value.selectedPathHandleIndex,
  }
})

onMounted(async () => {
  if (!isEditing.value) return

  loading.value = true
  error.value = ''
  try {
    const svg = await getSvg(route.params.id as string)
    name.value = svg.name
    content.value = svg.content
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load SVG'
  } finally {
    loading.value = false
  }
})

async function persistSvg(): Promise<string> {
  if (isEditing.value) {
    await updateSvg(route.params.id as string, {
      name: name.value,
      content: content.value,
    })
    return route.params.id as string
  }

  const created = await createSvg({
    name: name.value,
    content: content.value,
  })
  return created.id
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    const id = await persistSvg()
    if (!isEditing.value) {
      await router.replace({ name: 'edit', params: { id } })
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save SVG'
  } finally {
    saving.value = false
  }
}

async function saveAndExit() {
  saving.value = true
  error.value = ''
  try {
    const id = await persistSvg()
    router.push({ name: 'view', params: { id } })
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
  const result = insertChildElement(content.value, cursorOffset.value, tagName, snippetMode.value)
  if (!result) {
    builderError.value = `Could not insert <${tagName}> at the cursor.`
    return
  }
  editorRef.value?.applyChange(result.content, result.cursor)
}

function onInsertAttribute(name: string) {
  builderError.value = ''
  const result = insertAttribute(content.value, cursorOffset.value, name)
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

function onDeleteChild(path: PathSegment[]) {
  builderError.value = ''
  const result = deleteChildElement(content.value, path)
  if (!result) {
    builderError.value = 'Could not delete that element.'
    return
  }
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
</script>

<template>
  <div class="editor-view">
    <header class="page-header">
      <div class="editor-view__header-left">
        <button type="button" class="btn btn--secondary" @click="cancel">← Back</button>
        <input v-model="name" type="text" class="input editor-view__name" placeholder="SVG name" />
      </div>
      <div class="page-header__actions">
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

    <p v-if="error" class="error-banner editor-view__error">{{ error }}</p>
    <p v-if="builderError" class="error-banner editor-view__error">{{ builderError }}</p>
    <p v-if="loading" class="editor-view__loading">Loading…</p>

    <div v-else class="editor-view__workspace">
      <aside
        class="editor-view__explorer"
        :class="{ 'editor-view__explorer--collapsed': !explorerOpen }"
      >
        <div class="editor-view__explorer-header">
          <h2 v-if="explorerOpen" class="editor-view__label">Structure</h2>
          <button
            type="button"
            class="editor-view__explorer-toggle"
            :title="explorerOpen ? 'Collapse structure panel' : 'Expand structure panel'"
            @click="explorerOpen = !explorerOpen"
          >
            <span class="material-icons sm">
              {{ explorerOpen ? 'chevron_left' : 'account_tree' }}
            </span>
          </button>
        </div>
        <SvgStructureExplorer
          ref="explorerRef"
          v-show="explorerOpen"
          :content="content"
          :cursor-offset="cursorOffset"
          @insert-child="onInsertChild"
          @insert-attribute="onInsertAttribute"
          @select-element="onSelectElement"
          @delete-child="onDeleteChild"
          @delete-attribute="onDeleteAttribute"
          @update-attribute="onUpdateAttribute"
          @preview-state-change="onPreviewStateChange"
        />
      </aside>

      <div class="editor-view__main">
        <section class="editor-view__pane editor-view__pane--code">
          <h2 class="editor-view__label">Code</h2>
          <SvgEditor ref="editorRef" v-model="content" @cursor-change="cursorOffset = $event" />
        </section>
        <section class="editor-view__pane editor-view__pane--preview">
          <h2 class="editor-view__label">Preview</h2>
          <SvgPreview
            :content="content"
            :points-edit="pointsEdit"
            :path-edit="pathEdit"
            show-axes
            @select-point="onPreviewSelectPoint"
            @update-points="onPreviewUpdatePoints"
            @select-path-handle="onPreviewSelectPathHandle"
            @update-path="onPreviewUpdatePath"
          />
        </section>
      </div>
    </div>
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
    min-width: 0;
  }

  &__name {
    flex: 1;
    max-width: 320px;
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
