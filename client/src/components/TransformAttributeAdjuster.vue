<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { formatNumericValue, numericRangeForAttribute } from '../lib/attributeSchema'
import { viewBoxForAttribute } from '../lib/svgViewport'
import { attributeIdentity, type AttributeContext } from '../lib/svgDocument'
import { handleListboxKeydown, optionTabIndex } from '../composables/listboxNavigation'
import { useFlyoutMenu } from '../composables/useFlyoutMenu'
import {
  ANGLE_TRANSFORM_RANGE,
  MATRIX_FIELDS,
  MATRIX_TRANSFORM_RANGE,
  SCALE_TRANSFORM_RANGE,
  TRANSFORM_FUNCTION_META,
  addFunction,
  availableAddFunctions,
  ensureEditableValues,
  formatFunctionSummary,
  formatTransformList,
  moveFunction,
  parseTransformList,
  removeFunction,
  updateFunctionValueAt,
  type TransformFunction,
  type TransformFunctionType,
} from '../lib/transformAttribute'
import AxisControl from './AxisControl.vue'
import NumericGroupControl from './NumericGroupControl.vue'

const props = defineProps<{
  attribute: AttributeContext
  content: string
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const textDraft = ref(props.attribute.value)
const isEditingText = ref(false)
const selectedIndex = ref<number | null>(null)
const trigger = ref<HTMLButtonElement>()
const panel = ref<HTMLElement>()
const {
  open: addMenuOpen,
  menuId: addMenuId,
  toggle: toggleAddMenu,
  close: closeAddMenu,
} = useFlyoutMenu(trigger, panel)

const viewBox = computed(() =>
  viewBoxForAttribute(props.content, props.attribute.path, props.attribute.attrName),
)

const parsedFunctions = computed(() => {
  if (isEditingText.value) return parseTransformList(props.attribute.value)
  return parseTransformList(textDraft.value) ?? parseTransformList(props.attribute.value)
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

type ParamField = {
  label: string
  valueIndex: number
  kind: 'translate' | 'scale' | 'angle'
  value: number
}

function axisLabel(param: string): string {
  const labels: Record<string, string> = {
    tx: 'Translate X',
    ty: 'Translate Y',
    tz: 'Translate Z',
    sx: 'Scale X',
    sy: 'Scale Y',
    sz: 'Scale Z',
    angle: 'Angle',
    cx: 'Center X',
    cy: 'Center Y',
    ax: 'Skew X',
    ay: 'Skew Y',
    a: 'a',
    b: 'b',
    c: 'c',
    d: 'd',
    e: 'e',
    f: 'f',
  }
  return labels[param] ?? param
}

const paramFields = computed((): ParamField[] => {
  const fn = selectedFunction.value
  if (!fn || fn.type === 'none' || fn.type === 'matrix') return []

  const values = ensureEditableValues(fn)
  const labels = TRANSFORM_FUNCTION_META[fn.type].paramLabels
  const fields: ParamField[] = []

  const count =
    fn.type === 'translate'
      ? Math.max(2, values.length)
      : fn.type === 'scale'
        ? Math.max(2, values.length === 1 ? 1 : values.length)
        : fn.type === 'rotate'
          ? values.length
          : fn.type === 'skew'
            ? 2
            : values.length

  for (let i = 0; i < count && i < labels.length; i++) {
    const label = labels[i]
    let kind: ParamField['kind']
    if (label === 'angle' || label === 'ax' || label === 'ay') kind = 'angle'
    else if (label.startsWith('s')) kind = 'scale'
    else if (label === 'cx' || label === 'cy' || label.startsWith('t')) kind = 'translate'
    else kind = 'translate'

    // For uniform scale(sx) show only one field
    if (fn.type === 'scale' && values.length === 1 && i > 0) break

    fields.push({
      label: axisLabel(label),
      valueIndex: i,
      kind,
      value: values[i] ?? (kind === 'scale' ? 1 : 0),
    })
  }

  return fields
})

const matrixValues = computed(() => {
  const fn = selectedFunction.value
  if (!fn || fn.type !== 'matrix') return [1, 0, 0, 1, 0, 0]
  return ensureEditableValues(fn)
})

function rangeForField(field: ParamField) {
  if (field.kind === 'angle') {
    return { ...ANGLE_TRANSFORM_RANGE }
  }
  if (field.kind === 'scale') {
    return { ...SCALE_TRANSFORM_RANGE }
  }
  if (field.valueIndex === 1 || field.label.includes('Y') || field.label.includes('y')) {
    return numericRangeForAttribute('y', viewBox.value, String(field.value))
  }
  return numericRangeForAttribute('x', viewBox.value, String(field.value))
}

const addableFunctions = computed(() => availableAddFunctions(parsedFunctions.value ?? []))

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
    closeAddMenu()
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
  emit('update', value)
}

function commitFunctions(functions: TransformFunction[]) {
  commit(formatTransformList(functions))
}

function selectFunction(index: number | null) {
  selectedIndex.value = index
}

function onTextInput(event: Event) {
  isEditingText.value = true
  textDraft.value = (event.target as HTMLInputElement).value
}

function commitText(input: HTMLInputElement) {
  isEditingText.value = false
  const value = input.value
  if (value === props.attribute.value) {
    revertText(input)
    return
  }
  if (value.trim() === '') {
    commit('')
    return
  }
  const parsed = parseTransformList(value)
  commit(parsed ? formatTransformList(parsed) : value)
}

function revertText(input: HTMLInputElement) {
  isEditingText.value = false
  textDraft.value = props.attribute.value
  input.value = props.attribute.value
}

function onTextEnter(event: KeyboardEvent) {
  commitText(event.target as HTMLInputElement)
}

function onTextBlur(event: FocusEvent) {
  commitText(event.target as HTMLInputElement)
}

function onTextEscape(event: KeyboardEvent) {
  // Keeps the keystroke away from the global shortcut that resets the selection.
  event.stopPropagation()
  revertText(event.target as HTMLInputElement)
}

function updateFieldValue(valueIndex: number, value: number) {
  const functions = parsedFunctions.value
  if (!functions || selectedIndex.value == null) return
  const next = updateFunctionValueAt(functions, selectedIndex.value, valueIndex, value)
  commitFunctions(next)
}

function updateMatrixValue(fieldId: string, value: number) {
  const index = MATRIX_FIELDS.findIndex((f) => f.id === fieldId)
  if (index < 0) return
  updateFieldValue(index, value)
}

function onAdd(type: TransformFunctionType) {
  const functions = parsedFunctions.value ?? []
  const { functions: next, selectedIndex: nextIndex } = addFunction(functions, type)
  commitFunctions(next)
  selectFunction(nextIndex >= 0 ? nextIndex : null)
  closeAddMenu()
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

function formatMatrixCell(n: number): string {
  return formatNumericValue(n, '')
}
</script>

<template>
  <div class="transform-adjuster">
    <input
      :value="textDraft"
      type="text"
      class="input transform-adjuster__text"
      spellcheck="false"
      aria-label="transform attribute value"
      @input="onTextInput"
      @keydown.enter="onTextEnter"
      @keydown.escape="onTextEscape"
      @blur="onTextBlur"
    />

    <p v-if="parseError" class="transform-adjuster__warn">
      Could not parse transform — check function names and numbers.
    </p>

    <template v-else-if="parsedFunctions && parsedFunctions.length > 0">
      <div
        class="transform-adjuster__functions"
        role="listbox"
        aria-label="Transform functions"
        @keydown="
          handleListboxKeydown($event, parsedFunctions.length, selectedIndex, selectFunction)
        "
      >
        <button
          v-for="(fn, index) in parsedFunctions"
          :key="index"
          type="button"
          role="option"
          class="transform-adjuster__fn"
          :class="{ 'transform-adjuster__fn--selected': selectedIndex === index }"
          :tabindex="optionTabIndex(index, selectedIndex)"
          :aria-selected="selectedIndex === index"
          @click="selectFunction(index)"
        >
          <span class="transform-adjuster__fn-left">
            <span class="transform-adjuster__fn-name">{{ fn.type }}</span>
            <span class="transform-adjuster__fn-hint">{{
              TRANSFORM_FUNCTION_META[fn.type].hint
            }}</span>
          </span>
          <span class="transform-adjuster__fn-summary">{{ formatFunctionSummary(fn) }}</span>
        </button>
      </div>

      <div class="transform-adjuster__ops">
        <div class="transform-adjuster__add-wrap">
          <button
            ref="trigger"
            type="button"
            class="transform-adjuster__op-btn"
            title="Add function"
            aria-label="Add function"
            aria-haspopup="menu"
            :disabled="addableFunctions.length === 0"
            :aria-expanded="addMenuOpen"
            :aria-controls="addMenuOpen ? addMenuId : undefined"
            @click="toggleAddMenu"
          >
            +
          </button>
          <div
            v-if="addMenuOpen"
            :id="addMenuId"
            ref="panel"
            class="transform-adjuster__add-menu"
            role="menu"
            aria-label="Add transform function"
          >
            <button
              v-for="type in addableFunctions"
              :key="type"
              type="button"
              role="menuitem"
              class="transform-adjuster__add-option"
              @click="onAdd(type)"
            >
              <span class="transform-adjuster__add-name">{{ type }}</span>
              <span class="transform-adjuster__add-hint">{{
                TRANSFORM_FUNCTION_META[type].hint
              }}</span>
            </button>
          </div>
        </div>
        <button
          type="button"
          class="transform-adjuster__op-btn"
          title="Remove selected function"
          aria-label="Remove selected function"
          :disabled="selectedIndex == null"
          @click="removeSelected"
        >
          −
        </button>
        <button
          type="button"
          class="transform-adjuster__op-btn"
          title="Move function earlier"
          aria-label="Move function earlier"
          :disabled="selectedIndex == null || selectedIndex <= 0"
          @click="moveSelected(-1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="transform-adjuster__op-btn"
          title="Move function later"
          aria-label="Move function later"
          :disabled="
            selectedIndex == null || !parsedFunctions || selectedIndex >= parsedFunctions.length - 1
          "
          @click="moveSelected(1)"
        >
          ↓
        </button>
      </div>

      <template v-if="selectedFunction && selectedFunction.type === 'matrix'">
        <NumericGroupControl
          :fields="MATRIX_FIELDS"
          :values="matrixValues"
          :columns="3"
          :default-range="MATRIX_TRANSFORM_RANGE"
          :format-value="formatMatrixCell"
          @update="updateMatrixValue"
        />
      </template>

      <template v-else-if="selectedFunction && selectedFunction.type !== 'none'">
        <AxisControl
          v-for="field in paramFields"
          :key="field.valueIndex"
          :label="field.label"
          :value="field.value"
          :default-min="rangeForField(field).min"
          :default-max="rangeForField(field).max"
          :default-step="rangeForField(field).step"
          @update="updateFieldValue(field.valueIndex, $event)"
        />
      </template>
    </template>

    <template v-else-if="!parseError">
      <div class="transform-adjuster__ops">
        <div class="transform-adjuster__add-wrap">
          <button
            ref="trigger"
            type="button"
            class="transform-adjuster__op-btn"
            title="Add function"
            aria-label="Add function"
            aria-haspopup="menu"
            :aria-expanded="addMenuOpen"
            :aria-controls="addMenuOpen ? addMenuId : undefined"
            @click="toggleAddMenu"
          >
            +
          </button>
          <div
            v-if="addMenuOpen"
            :id="addMenuId"
            ref="panel"
            class="transform-adjuster__add-menu"
            role="menu"
            aria-label="Add transform function"
          >
            <button
              v-for="type in addableFunctions"
              :key="type"
              type="button"
              role="menuitem"
              class="transform-adjuster__add-option"
              @click="onAdd(type)"
            >
              <span class="transform-adjuster__add-name">{{ type }}</span>
              <span class="transform-adjuster__add-hint">{{
                TRANSFORM_FUNCTION_META[type].hint
              }}</span>
            </button>
          </div>
        </div>
      </div>
      <p class="transform-adjuster__empty-hint">
        Transform is empty — use + to add a function (or none).
      </p>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.transform-adjuster {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__text {
    width: 100%;
    font-family: $font-mono;
    font-size: 0.8125rem;
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
    min-width: 180px;
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

    &:hover,
    &:focus-visible {
      background: color-mix(in srgb, $color-accent 10%, transparent);
    }
  }

  &__add-name {
    font-family: $font-mono;
    font-weight: 700;
    font-size: 0.75rem;
    color: $color-accent;
    min-width: 5.5rem;
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
