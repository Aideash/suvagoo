<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { dualNumericRangeForAttribute, getAttributeSchema } from '../lib/attributeSchema'
import { viewBoxForAttribute } from '../lib/svgViewport'
import { formatDualNumeric, parseDualNumeric, type DualNumeric } from '../lib/dualNumericAttribute'
import {
  DUAL_NUMERIC_LENSES,
  ECCENTRICITY_RANGE,
  dualToShape,
  shapeToDual,
  type DualLensId,
  type StretchAxis,
} from '../lib/dualNumericLenses'
import { attributeIdentity, type AttributeContext } from '../lib/svgDocument'
import AxisControl from './AxisControl.vue'

const props = defineProps<{
  attribute: AttributeContext
  content: string
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const activeLens = ref<DualLensId>('axes')
const separateValues = ref(false)
const primary = ref(0)
const secondary = ref(0)
const magnitude = ref(0)
const eccentricity = ref(0)
const stretchAxis = ref<StretchAxis>('x')

type FieldRange = { min: number; max: number; step: number }
const sharedDefaults = ref<FieldRange>({ min: 0, max: 50, step: 0.5 })

const viewBox = computed(() =>
  viewBoxForAttribute(props.content, props.attribute.path, props.attribute.attrName),
)
const schema = computed(() => getAttributeSchema(props.attribute.attrName))
const labels = computed(() => schema.value.dualNumber ?? { primary: 'X', secondary: 'Y' })

const parseError = computed(() => {
  const trimmed = props.attribute.value.trim()
  if (!trimmed) return false
  return parseDualNumeric(props.attribute.value) === null
})

function currentDual(): DualNumeric {
  return separateValues.value
    ? { primary: primary.value, secondary: secondary.value }
    : { primary: primary.value, secondary: null }
}

function syncShapeFromDual(dual: DualNumeric) {
  const shape = dualToShape(dual, stretchAxis.value)
  magnitude.value = shape.magnitude
  eccentricity.value = shape.eccentricity
  if (shape.eccentricity > 0) {
    stretchAxis.value = shape.axis
  }
}

function syncFromValue(value: string) {
  const parsed = parseDualNumeric(value)
  if (!parsed) return
  primary.value = Math.max(0, parsed.primary)
  secondary.value = Math.max(0, parsed.secondary ?? parsed.primary)
  separateValues.value = parsed.secondary != null
  syncShapeFromDual(currentDual())
}

function syncSharedDefaults() {
  sharedDefaults.value = dualNumericRangeForAttribute(props.attribute.attrName, viewBox.value)
}

watch(
  () => props.attribute.value,
  (value) => syncFromValue(value),
)

watch(
  () => attributeIdentity(props.attribute),
  (identity, previous) => {
    if (previous !== undefined && identity === previous) return
    activeLens.value = 'axes'
    stretchAxis.value = 'x'
    syncFromValue(props.attribute.value)
    syncSharedDefaults()
  },
  { immediate: true },
)

function commitDual(next: DualNumeric) {
  primary.value = Math.max(0, next.primary)
  secondary.value = Math.max(0, next.secondary ?? next.primary)
  separateValues.value = next.secondary != null
  syncShapeFromDual(next)
  emit('update', formatDualNumeric(next))
}

function commitAxesState() {
  commitDual(currentDual())
}

function setPrimary(value: number) {
  primary.value = Math.max(0, value)
  commitAxesState()
}

function setSecondary(value: number) {
  secondary.value = Math.max(0, value)
  commitAxesState()
}

function onSeparateChange(event: Event) {
  const enabled = (event.target as HTMLInputElement).checked
  separateValues.value = enabled
  if (enabled && secondary.value < primary.value) {
    secondary.value = primary.value
  }
  commitAxesState()
}

function setMagnitude(value: number) {
  magnitude.value = Math.max(0, value)
  commitDual(
    shapeToDual({
      magnitude: magnitude.value,
      eccentricity: eccentricity.value,
      axis: stretchAxis.value,
    }),
  )
}

function setEccentricity(value: number) {
  eccentricity.value = Math.min(1, Math.max(0, value))
  commitDual(
    shapeToDual({
      magnitude: magnitude.value,
      eccentricity: eccentricity.value,
      axis: stretchAxis.value,
    }),
  )
}

function setStretchAxis(axis: StretchAxis) {
  if (stretchAxis.value === axis) return
  stretchAxis.value = axis
  if (eccentricity.value <= 0) return
  commitDual(
    shapeToDual({
      magnitude: magnitude.value,
      eccentricity: eccentricity.value,
      axis: stretchAxis.value,
    }),
  )
}

function selectLens(id: DualLensId) {
  activeLens.value = id
}
</script>

<template>
  <div class="dual-numeric-adjuster">
    <p v-if="parseError" class="dual-numeric-adjuster__error">
      Could not parse value — sliders may not reflect the raw string.
    </p>

    <div class="dual-numeric-adjuster__lenses" role="tablist" aria-label="Value lens">
      <button
        v-for="lens in DUAL_NUMERIC_LENSES"
        :key="lens.id"
        type="button"
        role="tab"
        class="dual-numeric-adjuster__pill"
        :class="{ 'dual-numeric-adjuster__pill--selected': activeLens === lens.id }"
        :aria-selected="activeLens === lens.id"
        @click="selectLens(lens.id)"
      >
        {{ lens.label }}
      </button>
    </div>

    <template v-if="activeLens === 'axes'">
      <label class="dual-numeric-adjuster__toggle">
        <input type="checkbox" :checked="separateValues" @change="onSeparateChange" />
        <span>Separate {{ labels.primary }} / {{ labels.secondary }} values</span>
      </label>

      <AxisControl
        :label="separateValues ? labels.primary : 'Value'"
        :value="primary"
        :default-min="sharedDefaults.min"
        :default-max="sharedDefaults.max"
        :default-step="sharedDefaults.step"
        :fixed-min="0"
        @update="setPrimary"
      />

      <AxisControl
        v-if="separateValues"
        :label="labels.secondary"
        :value="secondary"
        :default-min="sharedDefaults.min"
        :default-max="sharedDefaults.max"
        :default-step="sharedDefaults.step"
        :fixed-min="0"
        @update="setSecondary"
      />
    </template>

    <template v-else>
      <div class="dual-numeric-adjuster__stretch" role="group" aria-label="Stretch axis">
        <span class="dual-numeric-adjuster__stretch-label">Stretch</span>
        <button
          type="button"
          class="dual-numeric-adjuster__pill"
          :class="{ 'dual-numeric-adjuster__pill--selected': stretchAxis === 'x' }"
          :aria-pressed="stretchAxis === 'x'"
          @click="setStretchAxis('x')"
        >
          {{ labels.primary }}
        </button>
        <button
          type="button"
          class="dual-numeric-adjuster__pill"
          :class="{ 'dual-numeric-adjuster__pill--selected': stretchAxis === 'y' }"
          :aria-pressed="stretchAxis === 'y'"
          @click="setStretchAxis('y')"
        >
          {{ labels.secondary }}
        </button>
      </div>

      <AxisControl
        label="Mag"
        :value="magnitude"
        :default-min="sharedDefaults.min"
        :default-max="sharedDefaults.max"
        :default-step="sharedDefaults.step"
        :fixed-min="0"
        @update="setMagnitude"
      />

      <AxisControl
        label="Ecc"
        :value="eccentricity"
        :default-min="ECCENTRICITY_RANGE.min"
        :default-max="ECCENTRICITY_RANGE.max"
        :default-step="ECCENTRICITY_RANGE.step"
        :fixed-min="0"
        @update="setEccentricity"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.dual-numeric-adjuster {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__error {
    margin: 0;
    font-size: 0.75rem;
    color: $color-text-muted;
  }

  &__lenses {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-xs;
  }

  &__stretch {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: $spacing-xs;
  }

  &__stretch-label {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $color-text-muted;
  }

  &__pill {
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.55rem;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: $color-bg;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: $color-text;
    cursor: pointer;
    transition:
      border-color 0.12s,
      background 0.12s,
      color 0.12s;

    &:hover {
      border-color: $color-accent;
    }

    &--selected {
      border-color: $color-accent;
      background: color-mix(in srgb, $color-accent 12%, $color-bg);
      color: $color-accent;
    }
  }

  &__toggle {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    font-size: 0.8125rem;
    color: $color-text;
    cursor: pointer;
    user-select: none;

    input {
      accent-color: $color-accent;
    }
  }
}
</style>
