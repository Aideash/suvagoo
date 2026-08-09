<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  numericRangeForAttribute,
  parseNumericValue,
  viewBoxFromContent,
} from '../lib/attributeSchema'
import {
  formatPointLabel,
  formatPoints,
  insertPoint,
  movePoint,
  parsePoints,
  removePoint,
  updatePoint,
  type Point2D,
} from '../lib/pointsAttribute'
import { attributeIdentity, type AttributeContext } from '../lib/svgDocument'

const props = defineProps<{
  attribute: AttributeContext
  content: string
  focusPointIndex?: number | null
}>()

const emit = defineEmits<{
  update: [value: string]
  selectPoint: [index: number | null]
}>()

const textDraft = ref(props.attribute.value)
const isEditingText = ref(false)
const selectedIndex = ref<number | null>(null)

const xRangeMin = ref(0)
const xRangeMax = ref(100)
const xRangeStep = ref(1)
const yRangeMin = ref(0)
const yRangeMax = ref(100)
const yRangeStep = ref(1)

const xTextDraft = ref('')
const yTextDraft = ref('')
const isEditingXText = ref(false)
const isEditingYText = ref(false)

const viewBox = computed(() => viewBoxFromContent(props.content))

const parsedPoints = computed(() => {
  if (isEditingText.value) return parsePoints(props.attribute.value)
  return parsePoints(textDraft.value) ?? parsePoints(props.attribute.value)
})

const parseError = computed(() => {
  if (isEditingText.value) return false
  const trimmed = textDraft.value.trim()
  if (!trimmed) return false
  return parsedPoints.value === null
})

const selectedPoint = computed(() => {
  if (selectedIndex.value == null || !parsedPoints.value) return null
  return parsedPoints.value[selectedIndex.value] ?? null
})

const defaultXRange = computed(() =>
  numericRangeForAttribute(
    'x',
    viewBox.value,
    selectedPoint.value ? String(selectedPoint.value.x) : '0',
  ),
)

const defaultYRange = computed(() =>
  numericRangeForAttribute(
    'y',
    viewBox.value,
    selectedPoint.value ? String(selectedPoint.value.y) : '0',
  ),
)

const effectiveXRange = computed(() => normalizeRange(xRangeMin.value, xRangeMax.value, xRangeStep.value, defaultXRange.value))
const effectiveYRange = computed(() => normalizeRange(yRangeMin.value, yRangeMax.value, yRangeStep.value, defaultYRange.value))

function normalizeRange(
  min: number,
  max: number,
  step: number,
  defaults: { min: number; max: number; step: number },
) {
  let lo = Number.isFinite(min) ? min : defaults.min
  let hi = Number.isFinite(max) ? max : defaults.max
  let st = Number.isFinite(step) && step > 0 ? step : defaults.step
  if (lo > hi) [lo, hi] = [hi, lo]
  return { min: lo, max: hi, step: st }
}

function syncAxisRanges() {
  const xDefaults = defaultXRange.value
  xRangeMin.value = xDefaults.min
  xRangeMax.value = xDefaults.max
  xRangeStep.value = xDefaults.step
  const yDefaults = defaultYRange.value
  yRangeMin.value = yDefaults.min
  yRangeMax.value = yDefaults.max
  yRangeStep.value = yDefaults.step
}

watch(
  () => props.attribute.value,
  (value) => {
    if (!isEditingText.value) {
      textDraft.value = value
    }
    if (selectedPoint.value) {
      if (!isEditingXText.value) xTextDraft.value = String(selectedPoint.value.x)
      if (!isEditingYText.value) yTextDraft.value = String(selectedPoint.value.y)
    }
  },
)

watch(
  () => attributeIdentity(props.attribute),
  (identity, previous) => {
    if (previous !== undefined && identity === previous) return
    isEditingText.value = false
    isEditingXText.value = false
    isEditingYText.value = false
    textDraft.value = props.attribute.value
    selectedIndex.value = null
    emit('selectPoint', null)
    syncAxisRanges()
  },
  { immediate: true },
)

watch(selectedPoint, (point) => {
  if (!point) return
  if (!isEditingXText.value) xTextDraft.value = String(point.x)
  if (!isEditingYText.value) yTextDraft.value = String(point.y)
  syncAxisRanges()
})

watch(
  () => props.focusPointIndex,
  (index) => {
    if (index !== undefined && index !== selectedIndex.value) {
      selectedIndex.value = index
    }
  },
)

watch(
  parsedPoints,
  (points) => {
    if (!points) {
      selectedIndex.value = null
      emit('selectPoint', null)
      return
    }
    if (selectedIndex.value != null && selectedIndex.value >= points.length) {
      selectedIndex.value = points.length > 0 ? points.length - 1 : null
      emit('selectPoint', selectedIndex.value)
    }
  },
  { immediate: true },
)

function commit(value: string) {
  textDraft.value = value
  emit('update', value)
}

function commitPoints(points: Point2D[]) {
  commit(formatPoints(points))
}

function selectPoint(index: number | null) {
  selectedIndex.value = index
  emit('selectPoint', index)
}

