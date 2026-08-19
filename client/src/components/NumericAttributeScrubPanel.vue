<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  formatNumericValue,
  getAttributeSchema,
  numericRangeForAttribute,
  parseNumericValue,
  unitsForAttribute,
  type AttributeKind,
} from '../lib/attributeSchema'
import type { ElementContext, PathSegment } from '../lib/svgDocument'
import { viewBoxForAttribute } from '../lib/svgViewport'
import { useNumericScrub } from '../composables/useNumericScrub'

const props = defineProps<{
  content: string
  context: ElementContext
  filter?: string
  activeAttributeName?: string
}>()

const emit = defineEmits<{
  update: [path: PathSegment[], name: string, value: string]
  select: [name: string]
}>()

const SCALAR_KINDS = new Set<AttributeKind>(['length', 'number', 'opacity', 'percentage'])
const drafts = reactive<Record<string, string>>({})
const editingName = ref<string | null>(null)
const { activeKey, startScrub, consumeSuppressedClick } = useNumericScrub()

const rows = computed(() => {
  const needle = props.filter?.trim().toLowerCase() ?? ''
  return Object.entries(props.context.existingAttributes)
    .flatMap(([name, value]) => {
      if (needle && !name.toLowerCase().includes(needle)) return []
      const schema = getAttributeSchema(name, props.context.tagName)
      const parsed = parseNumericValue(value)
      if (!SCALAR_KINDS.has(schema.kind) || !parsed) return []
      const viewBox = viewBoxForAttribute(props.content, props.context.path, name)
      const range = numericRangeForAttribute(name, viewBox, value)
      return [{ name, value, parsed, step: range.step }]
    })
    .sort((a, b) => a.name.localeCompare(b.name))
})

watch(
  rows,
  (nextRows) => {
    for (const row of nextRows) {
      if (editingName.value !== row.name && activeKey.value !== row.name) {
        drafts[row.name] = row.value
      }
    }
  },
  { immediate: true },
)

function update(name: string, value: string) {
  drafts[name] = value
  emit('update', props.context.path, name, value)
}

function onScrubStart(event: PointerEvent, row: (typeof rows.value)[number]) {
  startScrub(event, {
    key: row.name,
    value: row.parsed.number,
    step: row.step,
    onUpdate: (value) => update(row.name, formatNumericValue(value, row.parsed.unit)),
  })
}

function onHandleClick(event: MouseEvent, name: string) {
  if (!consumeSuppressedClick(event)) emit('select', name)
}

function onTextInput(event: Event, name: string) {
  editingName.value = name
  drafts[name] = (event.target as HTMLInputElement).value
}

function commitText(name: string, input: HTMLInputElement) {
  const row = rows.value.find((candidate) => candidate.name === name)
  const parsed = parseNumericValue(input.value)
  editingName.value = null
  if (!row || !parsed) {
    revertText(name, input)
    return
  }

  const acceptsUnits = unitsForAttribute(name, props.context.tagName).length > 1
  const unit = parsed.unit.trim() && acceptsUnits ? parsed.unit.trim() : row.parsed.unit
  const value = formatNumericValue(parsed.number, unit)
  if (value === row.value) {
    drafts[name] = row.value
    return
  }
  update(name, value)
}

function revertText(name: string, input: HTMLInputElement) {
  editingName.value = null
  const row = rows.value.find((candidate) => candidate.name === name)
  const value = row?.value ?? ''
  drafts[name] = value
  input.value = value
}

function onTextEscape(event: KeyboardEvent, name: string) {
  event.stopPropagation()
  revertText(name, event.target as HTMLInputElement)
}
</script>

<template>
  <section class="numeric-scrub" aria-labelledby="numeric-scrub-heading">
    <div class="numeric-scrub__header">
      <h3 id="numeric-scrub-heading" class="numeric-scrub__heading">Numeric attributes</h3>
      <span class="numeric-scrub__count">{{ rows.length }}</span>
    </div>
    <p v-if="rows.length" class="numeric-scrub__hint">
      Drag <span class="material-icons sm" aria-hidden="true">drag_indicator</span> sideways · Shift
      coarse · Option/Alt fine
    </p>

    <div v-if="rows.length" class="numeric-scrub__rows">
      <div
        v-for="row in rows"
        :key="row.name"
        class="numeric-scrub__row"
        :class="{ 'numeric-scrub__row--active': activeAttributeName === row.name }"
      >
        <button
          type="button"
          class="numeric-scrub__handle"
          :class="{ 'numeric-scrub__handle--dragging': activeKey === row.name }"
          :aria-label="`Drag to adjust ${row.name}; click for full controls`"
          :title="`Drag ${row.name} sideways · Shift coarse · Option/Alt fine · Click for full controls`"
          @pointerdown="onScrubStart($event, row)"
          @click="onHandleClick($event, row.name)"
        >
          <span class="material-icons sm" aria-hidden="true">drag_indicator</span>
          <span>{{ row.name }}</span>
        </button>
        <input
          :value="drafts[row.name] ?? row.value"
          type="text"
          class="input numeric-scrub__input"
          :aria-label="`${row.name} value`"
          @input="onTextInput($event, row.name)"
          @keydown.enter.exact="commitText(row.name, $event.target as HTMLInputElement)"
          @keydown.escape="onTextEscape($event, row.name)"
          @blur="commitText(row.name, $event.target as HTMLInputElement)"
        />
      </div>
    </div>
    <p v-else class="numeric-scrub__empty">
      No scalar numeric attributes match this element and filter.
    </p>
  </section>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.numeric-scrub {
  margin-bottom: $spacing-md;
  padding-top: $spacing-sm;
  border-top: 1px solid $color-border;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-sm;
  }

  &__heading {
    margin: 0;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: $color-text-muted;
  }

  &__count {
    min-width: 1.25rem;
    padding: 1px 5px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: $color-accent;
    font-size: 0.625rem;
    text-align: center;
  }

  &__hint,
  &__empty {
    margin: $spacing-xs 0 0;
    color: $color-text-muted;
    font-size: 0.6875rem;
  }

  &__hint {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;

    .material-icons {
      font-size: 0.875rem;
    }
  }

  &__rows {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
    margin-top: $spacing-sm;
  }

  &__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(5rem, 0.7fr);
    gap: $spacing-xs;
    padding: 3px;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: $color-bg;

    &--active {
      border-color: color-mix(in srgb, var(--accent) 65%, transparent);
      background: color-mix(in srgb, var(--accent) 6%, transparent);
    }
  }

  &__handle {
    display: flex;
    align-items: center;
    min-width: 0;
    padding: 2px 4px;
    border: 0;
    border-radius: $radius-sm;
    background: transparent;
    color: $color-text;
    font-family: $font-mono;
    font-size: 0.75rem;
    text-align: left;
    cursor: ew-resize;
    touch-action: none;
    user-select: none;

    &:hover,
    &:focus-visible,
    &--dragging {
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      color: $color-accent;
    }

    &:focus-visible {
      outline: 2px solid $color-accent;
      outline-offset: 1px;
    }

    .material-icons {
      flex-shrink: 0;
      color: $color-text-muted;
    }
  }

  &__input {
    min-width: 0;
    width: 100%;
    padding: 3px 6px;
    font-family: $font-mono;
    font-size: 0.75rem;
    text-align: right;
  }
}
</style>
