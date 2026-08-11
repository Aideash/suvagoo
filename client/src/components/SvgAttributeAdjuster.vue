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
  unitsForAttribute,
  viewBoxFromContent,
} from '../lib/attributeSchema'
import { attributeIdentity, type AttributeContext } from '../lib/svgDocument'
import AxisControl from './AxisControl.vue'
import PointsAttributeAdjuster from './PointsAttributeAdjuster.vue'
import PathAttributeAdjuster from './PathAttributeAdjuster.vue'
import DualNumericAttributeAdjuster from './DualNumericAttributeAdjuster.vue'
import ViewBoxAttributeAdjuster from './ViewBoxAttributeAdjuster.vue'

const props = defineProps<{
  attribute: AttributeContext
  content: string
  focusPointIndex?: number | null
  focusCommandIndex?: number | null
}>()

const emit = defineEmits<{
  update: [value: string]
  selectPoint: [index: number | null]
  selectCommand: [index: number | null]
}>()

const draft = ref(props.attribute.value)

const schema = computed(() => getAttributeSchema(props.attribute.attrName))
const viewBox = computed(() => viewBoxFromContent(props.content))
const isLengthKind = computed(
  () => schema.value.kind === 'length' || schema.value.kind === 'number',
)

const defaultNumericRange = computed(() =>
  numericRangeForAttribute(props.attribute.attrName, viewBox.value, props.attribute.value),
)

/**
 * Snapshot of the derived range handed to AxisControl. Held apart from
 * defaultNumericRange so that dragging a value whose range is inferred from the
 * value itself does not keep resetting the range the user set up.
 */
const axisDefaults = ref({ min: 0, max: 100, step: 1 })

function syncAxisDefaults(value: string) {
  axisDefaults.value = numericRangeForAttribute(props.attribute.attrName, viewBox.value, value)
}

watch(
  () => props.attribute.value,
  (value) => {
    draft.value = value
  },
)

watch(
  () => attributeIdentity(props.attribute),
  (identity, previous) => {
    if (previous !== undefined && identity === previous) return
    syncAxisDefaults(props.attribute.value)
  },
  { immediate: true },
)

const effectiveRange = computed(() => {
  const defaults = defaultNumericRange.value
  let min = Number.isFinite(defaults.min) ? defaults.min : 0
  let max = Number.isFinite(defaults.max) ? defaults.max : 100
  const step = Number.isFinite(defaults.step) && defaults.step > 0 ? defaults.step : 1
  if (min > max) [min, max] = [max, min]
  return { min, max, step }
})

const parsedNumeric = computed(() => parseNumericValue(props.attribute.value))
const lengthUnit = computed(() => parsedNumeric.value?.unit ?? '')
const lengthUnits = computed(() => unitsForAttribute(props.attribute.attrName))

/** Falls through to the raw text input while the value is not a plain number. */
const showAxisControl = computed(() => isLengthKind.value && parsedNumeric.value != null)

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
  emit('update', value)
}

function commitDraft() {
  if (draft.value !== props.attribute.value) {
    emit('update', draft.value)
  }
}

function onLengthUpdate(value: number, unit: string) {
  const next = formatNumericValue(value, unit)
  if (unit !== lengthUnit.value) {
    syncAxisDefaults(next)
  }
  commit(next)
}

function nudge(delta: number) {
  const parsed = parseNumericValue(draft.value) ?? parsedNumeric.value
  if (!parsed) return
  const step = schema.value.kind === 'opacity' ? 0.05 : effectiveRange.value.step
  commit(formatNumericValue(parsed.number + delta * step, parsed.unit))
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

    <PathAttributeAdjuster
      v-else-if="schema.kind === 'path'"
      :attribute="attribute"
      :content="content"
      :focus-command-index="focusCommandIndex"
      @update="commit"
      @select-command="emit('selectCommand', $event)"
    />

    <DualNumericAttributeAdjuster
      v-else-if="schema.kind === 'dual-number'"
      :attribute="attribute"
      :content="content"
      @update="commit"
    />

    <ViewBoxAttributeAdjuster
      v-else-if="schema.kind === 'viewBox'"
      :attribute="attribute"
      @update="commit"
    />

    <AxisControl
      v-else-if="showAxisControl"
      :value="parsedNumeric?.number ?? 0"
      :unit="lengthUnit"
      :units="lengthUnits"
      :default-min="axisDefaults.min"
      :default-max="axisDefaults.max"
      :default-step="axisDefaults.step"
      @update="onLengthUpdate"
    />

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
    padding-right: 0;
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
}
</style>
