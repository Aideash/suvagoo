<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  formatColor,
  formatNumericValue,
  getAttributeSchema,
  numericRangeForAttribute,
  parseColor,
  parseColorAlpha,
  parseColorToHex,
  parseNumericValue,
  viewBoxFromContent,
} from '../lib/attributeSchema'
import { attributeIdentity, type AttributeContext } from '../lib/svgDocument'
import PointsAttributeAdjuster from './PointsAttributeAdjuster.vue'

const props = defineProps<{
  attribute: AttributeContext
  content: string
  focusPointIndex?: number | null
}>()

const emit = defineEmits<{
  update: [value: string]
  selectPoint: [index: number | null]
}>()

const draft = ref(props.attribute.value)
const lengthTextDraft = ref(props.attribute.value)
const isEditingLengthText = ref(false)

const rangeMin = ref(0)
const rangeMax = ref(100)
const rangeStep = ref(1)

const schema = computed(() => getAttributeSchema(props.attribute.attrName))
const viewBox = computed(() => viewBoxFromContent(props.content))
const isLengthKind = computed(
  () => schema.value.kind === 'length' || schema.value.kind === 'number',
)

const defaultNumericRange = computed(() =>
  numericRangeForAttribute(props.attribute.attrName, viewBox.value, props.attribute.value),
)

function syncRangeDefaults() {
  const defaults = defaultNumericRange.value
  rangeMin.value = defaults.min
  rangeMax.value = defaults.max
  rangeStep.value = defaults.step
}

watch(
  () => props.attribute.value,
  (value) => {
    draft.value = value
    if (!isEditingLengthText.value) {
      lengthTextDraft.value = value
    }
  },
)

watch(
  () => attributeIdentity(props.attribute),
  (identity, previous) => {
    if (previous !== undefined && identity === previous) return
    isEditingLengthText.value = false
    lengthTextDraft.value = props.attribute.value
    syncRangeDefaults()
  },
  { immediate: true },
)

const effectiveRange = computed(() => {
  let min = rangeMin.value
  let max = rangeMax.value
  let step = rangeStep.value
  if (!Number.isFinite(min)) min = defaultNumericRange.value.min
  if (!Number.isFinite(max)) max = defaultNumericRange.value.max
  if (!Number.isFinite(step) || step <= 0) step = defaultNumericRange.value.step
  if (min > max) [min, max] = [max, min]
  return { min, max, step }
})

const parsedNumeric = computed(() => parseNumericValue(props.attribute.value))
const lengthUnit = computed(() => parsedNumeric.value?.unit ?? '')

const sliderNumeric = computed(() => {
  const fromDraft = parseNumericValue(lengthTextDraft.value)
  if (fromDraft) return fromDraft.number
  return parsedNumeric.value?.number ?? effectiveRange.value.min
})

const sliderValue = computed({
  get() {
    return Math.min(
      effectiveRange.value.max,
      Math.max(effectiveRange.value.min, sliderNumeric.value),
    )
  },
  set(next: number) {
    commitLengthNumeric(next)
  },
})

const colorHex = computed({
  get() {
    return parseColorToHex(draft.value) ?? '#000000'
  },
  set(hex: string) {
    const parsed = parseColor(draft.value)
    const rgb = parseColor(hex)
    if (!rgb) return
    commit(
      formatColor({
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        a: parsed?.a ?? 1,
      }),
    )
  },
})

const colorAlpha = computed({
  get() {
    return parseColorAlpha(draft.value)
  },
  set(next: number) {
    const parsed = parseColor(draft.value)
    if (!parsed) return
    commit(formatColor({ ...parsed, a: next }))
  },
})

const colorAlphaPercent = computed({
  get() {
    return Math.round(colorAlpha.value * 100)
  },
  set(next: number) {
    colorAlpha.value = next / 100
  },
})

const showColorAlpha = computed(() => parseColor(draft.value) != null)

const opacitySlider = computed({
  get() {
    const parsed = parseNumericValue(draft.value)
    if (parsed) return Math.min(1, Math.max(0, parsed.number))
    return 1
  },
  set(next: number) {
    commit(formatNumericValue(next, ''))
  },
})

const percentageSlider = computed({
  get() {
    const parsed = parseNumericValue(draft.value)
    if (!parsed) return 0
    return parsed.number
  },
  set(next: number) {
    const parsed = parseNumericValue(draft.value)
    const unit = parsed?.unit === '%' ? '%' : '%'
    commit(formatNumericValue(next, unit))
  },
})

