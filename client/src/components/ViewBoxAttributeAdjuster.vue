<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { viewBoxFieldRange, type ViewBoxField } from '../lib/attributeSchema'
import { attributeIdentity, type AttributeContext } from '../lib/svgDocument'
import {
  DEFAULT_VIEWBOX,
  formatViewBoxValue,
  parseViewBoxValue,
  type ViewBox,
} from '../lib/svgSchema'
import AxisControl from './AxisControl.vue'

const props = defineProps<{
  attribute: AttributeContext
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const minX = ref(DEFAULT_VIEWBOX.minX)
const minY = ref(DEFAULT_VIEWBOX.minY)
const width = ref(DEFAULT_VIEWBOX.width)
const height = ref(DEFAULT_VIEWBOX.height)
const selectedField = ref<ViewBoxField>('minX')

type FieldRange = { min: number; max: number; step: number }

const sharedDefaults = ref<FieldRange>({ min: -100, max: 200, step: 1 })

const fields: ReadonlyArray<{ key: ViewBoxField; label: string }> = [
  { key: 'minX', label: 'min-x' },
  { key: 'minY', label: 'min-y' },
  { key: 'width', label: 'width' },
  { key: 'height', label: 'height' },
]

const selectedLabel = computed(
  () => fields.find((field) => field.key === selectedField.value)?.label ?? '',
)
const selectedValue = computed(() => currentViewBox()[selectedField.value])
const selectedFixedMin = computed(() =>
  selectedField.value === 'width' || selectedField.value === 'height' ? 0 : undefined,
)

const parseError = computed(() => {
  const trimmed = props.attribute.value.trim()
  if (!trimmed) return false
  return parseViewBoxValue(props.attribute.value) === null
})

function currentViewBox(): ViewBox {
  return {
    minX: minX.value,
    minY: minY.value,
    width: width.value,
    height: height.value,
  }
}

function syncSharedDefaults(vb: ViewBox) {
  const ranges = fields.map((field) => viewBoxFieldRange(field.key, vb))
  sharedDefaults.value = {
    min: Math.min(...ranges.map((range) => range.min)),
    max: Math.max(...ranges.map((range) => range.max)),
    step: Math.min(...ranges.map((range) => range.step)),
  }
}

function syncFromValue(value: string) {
  const parsed = parseViewBoxValue(value)
  if (!parsed) return
  minX.value = parsed.minX
  minY.value = parsed.minY
  width.value = parsed.width
  height.value = parsed.height
}

watch(
  () => props.attribute.value,
  (value) => syncFromValue(value),
)

watch(
  () => attributeIdentity(props.attribute),
  (identity, previous) => {
    if (previous !== undefined && identity === previous) return
    syncFromValue(props.attribute.value)
    const parsed = parseViewBoxValue(props.attribute.value) ?? DEFAULT_VIEWBOX
    syncSharedDefaults(parsed)
    selectedField.value = 'minX'
  },
  { immediate: true },
)

function commitState() {
  emit('update', formatViewBoxValue(currentViewBox()))
}

function setField(field: ViewBoxField, value: number) {
  const next = field === 'width' || field === 'height' ? Math.max(0, value) : value
  switch (field) {
    case 'minX':
      minX.value = next
      break
    case 'minY':
      minY.value = next
      break
    case 'width':
      width.value = next
      break
    case 'height':
      height.value = next
      break
  }
  commitState()
}

function commitInput(field: ViewBoxField, event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.value.trim()) {
    input.value = String(currentViewBox()[field])
    return
  }
  const next = Number(input.value)
  if (!Number.isFinite(next)) {
    input.value = String(currentViewBox()[field])
    return
  }
  setField(field, next)
}

function commitSelected(value: number) {
  setField(selectedField.value, value)
}
</script>

<template>
  <div class="viewbox-adjuster">
    <p v-if="parseError" class="viewbox-adjuster__error">
      Could not parse value — sliders may not reflect the raw string.
    </p>

    <div class="viewbox-adjuster__grid">
      <label
        v-for="field in fields"
        :key="field.key"
        class="viewbox-adjuster__cell"
        :class="{ 'viewbox-adjuster__cell--selected': selectedField === field.key }"
        @click="selectedField = field.key"
      >
        <span class="viewbox-adjuster__label">{{ field.label }}</span>
        <input
          :value="currentViewBox()[field.key]"
          type="number"
          class="input viewbox-adjuster__input"
          :min="field.key === 'width' || field.key === 'height' ? 0 : undefined"
          step="any"
          @focus="selectedField = field.key"
          @change="commitInput(field.key, $event)"
          @keydown.enter="commitInput(field.key, $event)"
        />
      </label>
    </div>

    <AxisControl
      :label="selectedLabel"
      :value="selectedValue"
      :default-min="sharedDefaults.min"
      :default-max="sharedDefaults.max"
      :default-step="sharedDefaults.step"
      :fixed-min="selectedFixedMin"
      @update="commitSelected"
    />
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.viewbox-adjuster {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__error {
    margin: 0;
    font-size: 0.75rem;
    color: $color-text-muted;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: $spacing-xs;
  }

  &__cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding: $spacing-xs;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: $color-bg;
    cursor: text;
    transition:
      border-color 0.12s,
      box-shadow 0.12s;

    &:focus-within,
    &--selected {
      border-color: $color-accent;
    }

    &:focus-within {
      box-shadow: 0 0 0 1px $color-accent;
    }
  }

  &__label {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $color-text-muted;
  }

  &__input {
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: $color-text;
    font-family: $font-mono;
    font-size: 0.8125rem;

    &:focus {
      outline: none;
    }
  }
}
</style>