function onTextInput(event: Event) {
  isEditingText.value = true
  textDraft.value = (event.target as HTMLInputElement).value
}

function onTextEnter(event: KeyboardEvent) {
  const value = (event.target as HTMLInputElement).value
  isEditingText.value = false
  if (value.trim() === '') {
    commit('')
    return
  }
  commit(value)
}

function onTextBlur(event: FocusEvent) {
  isEditingText.value = false
  textDraft.value = props.attribute.value
  ;(event.target as HTMLInputElement).value = props.attribute.value
}

function updateSelectedAxis(axis: 'x' | 'y', number: number) {
  const points = parsedPoints.value
  if (!points || selectedIndex.value == null) return
  const next = updatePoint(points, selectedIndex.value, axis === 'x' ? { x: number } : { y: number })
  commitPoints(next)
}

const xSlider = computed({
  get() {
    const fromDraft = parseNumericValue(xTextDraft.value)
    const n = fromDraft?.number ?? selectedPoint.value?.x ?? effectiveXRange.value.min
    return Math.min(effectiveXRange.value.max, Math.max(effectiveXRange.value.min, n))
  },
  set(next: number) {
    updateSelectedAxis('x', next)
  },
})

const ySlider = computed({
  get() {
    const fromDraft = parseNumericValue(yTextDraft.value)
    const n = fromDraft?.number ?? selectedPoint.value?.y ?? effectiveYRange.value.min
    return Math.min(effectiveYRange.value.max, Math.max(effectiveYRange.value.min, n))
  },
  set(next: number) {
    updateSelectedAxis('y', next)
  },
})

function onAxisTextInput(axis: 'x' | 'y', event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (axis === 'x') {
    isEditingXText.value = true
    xTextDraft.value = value
  } else {
    isEditingYText.value = true
    yTextDraft.value = value
  }
}

function onAxisTextEnter(axis: 'x' | 'y', event: KeyboardEvent) {
  const value = (event.target as HTMLInputElement).value
  if (axis === 'x') isEditingXText.value = false
  else isEditingYText.value = false
  const parsed = parseNumericValue(value)
  if (parsed) updateSelectedAxis(axis, parsed.number)
}

function onAxisTextBlur(axis: 'x' | 'y', event: FocusEvent) {
  if (axis === 'x') isEditingXText.value = false
  else isEditingYText.value = false
  const point = selectedPoint.value
  if (point) {
    const value = axis === 'x' ? String(point.x) : String(point.y)
    if (axis === 'x') xTextDraft.value = value
    else yTextDraft.value = value
    ;(event.target as HTMLInputElement).value = value
  }
}

function nudgeAxis(axis: 'x' | 'y', delta: number) {
  const range = axis === 'x' ? effectiveXRange.value : effectiveYRange.value
  const draft = axis === 'x' ? xTextDraft.value : yTextDraft.value
  const parsed = parseNumericValue(draft)
  const current = parsed?.number ?? (axis === 'x' ? selectedPoint.value?.x : selectedPoint.value?.y)
  if (current == null) return
  updateSelectedAxis(axis, current + delta * range.step)
}

function addPoint() {
  const points = parsedPoints.value
  if (!points) return
  const vb = viewBox.value
  const fallback = { x: vb.minX + vb.width / 2, y: vb.minY + vb.height / 2 }
  const template =
    selectedIndex.value != null
      ? points[selectedIndex.value]
      : points.length > 0
        ? points[points.length - 1]
        : fallback
  const newPoint = { x: template.x + 10, y: template.y + 10 }
  const insertAt = selectedIndex.value != null ? selectedIndex.value + 1 : points.length
  const next = insertPoint(points, insertAt, newPoint)
  commitPoints(next)
  selectPoint(insertAt)
}

function removeSelectedPoint() {
  const points = parsedPoints.value
  if (!points || selectedIndex.value == null || points.length <= 1) return
  const index = selectedIndex.value
  const next = removePoint(points, index)
  commitPoints(next)
  const newIndex = Math.min(index, next.length - 1)
  selectPoint(newIndex >= 0 ? newIndex : null)
}

function moveSelected(delta: -1 | 1) {
  const points = parsedPoints.value
  if (!points || selectedIndex.value == null) return
  const from = selectedIndex.value
  const to = from + delta
  if (to < 0 || to >= points.length) return
  commitPoints(movePoint(points, from, to))
  selectPoint(to)
}
</script>

