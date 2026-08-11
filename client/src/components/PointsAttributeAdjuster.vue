<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { numericRangeForAttribute, viewBoxFromContent } from '../lib/attributeSchema'
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
import AxisControl from './AxisControl.vue'

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

watch(
  () => props.attribute.value,
  (value) => {
    if (!isEditingText.value) {
      textDraft.value = value
    }
  },
)

watch(
  () => attributeIdentity(props.attribute),
  (identity, previous) => {
    if (previous !== undefined && identity === previous) return
    isEditingText.value = false
    textDraft.value = props.attribute.value
    selectedIndex.value = null
    emit('selectPoint', null)
  },
  { immediate: true },
)

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
  const next = updatePoint(
    points,
    selectedIndex.value,
    axis === 'x' ? { x: number } : { y: number },
  )
  commitPoints(next)
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

    <p v-if="parseError" class="points-adjuster__warn">
      Could not parse coordinates — check the format.
    </p>

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
        <AxisControl
          label="X"
          :value="selectedPoint.x"
          :default-min="defaultXRange.min"
          :default-max="defaultXRange.max"
          :default-step="defaultXRange.step"
          @update="updateSelectedAxis('x', $event)"
        />
        <AxisControl
          label="Y"
          :value="selectedPoint.y"
          :default-min="defaultYRange.min"
          :default-max="defaultYRange.max"
          :default-step="defaultYRange.step"
          @update="updateSelectedAxis('y', $event)"
        />
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
}
</style>
