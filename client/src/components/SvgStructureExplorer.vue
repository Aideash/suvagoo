<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import {
  EXPLORER_COMMON_LIMIT,
  formatPathSegment,
  getElementSchema,
  isAnimationTag,
  isDescriptiveTag,
  isTextNodeTag,
  uniqueSorted,
} from '../lib/svgSchema'
import {
  findAttributeAtOffset,
  findElementAtOffset,
  findNodeByPath,
  formatElementPath,
  isXmlParsable,
  parseIndexedDocument,
  pathsEqual,
  attributeIdentity,
  type AttributeContext,
  type IndexedDocumentNode,
  type PathSegment,
} from '../lib/svgDocument'
import SvgAttributeAdjuster from './SvgAttributeAdjuster.vue'
import SvgTextNodeAdjuster from './SvgTextNodeAdjuster.vue'
import BulkTransformPanel from './BulkTransformPanel.vue'
import NumericAttributeScrubPanel from './NumericAttributeScrubPanel.vue'
import { useSnippetMode } from '../composables/useSnippetMode'
import type { TransformSessionValues } from '../lib/transformSession'

const props = defineProps<{
  content: string
  cursorOffset: number
  selectedPaths: PathSegment[][]
  transformSession: TransformSessionValues
  bakeWarning?: string
}>()

const emit = defineEmits<{
  insertChild: [tagName: string]
  insertAttribute: [name: string]
  selectElement: [path: PathSegment[]]
  selectionChange: [paths: PathSegment[][]]
  deleteChild: [path: PathSegment[]]
  deleteAttribute: [name: string]
  updateAttribute: [path: PathSegment[], name: string, value: string]
  updateTextNode: [path: PathSegment[], value: string]
  'update:transformSession': [session: TransformSessionValues]
  transformCommit: []
  transformCancel: []
  previewStateChange: [
    state: {
      attribute: AttributeContext | null
      selectedPointIndex: number | null
      selectedCommandIndex: number | null
      selectedPathHandleIndex: number | null
    },
  ]
}>()

const { isPreFilled, toggleSnippetMode } = useSnippetMode()

const filter = ref('')
const fieldId = useId()
const explorerMode = ref<'insert' | 'delete'>('insert')
const deleteMode = computed(() => explorerMode.value === 'delete')
const showAllAttributes = ref(false)
const showAllChildren = ref(false)
const selectedPointIndex = ref<number | null>(null)
const selectedCommandIndex = ref<number | null>(null)
const selectedPathHandleIndex = ref<number | null>(null)
/** Anchor index into flatTree for Shift+click ranges. */
const selectionAnchorIndex = ref<number | null>(null)

const needle = computed(() => filter.value.trim().toLowerCase())
const parsable = computed(() => isXmlParsable(props.content))
const indexedDocument = computed(() => parseIndexedDocument(props.content))
const context = computed(() => findElementAtOffset(props.content, props.cursorOffset))
const activeAttribute = computed(() => findAttributeAtOffset(props.content, props.cursorOffset))

const schema = computed(() => (context.value ? getElementSchema(context.value.tagName) : null))
const selectedNode = computed(() => {
  if (!indexedDocument.value || !context.value) return null
  return findNodeByPath(indexedDocument.value, context.value.path)
})

watch(deleteMode, (enabled) => {
  if (enabled) {
    showAllAttributes.value = true
    showAllChildren.value = true
  }
})

function toggleDeleteMode() {
  explorerMode.value = deleteMode.value ? 'insert' : 'delete'
}

function setExplorerMode(mode: 'insert' | 'delete') {
  explorerMode.value = mode
}

function onDeleteChild(path: PathSegment[]) {
  selectionAnchorIndex.value = null
  emit('deleteChild', path)
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    if (props.selectedPaths.length > 0) emit('transformCancel')

    const rootPath = indexedDocument.value?.path
    if (rootPath) emit('selectElement', rootPath)
    return
  }
  if (event.ctrlKey && event.key === 'd') {
    event.preventDefault()
    toggleDeleteMode()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})

const existingAttributeNames = computed(() => {
  if (!context.value) return new Set<string>()
  return new Set(Object.keys(context.value.existingAttributes))
})

function matchesNeedle(label: string): boolean {
  if (!needle.value) return true
  return label.toLowerCase().includes(needle.value)
}

