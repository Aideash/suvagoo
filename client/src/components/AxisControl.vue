<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { parseNumericValue } from '../lib/attributeSchema'

const props = defineProps<{
  label: string
  axis: 'x' | 'y'
  value: number
  defaultMin: number
  defaultMax: number
  defaultStep: number
  /** When set, min is fixed and the min range field is hidden. */
  fixedMin?: number
}>()

const emit = defineEmits<{
  update: [value: number]
}>()

const rangeMin = ref(0)
const rangeMax = ref(100)
const rangeStep = ref(1)
const textDraft = ref('')
const isEditingText = ref(false)

const effectiveRange = computed(() => {
  const lockedMin = props.fixedMin
  let lo =
    lockedMin != null
      ? lockedMin
      : Number.isFinite(rangeMin.value)
        ? rangeMin.value
        : props.defaultMin
  let hi = Number.isFinite(rangeMax.value) ? rangeMax.value : props.defaultMax
  let st =
    Number.isFinite(rangeStep.value) && rangeStep.value > 0 ? rangeStep.value : props.defaultStep
  if (lo > hi) [lo, hi] = [hi, lo]
  return { min: lo, max: hi, step: st }
})

const showMinField = computed(() => props.fixedMin == null)

function syncDefaults() {
  rangeMin.value = props.fixedMin ?? props.defaultMin
  rangeMax.value = props.defaultMax
  rangeStep.value = props.defaultStep
}

watch(
  () => [props.defaultMin, props.defaultMax, props.defaultStep] as const,
  () => syncDefaults(),
  { immediate: true },
)

watch(
  () => props.value,
  (v) => {
    if (!isEditingText.value) textDraft.value = String(v)
  },
  { immediate: true },
)

const slider = computed({
  get() {
    const fromDraft = parseNumericValue(textDraft.value)
    const n = fromDraft?.number ?? props.value
    return Math.min(effectiveRange.value.max, Math.max(effectiveRange.value.min, n))
  },
  set(next: number) {
    const clamped = Math.max(effectiveRange.value.min, next)
    emit('update', clamped)
  },
})

function onTextInput(event: Event) {
  isEditingText.value = true
  textDraft.value = (event.target as HTMLInputElement).value
}

function onTextEnter(event: KeyboardEvent) {
  isEditingText.value = false
  const parsed = parseNumericValue((event.target as HTMLInputElement).value)
  if (parsed) emit('update', parsed.number)
}

function onTextBlur(event: FocusEvent) {
  isEditingText.value = false
  textDraft.value = String(props.value)
  ;(event.target as HTMLInputElement).value = String(props.value)
}

function nudge(delta: number) {
  const parsed = parseNumericValue(textDraft.value)
  const current = parsed?.number ?? props.value
  const next = Math.max(effectiveRange.value.min, current + delta * effectiveRange.value.step)
  emit('update', next)
}

function roundToNearestStep() {
  const parsed = parseNumericValue(textDraft.value)
  const current = parsed?.number ?? props.value
  emit('update', Math.round(current / effectiveRange.value.step) * effectiveRange.value.step)
}

function shiftUp(property: 'rangeMin' | 'rangeMax' | 'rangeStep') {
  switch (property) {
    case 'rangeMin':
      rangeMin.value *= 10
      break
    case 'rangeMax':
      rangeMax.value *= 10
      break
    case 'rangeStep':
      rangeStep.value *= 10
      break
  }
}

function shiftDown(property: 'rangeMin' | 'rangeMax' | 'rangeStep') {
  console.log('a')
  switch (property) {
    case 'rangeMin':
      rangeMin.value /= 10
      break
    case 'rangeMax':
      rangeMax.value /= 10
      break
    case 'rangeStep':
      rangeStep.value /= 10
      break
  }
}

function invert(property: 'rangeMin' | 'rangeMax' | 'rangeStep') {
  console.log('b')
  switch (property) {
    case 'rangeMin':
      rangeMin.value *= -1
      break
    case 'rangeMax':
      rangeMax.value *= -1
      break
    case 'rangeStep':
      rangeStep.value *= -1
      break
  }
}