function commit(value: string) {
  draft.value = value
  if (!isEditingLengthText.value) {
    lengthTextDraft.value = value
  }
  emit('update', value)
}

function commitDraft() {
  if (draft.value !== props.attribute.value) {
    emit('update', draft.value)
  }
}

function commitLengthNumeric(number: number) {
  commit(formatNumericValue(number, lengthUnit.value))
}

function onLengthTextInput(event: Event) {
  isEditingLengthText.value = true
  lengthTextDraft.value = (event.target as HTMLInputElement).value
}

function onLengthTextEnter(event: KeyboardEvent) {
  const value = (event.target as HTMLInputElement).value
  isEditingLengthText.value = false
  if (value.trim() === '') {
    commit('')
    return
  }
  commit(value)
}

function onLengthTextBlur(event: FocusEvent) {
  isEditingLengthText.value = false
  lengthTextDraft.value = props.attribute.value
  ;(event.target as HTMLInputElement).value = props.attribute.value
}

function nudge(delta: number) {
  const source = isLengthKind.value ? lengthTextDraft.value : draft.value
  const parsed = parseNumericValue(source) ?? parsedNumeric.value
  if (!parsed) return
  const step = schema.value.kind === 'opacity' ? 0.05 : effectiveRange.value.step
  const next = parsed.number + delta * step
  if (isLengthKind.value) {
    commitLengthNumeric(next)
  } else {
    commit(formatNumericValue(next, parsed.unit))
  }
}

function onEnumChange(event: Event) {
  commit((event.target as HTMLSelectElement).value)
}
</script>