function isStructuralChildTag(tag: string): boolean {
  return !isAnimationTag(tag) && !isDescriptiveTag(tag) && !isTextNodeTag(tag)
}

/**
 * Animation and description elements are offered by almost every schema, and
 * they sort ahead of the structural children, so they get their own rows rather
 * than filling the common slots on every container.
 */
const structuralChildren = computed(() =>
  uniqueSorted((schema.value?.children ?? []).filter(isStructuralChildTag)),
)

const visibleInsertChildren = computed(() => {
  const filtered = structuralChildren.value.filter((tag) => matchesNeedle(tag))
  if (needle.value || showAllChildren.value) return filtered
  return filtered.slice(0, EXPLORER_COMMON_LIMIT)
})

const hiddenInsertChildCount = computed(() => {
  if (deleteMode.value || needle.value || showAllChildren.value) return 0
  return Math.max(0, structuralChildren.value.length - EXPLORER_COMMON_LIMIT)
})

const animationChildren = computed(() =>
  uniqueSorted(
    (schema.value?.children ?? []).filter((tag) => isAnimationTag(tag) && matchesNeedle(tag)),
  ),
)

const descriptiveChildren = computed(() =>
  uniqueSorted(
    (schema.value?.children ?? []).filter((tag) => isDescriptiveTag(tag) && matchesNeedle(tag)),
  ),
)

const canInsertTextNode = computed(() => {
  const allowed = schema.value?.children.some(isTextNodeTag)
  if (!allowed || !matchesNeedle('text_node')) return false
  const children = selectedNode.value?.children ?? []
  const hasText = children.some((child) => isTextNodeTag(child.tag))
  if (!hasText) return true
  if (context.value && isDescriptiveTag(context.value.tagName)) return false
  return children.some((child) => !isTextNodeTag(child.tag))
})

const hasInsertableChildren = computed(
  () =>
    visibleInsertChildren.value.length > 0 ||
    hiddenInsertChildCount.value > 0 ||
    animationChildren.value.length > 0 ||
    descriptiveChildren.value.length > 0 ||
    canInsertTextNode.value,
)

const commonAttributes = computed(() => {
  const attrs = schema.value?.commonAttributes ?? []
  return uniqueSorted(attrs.filter((name) => matchesNeedle(name)))
})

const extraAttributes = computed(() => {
  const common = new Set(schema.value?.commonAttributes ?? [])
  const all = schema.value?.attributes ?? []
  return uniqueSorted(all.filter((name) => !common.has(name) && matchesNeedle(name)))
})

const visibleInsertAttributes = computed(() => {
  const attrs = [
    ...commonAttributes.value,
    ...(showAllAttributes.value || needle.value ? extraAttributes.value : []),
  ]
  if (deleteMode.value) return []
  if (needle.value || showAllAttributes.value) return attrs
  return attrs.slice(0, EXPLORER_COMMON_LIMIT)
})

const hiddenInsertAttributeCount = computed(() => {
  if (deleteMode.value || needle.value || showAllAttributes.value) return 0
  const total = uniqueSorted([...commonAttributes.value, ...extraAttributes.value]).length
  return Math.max(0, total - EXPLORER_COMMON_LIMIT)
})

function childLabel(node: IndexedDocumentNode): string {
  if (isTextNodeTag(node.tag)) {
    const preview = (node.text ?? '').replace(/\s+/g, ' ').trim()
    if (!preview) return 'text_node'
    return preview.length > 24 ? `${preview.slice(0, 23)}…` : preview
  }
  const segment = node.path.at(-1)
  if (!segment) return node.tag
  return formatPathSegment(segment)
}

function isIdAttribute(name: string): boolean {
  return name.toLowerCase() === 'id'
}

function elementId(node: IndexedDocumentNode): string | null {
  const key = Object.keys(node.attributes).find(isIdAttribute)
  if (!key) return null
  const value = node.attributes[key]?.trim()
  return value || null
}

function treeAttributeNames(node: IndexedDocumentNode): string[] {
  if (isTextNodeTag(node.tag)) return []
  return Object.keys(node.attributes)
    .filter((name) => !isIdAttribute(name))
    .slice(0, 3)
}

const existingChildren = computed(() => {
  const children = selectedNode.value?.children ?? []
  return children.filter((child) => matchesNeedle(childLabel(child)))
})

