<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { attributeIdentity, type AttributeContext } from '../lib/svgDocument'
import {
  FILTER_AMOUNT_PERCENT_RANGE,
  FILTER_AMOUNT_RANGE,
  FILTER_AMOUNT_UNITS,
  FILTER_ANGLE_RANGE,
  FILTER_ANGLE_UNITS,
  FILTER_FUNCTION_META,
  FILTER_LENGTH_RANGE,
  FILTER_LENGTH_UNITS,
  FILTER_OFFSET_RANGE,
  addFunction,
  availableAddFunctions,
  ensureEditableValues,
  formatFilterList,
  formatFunctionSummary,
  isFilterReference,
  isFilterSolo,
  moveFunction,
  parseFilterList,
  removeFunction,
  updateFunctionColor,
  updateFunctionReference,
  updateFunctionValueAt,
  type FilterFunction,
  type FilterFunctionType,
} from '../lib/filterAttribute'
import { suggestIdReferences, suggestIds, type DocumentId } from '../lib/idReferences'
import AxisControl from './AxisControl.vue'
import ColorAttributeAdjuster from './ColorAttributeAdjuster.vue'
import IdReferenceOption from './IdReferenceOption.vue'
import ValueSuggestInput from './ValueSuggestInput.vue'

const props = defineProps<{
  attribute: AttributeContext
  /** Ids defined in the document, offered while typing `url(#…)`. */
  documentIds: readonly DocumentId[]
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const SUGGESTION_LIMIT = 5

const textDraft = ref(props.attribute.value)
const caret = ref(props.attribute.value.length)
const textInput = ref<{ setCaret: (offset: number) => void }>()
const isEditingText = ref(false)
const selectedIndex = ref<number | null>(null)
const showAddMenu = ref(false)

const idSuggestions = computed(() =>
  suggestIdReferences(
    textDraft.value,
    caret.value,
    props.documentIds,
    props.attribute.attrName,
    SUGGESTION_LIMIT,
  ),
)

const parsedFunctions = computed(() => {
  if (isEditingText.value) return parseFilterList(props.attribute.value)
  return parseFilterList(textDraft.value) ?? parseFilterList(props.attribute.value)
})

const parseError = computed(() => {
  if (isEditingText.value) return false
  const trimmed = textDraft.value.trim()
  if (!trimmed) return false
  return parsedFunctions.value === null
})

const selectedFunction = computed(() => {
  if (selectedIndex.value == null || !parsedFunctions.value) return null
  return parsedFunctions.value[selectedIndex.value] ?? null
})

const selectedReference = computed(() =>
  selectedFunction.value && isFilterReference(selectedFunction.value.type)
    ? (selectedFunction.value.reference ?? '')
    : null,
)

const referenceDraft = ref('')

watch([selectedIndex, selectedReference], () => {
  referenceDraft.value = selectedReference.value ?? ''
})

const referenceSuggestions = computed(() => {
  if (selectedReference.value == null) return []
  return suggestIds(
    referenceDraft.value.replace(/^#/, ''),
    props.documentIds,
    props.attribute.attrName,
    SUGGESTION_LIMIT,
  )
})

/** A filter reference normally points at a `<filter>`, so seed with the first one. */
const referenceSeed = computed(() => {
  const filterElement = props.documentIds.find((entry) => entry.tag.toLowerCase() === 'filter')
  return filterElement?.id ?? props.documentIds[0]?.id ?? ''
})

type ParamField = {
  label: string
  valueIndex: number
  kind: 'length' | 'amount' | 'angle' | 'offset'
  value: number
  unit: string
  units: readonly string[]
}

function axisLabel(param: string): string {
  const labels: Record<string, string> = {
    radius: 'Radius',
    amount: 'Amount',
    angle: 'Angle',
    ox: 'Offset X',
    oy: 'Offset Y',
    blur: 'Blur',
  }
  return labels[param] ?? param
}

const paramFields = computed((): ParamField[] => {
  const fn = selectedFunction.value
  if (!fn || isFilterSolo(fn.type) || isFilterReference(fn.type)) return []

  const meta = FILTER_FUNCTION_META[fn.type]
  const values = ensureEditableValues(fn)
  const fields: ParamField[] = []

  if (fn.type === 'drop-shadow') {
    const kinds: Array<ParamField['kind']> = ['offset', 'offset', 'length']
    for (let i = 0; i < 3; i++) {
      const label = meta.paramLabels[i]
      const arg = values[i] ?? { number: 0, unit: 'px' }
      fields.push({
        label: axisLabel(label),
        valueIndex: i,
        kind: kinds[i],
        value: arg.number,
        unit: arg.unit || 'px',
        units: FILTER_LENGTH_UNITS,
      })
    }
    return fields
  }

  for (let i = 0; i < meta.paramLabels.length; i++) {
    const label = meta.paramLabels[i]
    const arg = values[i] ?? { number: 0, unit: '' }
    if (meta.paramKind === 'length') {
      fields.push({
        label: axisLabel(label),
        valueIndex: i,
        kind: 'length',
        value: arg.number,
        unit: arg.unit || 'px',
        units: FILTER_LENGTH_UNITS,
      })
    } else if (meta.paramKind === 'angle') {
      fields.push({
        label: axisLabel(label),
        valueIndex: i,
        kind: 'angle',
        value: arg.number,
        unit: arg.unit || 'deg',
        units: FILTER_ANGLE_UNITS,
      })
    } else {
      fields.push({
        label: axisLabel(label),
        valueIndex: i,
        kind: 'amount',
        value: arg.number,
        unit: arg.unit,
        units: FILTER_AMOUNT_UNITS,
      })
    }
  }

  return fields
})

const dropShadowColorContext = computed((): AttributeContext | null => {
  const fn = selectedFunction.value
  if (!fn || fn.type !== 'drop-shadow') return null
  return {
    ...props.attribute,
    attrName: 'flood-color',
    value: fn.color ?? '#000000',
    valueStart: 0,
    valueEnd: 0,
  }
})

function rangeForField(field: ParamField) {
  if (field.kind === 'angle') return { ...FILTER_ANGLE_RANGE }
  if (field.kind === 'offset') return { ...FILTER_OFFSET_RANGE }
  if (field.kind === 'length') return { ...FILTER_LENGTH_RANGE }
  if (field.unit === '%') return { ...FILTER_AMOUNT_PERCENT_RANGE }
  return { ...FILTER_AMOUNT_RANGE }
}

const addableFunctions = computed(() =>
  availableAddFunctions(parsedFunctions.value ?? []).filter(
    // Nothing to point at, so offering a reference would only produce `url()`.
    (type) => !isFilterReference(type) || referenceSeed.value,
  ),
)

watch(
  () => props.attribute.value,
  (value) => {
    if (!isEditingText.value) textDraft.value = value
  },
)

watch(
  () => attributeIdentity(props.attribute),
  (identity, previous) => {
    if (previous !== undefined && identity === previous) return
    isEditingText.value = false
    textDraft.value = props.attribute.value
    selectedIndex.value = null
    showAddMenu.value = false
  },
  { immediate: true },
)

watch(
  parsedFunctions,
  (functions) => {
    if (!functions) {
      selectedIndex.value = null
      return
    }
    if (selectedIndex.value != null && selectedIndex.value >= functions.length) {
      selectedIndex.value = functions.length > 0 ? functions.length - 1 : null
    }
  },
  { immediate: true },
)

function commit(value: string) {
  textDraft.value = value
  caret.value = value.length
  emit('update', value)
}

function commitFunctions(functions: FilterFunction[]) {
  commit(formatFilterList(functions))
}

function selectFunction(index: number | null) {
  selectedIndex.value = index
}

function onTextInput(value: string) {
  isEditingText.value = true
  textDraft.value = value
}

function onTextCommit() {
  const value = textDraft.value
  isEditingText.value = false
  if (value === props.attribute.value) return
  if (value.trim() === '') {
    commit('')
    return
  }
  const parsed = parseFilterList(value)
  commit(parsed ? formatFilterList(parsed) : value)
}

function onTextDiscard() {
  isEditingText.value = false
  textDraft.value = props.attribute.value
  caret.value = props.attribute.value.length
}

function applyIdSuggestion(suggestion: { value: string; caret: number }) {
  isEditingText.value = true
  textDraft.value = suggestion.value
  caret.value = suggestion.caret
  emit('update', suggestion.value)
  textInput.value?.setCaret(suggestion.caret)
}

function updateFieldValue(valueIndex: number, value: number, unit: string) {
  const functions = parsedFunctions.value
  if (!functions || selectedIndex.value == null) return
  const next = updateFunctionValueAt(functions, selectedIndex.value, valueIndex, {
    number: value,
    unit,
  })
  commitFunctions(next)
}

function onDropShadowColorUpdate(color: string) {
  const functions = parsedFunctions.value
  if (!functions || selectedIndex.value == null) return
  commitFunctions(updateFunctionColor(functions, selectedIndex.value, color))
}

/** Bare ids are written as fragments; anything already pointing somewhere is left alone. */
function normalizeReference(reference: string): string {
  const trimmed = reference.trim()
  return trimmed.includes('#') ? trimmed : `#${trimmed}`
}

function commitReference(reference: string) {
  const functions = parsedFunctions.value
  if (!functions || selectedIndex.value == null) return
  if (!reference.trim()) {
    // An empty reference would serialise to `url()`, so keep the current target.
    referenceDraft.value = selectedReference.value ?? ''
    return
  }
  const normalized = normalizeReference(reference)
  referenceDraft.value = normalized
  commitFunctions(updateFunctionReference(functions, selectedIndex.value, normalized))
}

function onAdd(type: FilterFunctionType) {
  const functions = parsedFunctions.value ?? []
  const { functions: next, selectedIndex: nextIndex } = addFunction(
    functions,
    type,
    isFilterReference(type) ? `#${referenceSeed.value}` : undefined,
  )
  commitFunctions(next)
  selectFunction(nextIndex >= 0 ? nextIndex : null)
  showAddMenu.value = false
}

function removeSelected() {
  const functions = parsedFunctions.value
  if (!functions || selectedIndex.value == null) return
  const index = selectedIndex.value
  const next = removeFunction(functions, index)
  commitFunctions(next)
  const newIndex = Math.min(index, next.length - 1)
  selectFunction(newIndex >= 0 ? newIndex : null)
}

function moveSelected(delta: -1 | 1) {
  const functions = parsedFunctions.value
  if (!functions || selectedIndex.value == null) return
  const from = selectedIndex.value
  const to = from + delta
  if (to < 0 || to >= functions.length) return
  commitFunctions(moveFunction(functions, from, to))
  selectFunction(to)
}
</script>

<template>
  <div class="filter-adjuster">
    <ValueSuggestInput
      ref="textInput"
      :model-value="textDraft"
      :suggestions="idSuggestions"
      aria-label="filter attribute value"
      @update:model-value="onTextInput"
      @update:caret="caret = $event"
      @commit="onTextCommit"
      @discard="onTextDiscard"
      @select="applyIdSuggestion"
    >
      <template #option="{ suggestion }">
        <IdReferenceOption :id="suggestion.id" :tag="suggestion.tag" />
      </template>
    </ValueSuggestInput>

    <p v-if="parseError" class="filter-adjuster__warn">
      Could not parse filter — check function names and values.
    </p>

    <template v-else-if="parsedFunctions && parsedFunctions.length > 0">
      <div class="filter-adjuster__functions" role="listbox" aria-label="Filter functions">
        <button
          v-for="(fn, index) in parsedFunctions"
          :key="index"
          type="button"
          role="option"
          class="filter-adjuster__fn"
          :class="{ 'filter-adjuster__fn--selected': selectedIndex === index }"
          :aria-selected="selectedIndex === index"
          @click="selectFunction(index)"
        >
          <span class="filter-adjuster__fn-left">
            <span class="filter-adjuster__fn-name">{{ fn.type }}</span>
            <span class="filter-adjuster__fn-hint">{{ FILTER_FUNCTION_META[fn.type].hint }}</span>
          </span>
          <span class="filter-adjuster__fn-summary">{{ formatFunctionSummary(fn) }}</span>
        </button>
      </div>

      <div class="filter-adjuster__ops">
        <div class="filter-adjuster__add-wrap">
          <button
            type="button"
            class="filter-adjuster__op-btn"
            title="Add function"
            :disabled="addableFunctions.length === 0"
            @click="showAddMenu = !showAddMenu"
          >
            +
          </button>
          <div v-if="showAddMenu" class="filter-adjuster__add-menu">
            <button
              v-for="type in addableFunctions"
              :key="type"
              type="button"
              class="filter-adjuster__add-option"
              @click="onAdd(type)"
            >
              <span class="filter-adjuster__add-name">{{ type }}</span>
              <span class="filter-adjuster__add-hint">{{ FILTER_FUNCTION_META[type].hint }}</span>
            </button>
          </div>
        </div>
        <button
          type="button"
          class="filter-adjuster__op-btn"
          title="Remove selected function"
          :disabled="selectedIndex == null"
          @click="removeSelected"
        >
          −
        </button>
        <button
          type="button"
          class="filter-adjuster__op-btn"
          title="Move function earlier"
          :disabled="selectedIndex == null || selectedIndex <= 0"
          @click="moveSelected(-1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="filter-adjuster__op-btn"
          title="Move function later"
          :disabled="
            selectedIndex == null || !parsedFunctions || selectedIndex >= parsedFunctions.length - 1
          "
          @click="moveSelected(1)"
        >
          ↓
        </button>
      </div>

      <template v-if="selectedFunction && !isFilterSolo(selectedFunction.type)">
        <AxisControl
          v-for="field in paramFields"
          :key="`${selectedIndex}-${field.valueIndex}-${field.unit}`"
          :label="field.label"
          :value="field.value"
          :unit="field.unit"
          :units="field.units"
          :default-min="rangeForField(field).min"
          :default-max="rangeForField(field).max"
          :default-step="rangeForField(field).step"
          @update="(value, unit) => updateFieldValue(field.valueIndex, value, unit)"
        />

        <label v-if="selectedReference != null" class="filter-adjuster__reference">
          <span class="filter-adjuster__reference-label">Reference</span>
          <ValueSuggestInput
            :model-value="referenceDraft"
            :suggestions="referenceSuggestions"
            aria-label="Filter reference"
            @update:model-value="referenceDraft = $event"
            @commit="commitReference(referenceDraft)"
            @discard="referenceDraft = selectedReference ?? ''"
            @select="commitReference(`#${$event.id}`)"
          >
            <template #option="{ suggestion }">
              <IdReferenceOption :id="suggestion.id" :tag="suggestion.tag" />
            </template>
          </ValueSuggestInput>
        </label>

        <ColorAttributeAdjuster
          v-if="dropShadowColorContext"
          :attribute="dropShadowColorContext"
          :document-ids="documentIds"
          @update="onDropShadowColorUpdate"
        />
      </template>
    </template>

    <template v-else-if="!parseError">
      <div class="filter-adjuster__ops">
        <div class="filter-adjuster__add-wrap">
          <button
            type="button"
            class="filter-adjuster__op-btn"
            title="Add function"
            @click="showAddMenu = !showAddMenu"
          >
            +
          </button>
          <div v-if="showAddMenu" class="filter-adjuster__add-menu">
            <button
              v-for="type in addableFunctions"
              :key="type"
              type="button"
              class="filter-adjuster__add-option"
              @click="onAdd(type)"
            >
              <span class="filter-adjuster__add-name">{{ type }}</span>
              <span class="filter-adjuster__add-hint">{{ FILTER_FUNCTION_META[type].hint }}</span>
            </button>
          </div>
        </div>
      </div>
      <p class="filter-adjuster__empty-hint">
        Filter is empty — use + to add a function or keyword.
      </p>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.filter-adjuster {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__reference {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__reference-label {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $color-text-muted;
  }

  &__warn,
  &__empty-hint {
    margin: 0;
    font-size: 0.75rem;
    color: $color-text-muted;
  }

  &__warn {
    color: var(--red);
  }

  &__functions {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
  }

  &__fn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-sm;
    width: 100%;
    padding: 0.35rem 0.5rem;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: $color-bg;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.12s,
      background 0.12s;

    &:hover {
      border-color: $color-accent;
    }

    &--selected {
      border-color: $color-accent;
      background: color-mix(in srgb, $color-accent 10%, $color-bg);
    }
  }

  &__fn-left {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.05rem;
    min-width: 0;
  }

  &__fn-name {
    font-family: $font-mono;
    font-size: 0.8125rem;
    font-weight: 700;
    color: $color-accent;
    line-height: 1.2;
  }

  &__fn-hint {
    font-size: 0.625rem;
    color: $color-text-muted;
    line-height: 1.2;
  }

  &__fn-summary {
    flex-shrink: 0;
    font-family: $font-mono;
    font-size: 0.6875rem;
    color: $color-text;
    text-align: right;
    max-width: 55%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__ops {
    display: flex;
    gap: $spacing-xs;
    align-items: flex-start;
  }

  &__add-wrap {
    position: relative;
  }

  &__add-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    max-height: 240px;
    overflow-y: auto;
    min-width: 200px;
    padding: $spacing-xs;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: var(--bg-raised);
    box-shadow: 0 4px 12px color-mix(in srgb, $color-text 12%, transparent);
  }

  &__add-option {
    display: flex;
    align-items: baseline;
    gap: $spacing-xs;
    padding: 0.25rem 0.35rem;
    border: none;
    border-radius: $radius-sm;
    background: none;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: color-mix(in srgb, $color-accent 10%, transparent);
    }
  }

  &__add-name {
    font-family: $font-mono;
    font-weight: 700;
    font-size: 0.75rem;
    color: $color-accent;
    min-width: 6.5rem;
  }

  &__add-hint {
    font-size: 0.6875rem;
    color: $color-text-muted;
  }

  &__op-btn {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: $color-bg;
    color: $color-text;
    font-size: 0.875rem;
    line-height: 1;
    cursor: pointer;
    transition:
      border-color 0.12s,
      color 0.12s;

    &:hover:not(:disabled) {
      border-color: $color-accent;
      color: $color-accent;
    }

    &:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
  }
}
</style>
