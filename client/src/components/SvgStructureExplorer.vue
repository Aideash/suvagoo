<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  EXPLORER_COMMON_LIMIT,
  formatPathSegment,
  getElementSchema,
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
import { useSnippetMode } from '../composables/useSnippetMode'

const props = defineProps<{
  content: string
  cursorOffset: number
}>()

const emit = defineEmits<{
  insertChild: [tagName: string]
  insertAttribute: [name: string]
  selectElement: [path: PathSegment[]]
  deleteChild: [path: PathSegment[]]
  deleteAttribute: [name: string]
  updateAttribute: [path: PathSegment[], name: string, value: string]
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
const deleteMode = ref(false)
const showAllAttributes = ref(false)
const showAllChildren = ref(false)
const selectedPointIndex = ref<number | null>(null)
const selectedCommandIndex = ref<number | null>(null)
const selectedPathHandleIndex = ref<number | null>(null)

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
  deleteMode.value = !deleteMode.value
}

function onModeKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    toggleDeleteMode()
  }
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (!event.ctrlKey || event.key !== 'd') return
  event.preventDefault()
  toggleDeleteMode()
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

const visibleInsertChildren = computed(() => {
  const children = schema.value?.children ?? []
  const filtered = children.filter((tag) => matchesNeedle(tag))
  const sorted = uniqueSorted(filtered)
  if (needle.value || showAllChildren.value) return sorted
  return sorted.slice(0, EXPLORER_COMMON_LIMIT)
})

const hiddenInsertChildCount = computed(() => {
  if (deleteMode.value || needle.value || showAllChildren.value) return 0
  const total = uniqueSorted(schema.value?.children ?? []).length
  return Math.max(0, total - EXPLORER_COMMON_LIMIT)
})

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
  const segment = node.path.at(-1)
  if (!segment) return node.tag
  return formatPathSegment(segment)
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

function renderTreeLines(
  node: IndexedDocumentNode,
  depth = 0,
): Array<{ node: IndexedDocumentNode; depth: number }> {
  const rows: Array<{ node: IndexedDocumentNode; depth: number }> = [{ node, depth }]
  for (const child of node.children) {
    rows.push(...renderTreeLines(child, depth + 1))
  }
  return rows
}

const flatTree = computed(() => {
  if (!indexedDocument.value) return []
  return renderTreeLines(indexedDocument.value)
})

function onTreeClick(path: PathSegment[]) {
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
</script>

<template>
  <div class="svg-explorer" :class="{ 'svg-explorer--delete': deleteMode }">
    <div class="svg-explorer__toolbar">
      <input
        v-model="filter"
        class="input svg-explorer__filter"
        type="search"
        :placeholder="
          deleteMode
            ? 'Filter existing elements and attributes…'
            : 'Filter elements and attributes…'
        "
        :disabled="!context && !flatTree.length"
      />
      <div class="svg-explorer__mode">
        <span
          class="svg-explorer__mode-label"
          :class="{ 'svg-explorer__mode-label--delete': deleteMode }"
        >
          {{ deleteMode ? 'Delete Mode' : 'Insert Mode' }}
        </span>
        <div class="svg-explorer__mode-toggle">
          <span
            class="material-icons sm svg-explorer__mode-icon"
            :class="{ active: !deleteMode }"
            aria-hidden="true"
          >
            add
          </span>
          <button
            type="button"
            class="svg-explorer__mode-track"
            role="switch"
            :aria-checked="deleteMode"
            :aria-label="deleteMode ? 'Switch to insert mode' : 'Switch to delete mode'"
            @click="toggleDeleteMode"
            @keydown="onModeKeydown"
          >
            <span
              class="svg-explorer__mode-thumb"
              :class="{ 'svg-explorer__mode-thumb--delete': deleteMode }"
            />
          </button>
          <span
            class="material-icons sm svg-explorer__mode-icon"
            :class="{ active: deleteMode }"
            aria-hidden="true"
          >
            delete
          </span>
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
          <code>&lt;{{ context.tagName }}&gt;</code>
        </p>
        <p class="svg-explorer__path">{{ formatElementPath(context.path) }}</p>
      </section>
      <p v-else class="svg-explorer__notice">
        Place the cursor inside an SVG element to see available inserts.
      </p>

      <section class="svg-explorer__section">
        <div class="svg-explorer__section-header">
          <h3 class="svg-explorer__heading">Document</h3>
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
        <ul v-if="flatTree.length" class="svg-explorer__tree">
          <li
            v-for="row in flatTree"
            :key="row.node.path.map((segment) => `${segment.tag}:${segment.index}`).join('/')"
            :style="{ paddingLeft: `${row.depth * 12 + 8}px` }"
          >
            <button
              type="button"
              class="svg-explorer__tree-row"
              :class="{ active: isActivePath(row.node.path) }"
              :title="`Select ${formatElementPath(row.node.path)}`"
              @click="onTreeClick(row.node.path)"
            >
              <span class="svg-explorer__tree-tag">{{ childLabel(row.node) }}</span>
              <span
                v-for="name in Object.keys(row.node.attributes).slice(0, 3)"
                :key="name"
                class="svg-explorer__tree-attr"
              >
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
              @click="emit('deleteChild', child.path)"
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

      <template v-else>
        <section v-if="schema?.children.length" class="svg-explorer__section">
          <h3 class="svg-explorer__heading">Child elements</h3>
          <div class="svg-explorer__chips">
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
        </section>

        <section v-if="schema" class="svg-explorer__section">
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
        v-if="activeAttribute"
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
    color: $color-accent;

    &--delete {
      color: $color-danger;
    }
  }

  &__mode-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: $spacing-sm;
  }

  &__mode-icon {
    color: $color-text-muted;
    opacity: 0.45;
    transition:
      color 0.15s,
      opacity 0.15s;

    &.active {
      color: inherit;
      opacity: 1;
    }
  }

  &--delete &__mode-icon.active {
    color: $color-danger;
  }

  &:not(&--delete) &__mode-icon.active {
    color: $color-accent;
  }

  &__mode-track {
    @include switch-track(36px, 20px);
  }

  &--delete &__mode-track {
    background: color-mix(in srgb, var(--red) 8%, transparent);
    border-color: color-mix(in srgb, var(--red) 35%, transparent);
  }

  &__mode-thumb {
    @include switch-thumb(14px);
    background: $color-accent;

    &--delete {
      transform: translateX(16px);
      background: $color-danger;
    }
  }

  &__filter {
    width: 100%;
    font-size: 0.8125rem;
  }

  &__body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: $spacing-sm;
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
  }

  &__tree-tag {
    color: $color-text;
  }

  &__tree-attr {
    color: $color-text-muted;
    &::before {
      content: '@';
      opacity: 0.6;
    }
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