const existingAttributes = computed(() => {
  if (!context.value) return []
  return uniqueSorted(
    Object.keys(context.value.existingAttributes).filter((name) => matchesNeedle(name)),
  )
})

function isActivePath(path: PathSegment[]): boolean {
  if (!context.value) return false
  return pathsEqual(path, context.value.path)
}

function isMultiSelected(path: PathSegment[]): boolean {
  return props.selectedPaths.some((selected) => pathsEqual(selected, path))
}

function pathKey(path: PathSegment[]): string {
  return path.map((segment) => `${segment.tag}:${segment.index}`).join('/')
}

function renderTreeLines(
  node: IndexedDocumentNode,
  depth = 0,
): Array<{
  node: IndexedDocumentNode
  depth: number
  id: string | null
  attrNames: string[]
}> {
  const rows = [
    {
      node,
      depth,
      id: elementId(node),
      attrNames: treeAttributeNames(node),
    },
  ]
  for (const child of node.children) {
    rows.push(...renderTreeLines(child, depth + 1))
  }
  return rows
}

const flatTree = computed(() => {
  if (!indexedDocument.value) return []
  return renderTreeLines(indexedDocument.value)
})

function treeIndexForPath(path: PathSegment[]): number {
  return flatTree.value.findIndex((row) => pathsEqual(row.node.path, path))
}

function onTreeActivate(path: PathSegment[], event: MouseEvent | KeyboardEvent) {
  const index = treeIndexForPath(path)
  const textNode = isTextNodeTag(path.at(-1)?.tag ?? '')

  if (explorerMode.value === 'insert' && !textNode) {
    const meta = event.metaKey || event.ctrlKey

    if (event.shiftKey && selectionAnchorIndex.value != null && index >= 0) {
      const from = Math.min(selectionAnchorIndex.value, index)
      const to = Math.max(selectionAnchorIndex.value, index)
      const range = flatTree.value
        .slice(from, to + 1)
        .map((row) => row.node.path)
        .filter((candidate) => !isTextNodeTag(candidate.at(-1)?.tag ?? ''))
      emit('selectionChange', range)
      emit('selectElement', path)
      return
    }

    if (meta) {
      const exists = props.selectedPaths.some((selected) => pathsEqual(selected, path))
      const next = exists
        ? props.selectedPaths.filter((selected) => !pathsEqual(selected, path))
        : [...props.selectedPaths, path]
      emit('selectionChange', next)
      selectionAnchorIndex.value = index >= 0 ? index : selectionAnchorIndex.value
      emit('selectElement', path)
      return
    }
  }

  // Regular click - 1. set in transform, 2. deselect all
  // emit('selectionChange', [path])
  // emit('selectionChange', [])
  selectionAnchorIndex.value = index >= 0 ? index : null
  emit('selectElement', path)
}

function onAttributeChipClick(name: string) {
  emit('insertAttribute', name)
}

watch(activeAttribute, (attr) => {
  if (attr?.attrName !== 'points') {
    selectedPointIndex.value = null
  }
  if (attr?.attrName !== 'd') {
    selectedCommandIndex.value = null
    selectedPathHandleIndex.value = null
  }
  emitPreviewState()
})

watch(selectedPointIndex, () => emitPreviewState())
watch(selectedCommandIndex, () => emitPreviewState())
watch(selectedPathHandleIndex, () => emitPreviewState())

function emitPreviewState() {
  emit('previewStateChange', {
    attribute: activeAttribute.value,
    selectedPointIndex: selectedPointIndex.value,
    selectedCommandIndex: selectedCommandIndex.value,
    selectedPathHandleIndex: selectedPathHandleIndex.value,
  })
}

function onSelectPoint(index: number | null) {
  selectedPointIndex.value = index
}

function onSelectCommand(index: number | null) {
  selectedCommandIndex.value = index
  selectedPathHandleIndex.value = null
}

function setSelectedPointIndex(index: number | null) {
  selectedPointIndex.value = index
  emitPreviewState()
}

function setSelectedCommandIndex(index: number | null) {
  selectedCommandIndex.value = index
  emitPreviewState()
}

function setSelectedPathHandleIndex(index: number | null) {
  selectedPathHandleIndex.value = index
  if (index != null) {
    // keep command index in sync when selecting from preview
  }
  emitPreviewState()
}

defineExpose({ setSelectedPointIndex, setSelectedCommandIndex, setSelectedPathHandleIndex })

onMounted(() => emitPreviewState())

