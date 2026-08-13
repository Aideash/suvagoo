<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AxisControl from './AxisControl.vue'

export type NumericGroupField = {
  id: string
  label: string
}

export type NumericGroupRange = {
  min: number
  max: number
  step: number
}

const props = withDefaults(
  defineProps<{
    fields: readonly NumericGroupField[]
    values: readonly number[]
    columns: number
    /** Optional column headers shown above the grid (length should match columns). */
    columnLabels?: readonly string[]
    /** Optional row headers shown beside each row (length = ceil(fields/columns)). */
    rowLabels?: readonly string[]
    defaultRange: NumericGroupRange
    /** When set, locks AxisControl min for the selected field. */
    fixedMinForField?: (fieldId: string) => number | undefined
    /** Format cell display; defaults to String(n). */
    formatValue?: (n: number) => string
  }>(),
  {
    columnLabels: undefined,
    rowLabels: undefined,
    fixedMinForField: undefined,
    formatValue: undefined,
  },
)

const emit = defineEmits<{
  update: [fieldId: string, value: number]
}>()

const selectedId = ref(props.fields[0]?.id ?? '')
const sharedDefaults = ref<NumericGroupRange>({ ...props.defaultRange })

const selectedField = computed(
  () => props.fields.find((field) => field.id === selectedId.value) ?? props.fields[0],
)

const selectedIndex = computed(() => {
  const id = selectedField.value?.id
  if (!id) return 0
  return props.fields.findIndex((field) => field.id === id)
})

const selectedValue = computed(() => {
  const index = selectedIndex.value
  return props.values[index] ?? 0
})

const selectedLabel = computed(() => selectedField.value?.label ?? '')

const selectedFixedMin = computed(() => {
  const id = selectedField.value?.id
  if (!id || !props.fixedMinForField) return undefined
  return props.fixedMinForField(id)
})

const displayValue = computed(() => {
  const format = props.formatValue
  return (n: number) => (format ? format(n) : String(n))
})

const showHeaders = computed(
  () => (props.columnLabels?.length ?? 0) > 0 || (props.rowLabels?.length ?? 0) > 0,
)

watch(
  () => props.fields.map((field) => field.id).join('|'),
  () => {
    if (!props.fields.some((field) => field.id === selectedId.value)) {
      selectedId.value = props.fields[0]?.id ?? ''
    }
  },
)

watch(
  () => [props.defaultRange.min, props.defaultRange.max, props.defaultRange.step] as const,
  ([min, max, step], previous) => {
    if (previous !== undefined) {
      const [pMin, pMax, pStep] = previous
      if (pMin === min && pMax === max && pStep === step) return
    }
    sharedDefaults.value = { min, max, step }
  },
  { immediate: true },
)

function selectField(id: string) {
  selectedId.value = id
}

function commitInput(fieldId: string, event: Event) {
  const input = event.target as HTMLInputElement
  const index = props.fields.findIndex((field) => field.id === fieldId)
  const current = props.values[index] ?? 0
  if (!input.value.trim()) {
    input.value = displayValue.value(current)
    return
  }
  const next = Number(input.value)
  if (!Number.isFinite(next)) {
    input.value = displayValue.value(current)
    return
  }
  emit('update', fieldId, next)
}

function commitSelected(value: number) {
  const id = selectedField.value?.id
  if (!id) return
  emit('update', id, value)
}

function rowIndexForField(index: number): number {
  return Math.floor(index / props.columns)
}
</script>

<template>
  <div class="numeric-group">
    <div
      class="numeric-group__grid"
      :class="{ 'numeric-group__grid--headers': showHeaders }"
      :style="{
        '--numeric-group-cols': columns,
      }"
    >
      <template v-if="showHeaders">
        <span class="numeric-group__corner" aria-hidden="true" />
        <span
          v-for="(col, colIndex) in columnLabels ?? []"
          :key="`col-${colIndex}`"
          class="numeric-group__col-label"
        >
          {{ col }}
        </span>
      </template>

      <template v-for="(field, index) in fields" :key="field.id">
        <span v-if="showHeaders && index % columns === 0" class="numeric-group__row-label">
          {{ rowLabels?.[rowIndexForField(index)] ?? '' }}
        </span>
        <label
          class="numeric-group__cell"
          :class="{ 'numeric-group__cell--selected': selectedId === field.id }"
          @click="selectField(field.id)"
        >
          <span v-if="!showHeaders" class="numeric-group__label">{{ field.label }}</span>
          <input
            :value="displayValue(values[index] ?? 0)"
            type="number"
            class="input numeric-group__input"
            step="any"
            @focus="selectField(field.id)"
            @change="commitInput(field.id, $event)"
            @keydown.enter="commitInput(field.id, $event)"
          />
        </label>
      </template>
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

.numeric-group {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__grid {
    display: grid;
    grid-template-columns: repeat(var(--numeric-group-cols, 2), minmax(0, 1fr));
    gap: $spacing-xs;

    &--headers {
      grid-template-columns: auto repeat(var(--numeric-group-cols, 2), minmax(0, 1fr));
    }
  }

  &__corner {
    min-width: 1.25rem;
  }

  &__col-label,
  &__row-label {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $color-text-muted;
    align-self: center;
  }

  &__col-label {
    text-align: center;
  }

  &__row-label {
    text-align: right;
    padding-right: 2px;
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
    font-size: 0.75rem;
    text-align: center;

    &:focus {
      outline: none;
    }

    /* Hide spinners so the dense matrix stays readable. */
    appearance: textfield;

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      appearance: none;
      margin: 0;
    }
  }
}
</style>