<template>
  <section class="attr-adjuster">
    <h3 class="attr-adjuster__heading">Adjust</h3>
    <p class="attr-adjuster__target">
      <code>{{ attribute.attrName }}</code>
      <span class="attr-adjuster__value-preview">{{ attribute.value }}</span>
    </p>

    <div v-if="schema.kind === 'color'" class="attr-adjuster__controls">
      <label class="attr-adjuster__color-row">
        <input
          v-model="colorHex"
          type="color"
          class="attr-adjuster__color-input"
          :title="`Pick color for ${attribute.attrName}`"
        />
        <input
          v-model="draft"
          type="text"
          class="input attr-adjuster__text"
          spellcheck="false"
          @change="commitDraft"
          @keydown.enter="commitDraft"
        />
      </label>
      <label v-if="showColorAlpha" class="attr-adjuster__alpha-row">
        <span class="attr-adjuster__alpha-label">Alpha</span>
        <input
          v-model.number="colorAlpha"
          type="range"
          class="attr-adjuster__slider attr-adjuster__alpha-slider"
          min="0"
          max="1"
          step="0.01"
        />
        <input
          v-model.number="colorAlphaPercent"
          type="number"
          class="input attr-adjuster__alpha-number"
          min="0"
          max="100"
          step="1"
        />
        <span class="attr-adjuster__alpha-unit">%</span>
      </label>
    </div>

    <div v-else-if="schema.kind === 'enum'" class="attr-adjuster__controls">
      <select class="input attr-adjuster__select" :value="draft" @change="onEnumChange">
        <option v-if="!schema.enumValues?.includes(draft)" :value="draft">
          {{ draft }} (custom)
        </option>
        <option v-for="option in schema.enumValues" :key="option" :value="option">
          {{ option }}
        </option>
      </select>
    </div>

    <div v-else-if="schema.kind === 'opacity'" class="attr-adjuster__controls">
      <input
        v-model.number="opacitySlider"
        type="range"
        class="attr-adjuster__slider"
        min="0"
        max="1"
        step="0.05"
      />
      <div class="attr-adjuster__stepper">
        <button type="button" class="attr-adjuster__step-btn" @click="nudge(-1)">−</button>
        <input
          v-model="draft"
          type="text"
          class="input attr-adjuster__number"
          @change="commitDraft"
          @keydown.enter="commitDraft"
        />
        <button type="button" class="attr-adjuster__step-btn" @click="nudge(1)">+</button>
      </div>
    </div>

    <div v-else-if="schema.kind === 'percentage'" class="attr-adjuster__controls">
      <input
        v-model.number="percentageSlider"
        type="range"
        class="attr-adjuster__slider"
        :min="effectiveRange.min"
        :max="effectiveRange.max"
        :step="effectiveRange.step"
      />
      <div class="attr-adjuster__stepper">
        <button type="button" class="attr-adjuster__step-btn" @click="nudge(-1)">−</button>
        <input
          v-model="draft"
          type="text"
          class="input attr-adjuster__number"
          @change="commitDraft"
          @keydown.enter="commitDraft"
        />
        <button type="button" class="attr-adjuster__step-btn" @click="nudge(1)">+</button>
      </div>
    </div>

    <PointsAttributeAdjuster
      v-else-if="schema.kind === 'points'"
      :attribute="attribute"
      :content="content"
      :focus-point-index="focusPointIndex"
      @update="commit"
      @select-point="emit('selectPoint', $event)"
    />

    <div v-else-if="isLengthKind" class="attr-adjuster__controls">
      <input
        v-model.number="sliderValue"
        type="range"
        class="attr-adjuster__slider"
        :min="effectiveRange.min"
        :max="effectiveRange.max"
        :step="effectiveRange.step"
      />
      <div class="attr-adjuster__stepper">
        <button type="button" class="attr-adjuster__step-btn" @click="nudge(-1)">−</button>
        <input
          :value="lengthTextDraft"
          type="text"
          class="input attr-adjuster__number"
          @input="onLengthTextInput"
          @keydown.enter="onLengthTextEnter"
          @blur="onLengthTextBlur"
        />
        <button type="button" class="attr-adjuster__step-btn" @click="nudge(1)">+</button>
      </div>
      <div class="attr-adjuster__range-fields">
        <label class="attr-adjuster__range-field">
          <span>min</span>
          <input
            v-model.number="rangeMin"
            type="number"
            class="input attr-adjuster__range-input"
            step="any"
          />
        </label>
        <label class="attr-adjuster__range-field">
          <span>max</span>
          <input
            v-model.number="rangeMax"
            type="number"
            class="input attr-adjuster__range-input"
            step="any"
          />
        </label>
        <label class="attr-adjuster__range-field">
          <span>step</span>
          <input
            v-model.number="rangeStep"
            type="number"
            class="input attr-adjuster__range-input"
            min="0"
            step="any"
          />
        </label>
      </div>
    </div>

    <div v-else class="attr-adjuster__controls">
      <input
        v-model="draft"
        type="text"
        class="input attr-adjuster__text"
        spellcheck="false"
        @change="commitDraft"
        @keydown.enter="commitDraft"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.attr-adjuster {
  padding-top: $spacing-sm;
  border-top: 1px solid $color-border;

  &__heading {
    margin: 0 0 $spacing-xs;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: $color-text-muted;
  }

  &__target {
    display: flex;
    align-items: baseline;
    gap: $spacing-xs;
    margin: 0 0 $spacing-sm;
    font-size: 0.8125rem;

    code {
      font-family: $font-mono;
      color: $color-accent;
    }
  }

  &__value-preview {
    color: $color-text-muted;
    font-family: $font-mono;
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__controls {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }

  &__color-row {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
  }

  &__alpha-row {
    display: grid;
    grid-template-columns: auto 1fr 3.5rem auto;
    align-items: center;
    gap: $spacing-xs;
  }

  &__alpha-label {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $color-text-muted;
  }

  &__alpha-slider {
    min-width: 0;
  }

  &__alpha-number {
    width: 100%;
    font-family: $font-mono;
    font-size: 0.75rem;
    text-align: right;
    padding-right: $spacing-xs;
  }

  &__alpha-unit {
    font-size: 0.75rem;
    color: $color-text-muted;
  }

  &__color-input {
    flex-shrink: 0;
    width: 36px;
    height: 28px;
    padding: 2px;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: $color-bg;
    cursor: pointer;

    &::-webkit-color-swatch-wrapper {
      padding: 0;
    }

    &::-webkit-color-swatch {
      border: 0;
      border-radius: 2px;
    }
  }

  &__text,
  &__select,
  &__number {
    width: 100%;
    font-family: $font-mono;
    font-size: 0.8125rem;
  }

  &__number {
    flex: 1;
    min-width: 0;
    text-align: center;
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
      background 0.12s,
      border-color 0.12s,
      color 0.12s;

    &:hover {
      border-color: $color-accent;
      color: $color-accent;
    }
  }

  &__range-fields {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: $spacing-xs;
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