function onAttributeUpdate(value: string) {
  if (!activeAttribute.value) return
  emit('updateAttribute', activeAttribute.value.path, activeAttribute.value.attrName, value)
}

function onTextNodeUpdate(value: string) {
  if (!selectedNode.value || !isTextNodeTag(selectedNode.value.tag)) return
  emit('updateTextNode', selectedNode.value.path, value)
}

function onScrubUpdate(path: PathSegment[], name: string, value: string) {
  emit('updateAttribute', path, name, value)
}
</script>

<template>
  <div
    class="svg-explorer"
    :class="{
      'svg-explorer--delete': deleteMode,
    }"
  >
    <div class="svg-explorer__toolbar">
      <div class="search-field">
        <span class="material-icons sm search-field__icon" aria-hidden="true">search</span>
        <input
          :id="fieldId"
          v-model="filter"
          class="input svg-explorer__filter"
          type="search"
          aria-label="Filter elements and attributes"
          :placeholder="
            deleteMode
              ? 'Filter existing elements and attributes…'
              : 'Filter elements and attributes…'
          "
          :disabled="!context && !flatTree.length"
        />
      </div>
      <div class="svg-explorer__mode">
        <span class="svg-explorer__mode-label">Explorer mode</span>
        <div class="svg-explorer__mode-options" role="group" aria-label="Explorer mode">
          <button
            type="button"
            class="svg-explorer__mode-button"
            :class="{ active: explorerMode === 'insert' }"
            :aria-pressed="explorerMode === 'insert'"
            @click="setExplorerMode('insert')"
          >
            <span class="material-icons sm" aria-hidden="true">add</span>
            Insert
          </button>
          <button
            type="button"
            class="svg-explorer__mode-button svg-explorer__mode-button--delete"
            :class="{ active: explorerMode === 'delete' }"
            :aria-pressed="explorerMode === 'delete'"
            @click="setExplorerMode('delete')"
          >
            <span class="material-icons sm" aria-hidden="true">delete</span>
            Delete
          </button>
        </div>
      </div>
    </div>

    <div class="svg-explorer__body">
      <p v-if="!parsable" class="svg-explorer__notice svg-explorer__notice--warn">
        Markup is not valid XML. Move the cursor into a tag to explore inserts.
      </p>

      <section v-if="context" class="svg-explorer__section">
        <h3 class="svg-explorer__heading">
          {{ deleteMode ? 'Selected' : 'At cursor' }}
        </h3>
        <p class="svg-explorer__target">
          <code v-if="isTextNodeTag(context.tagName) && selectedNode">{{
            childLabel(selectedNode)
          }}</code>
          <code v-else>&lt;{{ context.tagName }}&gt;</code>
        </p>
        <p class="svg-explorer__path">{{ formatElementPath(context.path) }}</p>
      </section>
      <p v-else class="svg-explorer__notice">
        Place the cursor inside an SVG element to see available inserts.
      </p>

      <section class="svg-explorer__section">
        <h3 class="svg-explorer__heading">Document</h3>
        <p class="svg-explorer__hint">Click to select</p>
        <p v-if="explorerMode === 'insert'" class="svg-explorer__hint">
          Bulk Transform: ⌘/Ctrl+click toggle · Shift+click range
        </p>
        <ul v-if="flatTree.length" class="svg-explorer__tree">
          <li
            v-for="row in flatTree"
            :key="pathKey(row.node.path)"
            :style="{ paddingLeft: `${row.depth * 12 + 8}px` }"
          >
            <button
              type="button"
              class="svg-explorer__tree-row"
              :class="{
                active: isActivePath(row.node.path),
                selected: isMultiSelected(row.node.path) && explorerMode === 'insert',
              }"
              :aria-current="isActivePath(row.node.path) ? 'true' : undefined"
              :title="`Select ${formatElementPath(row.node.path)}`"
              @click="onTreeActivate(row.node.path, $event)"
              @keydown.enter.prevent="onTreeActivate(row.node.path, $event)"
              @keydown.space.prevent="onTreeActivate(row.node.path, $event)"
            >
              <span class="svg-explorer__tree-label">
                <span class="svg-explorer__tree-tag">{{
                  isTextNodeTag(row.node.tag) ? 'text_node' : childLabel(row.node)
                }}</span>
                <span v-if="row.id" class="svg-explorer__tree-id">#{{ row.id }}</span>
              </span>
              <span v-if="isTextNodeTag(row.node.tag)" class="svg-explorer__tree-text">{{
                childLabel(row.node)
              }}</span>
              <span v-for="name in row.attrNames" :key="name" class="svg-explorer__tree-attr">
                {{ name }}
              </span>
            </button>
          </li>
        </ul>
      </section>

      <template v-if="deleteMode">
        <section v-if="existingChildren.length" class="svg-explorer__section">
          <h3 class="svg-explorer__heading">Remove child</h3>
          <div class="svg-explorer__chips">
            <button
              v-for="child in existingChildren"
              :key="child.path.map((segment) => `${segment.tag}:${segment.index}`).join('/')"
              type="button"
              class="svg-explorer__chip svg-explorer__chip--danger"
              :title="`Delete ${formatElementPath(child.path)}`"
              @click="onDeleteChild(child.path)"
            >
              {{ childLabel(child) }}
            </button>
          </div>
        </section>

        <section v-if="existingAttributes.length" class="svg-explorer__section">
          <h3 class="svg-explorer__heading">Remove attribute</h3>
          <div class="svg-explorer__chips">
            <button
              v-for="name in existingAttributes"
              :key="name"
              type="button"
              class="svg-explorer__chip svg-explorer__chip--danger"
              :title="`Delete ${name}`"
              @click="emit('deleteAttribute', name)"
            >
              {{ name }}
            </button>
          </div>
        </section>

        <p
          v-if="context && !existingChildren.length && !existingAttributes.length"
          class="svg-explorer__notice"
        >
          Nothing to remove on this element.
        </p>
      </template>

      <template v-else-if="explorerMode === 'insert'">
        <section v-if="hasInsertableChildren" class="svg-explorer__section">
          <div class="svg-explorer__section-header">
            <h3 class="svg-explorer__heading">Child elements</h3>
            <div class="svg-explorer__snippet-mode">
              <span class="svg-explorer__snippet-mode-label">
                {{ isPreFilled ? 'Pre-filled' : 'Tag only' }}
              </span>
              <button
                type="button"
                class="svg-explorer__snippet-track"
                role="switch"
                :aria-checked="isPreFilled"
                aria-label="Insert pre-filled snippets"
                :title="
                  isPreFilled
                    ? 'Inserting worked examples — switch to bare tags'
                    : 'Inserting bare tags — switch to pre-filled snippets'
                "
                @click="toggleSnippetMode"
              >
                <span
                  class="svg-explorer__snippet-thumb"
                  :class="{ 'svg-explorer__snippet-thumb--filled': isPreFilled }"
                />
              </button>
            </div>
          </div>
          <div v-if="visibleInsertChildren.length" class="svg-explorer__chips">
            <button
              v-for="tag in visibleInsertChildren"
              :key="tag"
              type="button"
              class="svg-explorer__chip"
              :title="`Insert ${tag}`"
              @click="emit('insertChild', tag)"
            >
              {{ tag }}
            </button>
          </div>
          <button
            v-if="hiddenInsertChildCount"
            type="button"
            class="svg-explorer__more"
            @click="showAllChildren = true"
          >
            Show {{ hiddenInsertChildCount }} more…
          </button>

          <template v-if="canInsertTextNode">
            <h4 class="svg-explorer__subheading">Text</h4>
            <div class="svg-explorer__chips">
              <button
                type="button"
                class="svg-explorer__chip"
                title="Insert text"
                @click="emit('insertChild', 'text_node')"
              >
                text_node
              </button>
            </div>
          </template>

          <template v-if="descriptiveChildren.length">
            <h4 class="svg-explorer__subheading">Description</h4>
            <div class="svg-explorer__chips">
              <button
                v-for="tag in descriptiveChildren"
                :key="tag"
                type="button"
                class="svg-explorer__chip"
                :title="`Insert ${tag}`"
                @click="emit('insertChild', tag)"
              >
                {{ tag }}
              </button>
            </div>
          </template>

          <template v-if="animationChildren.length">
            <h4 class="svg-explorer__subheading">Animation</h4>
            <div class="svg-explorer__chips">
              <button
                v-for="tag in animationChildren"
                :key="tag"
                type="button"
                class="svg-explorer__chip"
                :title="`Insert ${tag}`"
                @click="emit('insertChild', tag)"
              >
                {{ tag }}
              </button>
            </div>
          </template>
        </section>

        <section v-if="schema && schema.attributes.length" class="svg-explorer__section">
          <h3 class="svg-explorer__heading">Attributes</h3>
          <div class="svg-explorer__chips">
            <button
              v-for="name in visibleInsertAttributes"
              :key="name"
              type="button"
              class="svg-explorer__chip"
              :class="{
                present: existingAttributeNames.has(name),
                selected: activeAttribute?.attrName === name,
              }"
              :title="existingAttributeNames.has(name) ? `Adjust ${name}` : `Insert ${name}`"
              @click="onAttributeChipClick(name)"
            >
              {{ name }}
            </button>
          </div>
          <button
            v-if="hiddenInsertAttributeCount"
            type="button"
            class="svg-explorer__more"
            @click="showAllAttributes = true"
          >
            Show {{ hiddenInsertAttributeCount }} more…
          </button>
        </section>
      </template>

      <SvgAttributeAdjuster
        v-if="explorerMode === 'insert' && activeAttribute"
        :key="attributeIdentity(activeAttribute)"
        :attribute="activeAttribute"
        :content="content"
        :focus-point-index="selectedPointIndex"
        :focus-command-index="selectedCommandIndex"
        class="svg-explorer__section"
        @update="onAttributeUpdate"
        @select-point="onSelectPoint"
        @select-command="onSelectCommand"
      />

      <SvgTextNodeAdjuster
        v-if="explorerMode === 'insert' && selectedNode && isTextNodeTag(selectedNode.tag)"
        :key="pathKey(selectedNode.path)"
        :node="selectedNode"
        class="svg-explorer__section"
        @update="onTextNodeUpdate"
      />

      <BulkTransformPanel
        v-if="explorerMode === 'insert' && selectedPaths.length"
        :content="content"
        :selected-paths="selectedPaths"
        :session="transformSession"
        :bake-warning="bakeWarning"
        @update:session="emit('update:transformSession', $event)"
        @commit="emit('transformCommit')"
        @cancel="emit('transformCancel')"
      />

      <NumericAttributeScrubPanel
        v-if="explorerMode === 'insert' && context && schema?.attributes.length"
        :content="content"
        :context="context"
        :filter="filter"
        :active-attribute-name="activeAttribute?.attrName"
        @update="onScrubUpdate"
        @select="onAttributeChipClick"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