<template>
  <div class="points-adjuster">
    <input
      :value="textDraft"
      type="text"
      class="input points-adjuster__text"
      spellcheck="false"
      aria-label="points attribute value"
      @input="onTextInput"
      @keydown.enter="onTextEnter"
      @blur="onTextBlur"
    />

    <p v-if="parseError" class="points-adjuster__warn">Could not parse coordinates — check the format.</p>

    <template v-else-if="parsedPoints && parsedPoints.length > 0">
      <div class="points-adjuster__chips" role="listbox" aria-label="Point coordinates">
        <button
          v-for="(point, index) in parsedPoints"
          :key="index"
          type="button"
          role="option"
          class="points-adjuster__chip"
          :class="{ 'points-adjuster__chip--selected': selectedIndex === index }"
          :aria-selected="selectedIndex === index"
          @click="selectPoint(index)"
        >
          <span class="points-adjuster__chip-index">#{{ index + 1 }}</span>
          {{ formatPointLabel(point) }}
        </button>
      </div>

      <div class="points-adjuster__ops">
        <button type="button" class="points-adjuster__op-btn" title="Add point" @click="addPoint">
          +
        </button>
        <button
          type="button"
          class="points-adjuster__op-btn"
          title="Remove selected point"
          :disabled="selectedIndex == null || parsedPoints.length <= 1"
          @click="removeSelectedPoint"
        >
          −
        </button>
        <button
          type="button"
          class="points-adjuster__op-btn"
          title="Move point earlier"
          :disabled="selectedIndex == null || selectedIndex <= 0"
          @click="moveSelected(-1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="points-adjuster__op-btn"
          title="Move point later"
          :disabled="selectedIndex == null || selectedIndex >= parsedPoints.length - 1"
          @click="moveSelected(1)"
        >
          ↓
        </button>
      </div>

      <template v-if="selectedPoint">
        <div class="points-adjuster__axis">
          <span class="points-adjuster__axis-label">X</span>
          <input
            v-model.number="xSlider"
            type="range"
            class="points-adjuster__slider"
            :min="effectiveXRange.min"
            :max="effectiveXRange.max"
            :step="effectiveXRange.step"
          />
          <div class="points-adjuster__stepper">
            <button type="button" class="points-adjuster__step-btn" @click="nudgeAxis('x', -1)">
              −
            </button>
            <input
              :value="xTextDraft"
              type="text"
              class="input points-adjuster__number"
              @input="onAxisTextInput('x', $event)"
              @keydown.enter="onAxisTextEnter('x', $event)"
              @blur="onAxisTextBlur('x', $event)"
            />
            <button type="button" class="points-adjuster__step-btn" @click="nudgeAxis('x', 1)">
              +
            </button>
          </div>
          <div class="points-adjuster__range-fields">
            <label class="points-adjuster__range-field">
              <span>min</span>
              <input v-model.number="xRangeMin" type="number" class="input points-adjuster__range-input" step="any" />
            </label>
            <label class="points-adjuster__range-field">
              <span>max</span>
              <input v-model.number="xRangeMax" type="number" class="input points-adjuster__range-input" step="any" />
            </label>
            <label class="points-adjuster__range-field">
              <span>step</span>
              <input
                v-model.number="xRangeStep"
                type="number"
                class="input points-adjuster__range-input"
                min="0"
                step="any"
              />
            </label>
          </div>
        </div>

        <div class="points-adjuster__axis">
          <span class="points-adjuster__axis-label">Y</span>
          <input
            v-model.number="ySlider"
            type="range"
            class="points-adjuster__slider"
            :min="effectiveYRange.min"
            :max="effectiveYRange.max"
            :step="effectiveYRange.step"
          />
          <div class="points-adjuster__stepper">
            <button type="button" class="points-adjuster__step-btn" @click="nudgeAxis('y', -1)">
              −
            </button>
            <input
              :value="yTextDraft"
              type="text"
              class="input points-adjuster__number"
              @input="onAxisTextInput('y', $event)"
              @keydown.enter="onAxisTextEnter('y', $event)"
              @blur="onAxisTextBlur('y', $event)"
            />
            <button type="button" class="points-adjuster__step-btn" @click="nudgeAxis('y', 1)">
              +
            </button>
          </div>
          <div class="points-adjuster__range-fields">
            <label class="points-adjuster__range-field">
              <span>min</span>
              <input v-model.number="yRangeMin" type="number" class="input points-adjuster__range-input" step="any" />
            </label>
            <label class="points-adjuster__range-field">
              <span>max</span>
              <input v-model.number="yRangeMax" type="number" class="input points-adjuster__range-input" step="any" />
            </label>
            <label class="points-adjuster__range-field">
              <span>step</span>
              <input
                v-model.number="yRangeStep"
                type="number"
                class="input points-adjuster__range-input"
                min="0"
                step="any"
              />
            </label>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.points-adjuster {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__text {
    width: 100%;
    font-family: $font-mono;
    font-size: 0.8125rem;
  }

  &__warn {
    margin: 0;
    font-size: 0.75rem;
    color: var(--red);
  }

  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-xs;
  }

  &__chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.2rem 0.45rem;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: $color-bg;
    font-family: $font-mono;
    font-size: 0.75rem;
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

  &__chip-index {
    font-size: 0.625rem;
    font-weight: 600;
    color: $color-text-muted;
  }

  &__chip--selected &__chip-index {
    color: $color-accent;
  }

  &__ops {
    display: flex;
    gap: $spacing-xs;
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

  &__axis {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
    padding-top: $spacing-xs;
    border-top: 1px solid $color-border;
  }

  &__axis-label {
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
