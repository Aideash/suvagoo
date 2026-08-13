<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  COLOR_MATRIX_COL_LABELS,
  COLOR_MATRIX_COLS,
  COLOR_MATRIX_LENGTH,
  COLOR_MATRIX_ROW_LABELS,
  HUE_ROTATE_RANGE,
  MATRIX_COEFF_RANGE,
  SATURATE_RANGE,
  colorMatrixFields,
  defaultColorMatrixValues,
  formatColorMatrixNumbers,
  normalizeColorMatrixType,
  parseColorMatrixValues,
  snapMatrixCoeff,
  type ColorMatrixType,
} from '../lib/colorMatrixAttribute'
import { formatNumericValue } from '../lib/attributeSchema'
import { attributeIdentity, findElementByPath, type AttributeContext } from '../lib/svgDocument'
import AxisControl from './AxisControl.vue'
import NumericGroupControl from './NumericGroupControl.vue'

const props = defineProps<{
  attribute: AttributeContext
  content: string
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const MATRIX_FIELDS = colorMatrixFields()
const identityKey = computed(() => attributeIdentity(props.attribute))

const matrixValues = ref<number[]>([...defaultColorMatrixValues('matrix')])
const scalarValue = ref(1)
type Range = { min: number; max: number; step: number }
const matrixRange = ref<Range>({
  min: MATRIX_COEFF_RANGE.min,
  max: MATRIX_COEFF_RANGE.max,
  step: MATRIX_COEFF_RANGE.step,
})
const scalarRange = ref<Range>({
  min: SATURATE_RANGE.min,
  max: SATURATE_RANGE.max,
  step: SATURATE_RANGE.step,
})

const matrixType = computed<ColorMatrixType>(() => {
  const element = findElementByPath(props.content, props.attribute.path)
  return normalizeColorMatrixType(element?.existingAttributes.type)
})

const parseError = computed(() => {
  const trimmed = props.attribute.value.trim()
  if (matrixType.value === 'luminanceToAlpha') return false
  if (!trimmed) return false
  return parseColorMatrixValues(props.attribute.value, matrixType.value) === null
})

function formatCell(n: number): string {
  return formatNumericValue(snapMatrixCoeff(n, MATRIX_COEFF_RANGE.step), '')
}

function syncFromValue(value: string, type: ColorMatrixType) {
  const parsed = parseColorMatrixValues(value, type)
  if (type === 'matrix') {
    matrixValues.value = parsed ? [...parsed] : [...defaultColorMatrixValues('matrix')]
    return
  }
  if (type === 'saturate' || type === 'hueRotate') {
    scalarValue.value = parsed?.[0] ?? defaultColorMatrixValues(type)[0] ?? 0
  }
}

function syncRanges(type: ColorMatrixType) {
  if (type === 'matrix') {
    matrixRange.value = {
      min: MATRIX_COEFF_RANGE.min,
      max: MATRIX_COEFF_RANGE.max,
      step: MATRIX_COEFF_RANGE.step,
    }
  } else if (type === 'saturate') {
    scalarRange.value = {
      min: SATURATE_RANGE.min,
      max: SATURATE_RANGE.max,
      step: SATURATE_RANGE.step,
    }
  } else if (type === 'hueRotate') {
    scalarRange.value = {
      min: HUE_ROTATE_RANGE.min,
      max: HUE_ROTATE_RANGE.max,
      step: HUE_ROTATE_RANGE.step,
    }
  }
}

watch(
  () => [props.attribute.value, matrixType.value] as const,
  ([value, type]) => syncFromValue(value, type),
)

watch(
  () => attributeIdentity(props.attribute),
  (identity, previous) => {
    if (previous !== undefined && identity === previous) return
    syncFromValue(props.attribute.value, matrixType.value)
    syncRanges(matrixType.value)
  },
  { immediate: true },
)

watch(matrixType, (type) => {
  syncRanges(type)
  syncFromValue(props.attribute.value, type)
})

function commitMatrix(next: number[]) {
  matrixValues.value = next
  emit('update', formatColorMatrixNumbers(next))
}

function onMatrixFieldUpdate(fieldId: string, value: number) {
  const field = MATRIX_FIELDS.find((entry) => entry.id === fieldId)
  if (!field) return
  const next = [...matrixValues.value]
  while (next.length < COLOR_MATRIX_LENGTH) next.push(0)
  next[field.index] = snapMatrixCoeff(value, MATRIX_COEFF_RANGE.step)
  commitMatrix(next.slice(0, COLOR_MATRIX_LENGTH))
}

function onScalarUpdate(value: number) {
  const step = matrixType.value === 'hueRotate' ? HUE_ROTATE_RANGE.step : SATURATE_RANGE.step
  const snapped = snapMatrixCoeff(value, step)
  scalarValue.value = snapped
  emit('update', formatNumericValue(snapped, ''))
}
</script>

<template>
  <div class="color-matrix-adjuster">
    <p class="color-matrix-adjuster__type">
      type
      <code>{{ matrixType }}</code>
    </p>

    <p v-if="parseError" class="color-matrix-adjuster__error">
      Could not parse value — controls may not reflect the raw string.
    </p>

    <NumericGroupControl
      v-if="matrixType === 'matrix'"
      :key="identityKey"
      :fields="MATRIX_FIELDS"
      :values="matrixValues"
      :columns="COLOR_MATRIX_COLS"
      :column-labels="COLOR_MATRIX_COL_LABELS"
      :row-labels="COLOR_MATRIX_ROW_LABELS"
      :default-range="matrixRange"
      :format-value="formatCell"
      @update="onMatrixFieldUpdate"
    />

    <AxisControl
      v-else-if="matrixType === 'saturate'"
      :key="`${identityKey}:saturate`"
      label="Amount"
      :value="scalarValue"
      :default-min="scalarRange.min"
      :default-max="scalarRange.max"
      :default-step="scalarRange.step"
      :fixed-min="0"
      @update="onScalarUpdate"
    />

    <AxisControl
      v-else-if="matrixType === 'hueRotate'"
      :key="`${identityKey}:hue`"
      label="Degrees"
      :value="scalarValue"
      :default-min="scalarRange.min"
      :default-max="scalarRange.max"
      :default-step="scalarRange.step"
      @update="onScalarUpdate"
    />

    <p v-else class="color-matrix-adjuster__note">
      luminanceToAlpha ignores <code>values</code> — no coefficients to edit.
    </p>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.color-matrix-adjuster {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__type {
    margin: 0;
    font-size: 0.75rem;
    color: $color-text-muted;

    code {
      font-family: $font-mono;
      color: $color-accent;
    }
  }

  &__error,
  &__note {
    margin: 0;
    font-size: 0.75rem;
    color: $color-text-muted;

    code {
      font-family: $font-mono;
    }
  }
}
</style>