@mixin switch-track($width, $height) {
  position: relative;
  width: $width;
  height: $height;
  padding: 0;
  border: 1px solid $color-border;
  border-radius: 999px;
  background: $color-bg;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background 0.15s,
    border-color 0.15s;

  &:hover {
    border-color: var(--border-strong);
  }

  &:focus-visible {
    outline: 2px solid $color-accent;
    outline-offset: 2px;
  }
}

@mixin switch-thumb($size) {
  position: absolute;
  top: 2px;
  left: 2px;
  width: $size;
  height: $size;
  border-radius: 50%;
  transition:
    transform 0.15s ease,
    background 0.15s;
}

.svg-explorer {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;

  &--delete {
    border-color: color-mix(in srgb, var(--red) 45%, transparent);
  }

  &__toolbar {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
    padding: $spacing-sm;
    border-bottom: 1px solid $color-border;
    flex-shrink: 0;
  }

  &__mode {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
  }

  &__mode-label {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $color-text-muted;
  }

  &__mode-options {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    padding: 2px;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: color-mix(in srgb, var(--border) 25%, transparent);
  }

  &__mode-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-width: 0;
    padding: 4px;
    border: 0;
    border-radius: calc($radius-sm - 1px);
    background: transparent;
    color: $color-text-muted;
    font-size: 0.6875rem;

    &:hover {
      color: $color-text;
    }

    &:focus-visible {
      outline: 2px solid $color-accent;
      outline-offset: -2px;
    }

    &.active {
      background: $color-bg;
      color: $color-accent;
      box-shadow: 0 1px 2px color-mix(in srgb, var(--text) 12%, transparent);
    }

    &--delete.active {
      color: $color-danger;
    }
  }

  &__filter {
    width: 100%;
    font-size: 0.8125rem;

    &:focus-visible {
      outline-offset: -2px;
    }
  }

  &__body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0 $spacing-sm;

    &:before {
      content: ' ';
      display: block;
      min-height: 1.25rem;
      width: 100%;
      position: sticky;
      top: 0;
      z-index: 2;
      background: linear-gradient(180deg, var(--bg-raised) 30%, transparent);
    }

    &:after {
      content: ' ';
      display: block;
      min-height: 1rem;
      width: 100%;
      position: sticky;
      bottom: 0;
      background: linear-gradient(0deg, var(--bg-raised) 30%, transparent);
    }
  }

  &__section {
    margin-bottom: $spacing-md;
  }

  &__section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-sm;
  }

  &__snippet-mode {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    margin-bottom: $spacing-xs;
  }

  &__snippet-mode-label {
    font-size: 0.5rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $color-text-muted;
    white-space: nowrap;
  }

  &__snippet-track {
    @include switch-track(32px, 18px);
  }

  &__snippet-thumb {
    @include switch-thumb(12px);
    background: $color-text-muted;

    &--filled {
      transform: translateX(16px);
      background: $color-accent;
    }
  }

  &__heading {
    margin: 0 0 $spacing-xs;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: $color-text-muted;
  }

  &__subheading {
    margin: $spacing-sm 0 $spacing-xs;
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-faint);
  }

  &__target {
    margin: 0;
    font-size: 0.875rem;

    code {
      font-family: $font-mono;
      color: $color-accent;
    }
  }

  &__path {
    margin: $spacing-xs 0 0;
    font-size: 0.75rem;
    color: $color-text-muted;
    word-break: break-word;
  }

  &__notice {
    margin: 0 0 $spacing-md;
    padding: $spacing-sm;
    border-radius: $radius-sm;
    font-size: 0.8125rem;
    color: $color-text-muted;
    background: color-mix(in srgb, var(--border) 35%, transparent);

    &--warn {
      color: var(--amber);
      background: color-mix(in srgb, var(--amber) 12%, transparent);
    }
  }

  &__tree {
    list-style: none;
    margin: 0;
    padding: 0;
    font-family: $font-mono;
    font-size: 0.75rem;
  }

  &__tree-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: $spacing-xs;
    width: 100%;
    padding: 2px 4px;
    border: 0;
    border-radius: $radius-sm;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: color-mix(in srgb, var(--accent) 8%, transparent);
    }

    &.active {
      background: color-mix(in srgb, var(--accent) 15%, transparent);
    }

    &.selected {
      outline: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
      background: color-mix(in srgb, var(--accent) 12%, transparent);
    }

    &.selected.active {
      background: color-mix(in srgb, var(--accent) 20%, transparent);
    }

    &.selected:focus-visible {
      outline-color: $color-accent;
      outline-width: 2px;
    }
  }

  &__hint {
    margin: 0 0 $spacing-xs;
    font-size: 0.6875rem;
    color: $color-text-muted;
  }

  &__tree-label {
    display: inline-flex;
    align-items: baseline;
  }

  &__tree-tag {
    color: $color-text;
  }

  &__tree-id {
    color: color-mix(in srgb, var(--text-dim), var(--accent));
    font-weight: 400;
  }

  &__tree-attr {
    color: var(--text-faint);
    font-family: var(--font-family);

    &::before {
      content: '@';
      opacity: 0.6;
    }
  }

  &__tree-text {
    color: var(--text-faint);
    font-family: var(--font-family);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-xs;
  }

  &__chip {
    padding: 2px 8px;
    border: 1px solid $color-border;
    border-radius: 999px;
    background: $color-bg;
    color: $color-text;
    font-family: $font-mono;
    font-size: 0.75rem;
    transition:
      background 0.12s,
      border-color 0.12s,
      color 0.12s;

    &:hover {
      border-color: $color-accent;
      color: $color-accent;
    }

    &.present {
      border-color: color-mix(in srgb, var(--accent) 45%, transparent);
      color: $color-accent;
    }

    &.selected {
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      border-color: $color-accent;
    }

    &--danger {
      border-color: color-mix(in srgb, var(--red) 45%, transparent);
      color: $color-danger;

      &:hover {
        background: color-mix(in srgb, var(--red) 12%, transparent);
        border-color: $color-danger;
        color: $color-danger;
      }
    }
  }

  &__more {
    margin-top: $spacing-xs;
    padding: 0;
    border: 0;
    background: transparent;
    color: $color-accent;
    font-size: 0.75rem;

    &:hover {
      color: $color-accent-hover;
    }
  }
}
</style>