function normalizeRange() {
  if (rangeMin.value > rangeMax.value) {
    ;[rangeMin.value, rangeMax.value] = [rangeMax.value, rangeMin.value]
  }
  if (rangeStep.value > rangeMax.value - rangeMin.value) {
    rangeStep.value = rangeMax.value - rangeMin.value
  }
  if (rangeStep.value <= 0) {
    rangeStep.value = 1
  }
}
</script>

<template>
  <div class="axis-control">
    <span class="axis-control__label">{{ label }}</span>
    <input
      v-model.number="slider"
      type="range"
      class="axis-control__slider"
      :min="effectiveRange.min"
      :max="effectiveRange.max"
      :step="effectiveRange.step"
    />
    <div class="axis-control__stepper">
      <button type="button" class="axis-control__step-btn" @click="nudge(-1)">−</button>
      <input
        :value="textDraft"
        type="text"
        class="input axis-control__number"
        @input="onTextInput"
        @keydown.alt.enter.exact="roundToNearestStep"
        @keydown.enter.exact="onTextEnter"
        @blur="onTextBlur"
      />
      <button type="button" class="axis-control__step-btn" @click="nudge(1)">+</button>
    </div>
    <div
      class="axis-control__range-fields"
      :class="{ 'axis-control__range-fields--no-min': !showMinField }"
    >
      <label v-if="showMinField" class="axis-control__range-field">
        <span>min</span>
        <input
          v-model.number="rangeMin"
          type="number"
          class="input axis-control__range-input"
          step="any"
          @blur="normalizeRange"
          @keydown.alt.space.exact.prevent="invert('rangeStep')"
          @keydown.alt.arrow-up.exact.prevent="shiftUp('rangeMin')"
          @keydown.alt.arrow-down.exact.prevent="shiftDown('rangeMin')"
        />
      </label>
      <label class="axis-control__range-field">
        <span>max</span>
        <input
          v-model.number="rangeMax"
          type="number"
          class="input axis-control__range-input"
          step="any"
          @blur="normalizeRange"
          @keydown.alt.space.exact.prevent="invert('rangeStep')"
          @keydown.alt.arrow-up.exact.prevent="shiftUp('rangeMax')"
          @keydown.alt.arrow-down.exact.prevent="shiftDown('rangeMax')"
        />
      </label>
      <label class="axis-control__range-field">
        <span>step</span>
        <input
          v-model.number="rangeStep"
          type="number"
          class="input axis-control__range-input"
          min="0.0001"
          step="any"
          @blur="normalizeRange"
          @keydown.alt.space.exact.prevent="invert('rangeStep')"
          @keydown.alt.arrow-up.exact.prevent="shiftUp('rangeStep')"
          @keydown.alt.arrow-down.exact.prevent="shiftDown('rangeStep')"
        />
      </label>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.axis-control {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
  padding-top: $spacing-xs;
  border-top: 1px solid $color-border;

  &:first-child {
    border-top: none;
    padding-top: 0;
  }

  &__label {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $color-text-muted;
  }

  &__slider {
    width: 100%;
    accent-color: $color-accent;
  }

  &__stepper {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
  }

  &__step-btn {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: $color-bg;
    color: $color-text;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    transition:
      border-color 0.12s,
      color 0.12s;

    &:hover {
      border-color: $color-accent;
      color: $color-accent;
    }
  }

  &__number {
    flex: 1;
    min-width: 0;
    font-family: $font-mono;
    font-size: 0.8125rem;
    text-align: center;
  }

  &__range-fields {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: $spacing-xs;

    &--no-min {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  &__range-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 20px;
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $color-text-muted;
  }

  &__range-input {
    font-family: $font-mono;
    font-size: 0.75rem;
    padding: 2px $spacing-xs;
  }
}
</style>
