<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { formatCoordinate } from '../lib/svgPointer'
import type { Point2D } from '../lib/pointsAttribute'

interface KeyedPoint extends Point2D {
  key: string
}

const props = defineProps<{
  /** Where the pointer sits in the surface's own coordinate space. */
  cursor: Point2D | null
}>()

const MAX_CLICKED_POINTS = 5

const clickedPoints = ref<KeyedPoint[]>([])
const paddingTransitionEnabled = ref(true)
const paddingCollapsed = ref(false)
const shiftAnimating = ref(false)
const overflowLeaveActive = ref(false)
const listRef = ref<{ $el: HTMLElement } | null>(null)
const listMinHeight = ref('')

function listEl(): HTMLElement | null {
  return listRef.value?.$el ?? null
}

function listRowGap(parent: HTMLElement): number {
  return parseFloat(getComputedStyle(parent).rowGap) || 0
}

/** Pin the current cursor position to the history. */
async function capture() {
  const point = props.cursor
  if (!point) return

  shiftAnimating.value = true
  paddingTransitionEnabled.value = false
  paddingCollapsed.value = true
  await nextTick()

  clickedPoints.value.unshift({ ...point, key: crypto.randomUUID() })
  if (clickedPoints.value.length > MAX_CLICKED_POINTS) {
    clickedPoints.value.pop()
    overflowLeaveActive.value = true
  }

  await nextTick()
  paddingTransitionEnabled.value = true
  await nextTick()
  requestAnimationFrame(() => {
    paddingCollapsed.value = false
  })
}

function onPaddingTransitionEnd(event: TransitionEvent) {
  if (event.propertyName !== 'padding-top') return
  shiftAnimating.value = false
}

function onAfterLeave() {
  overflowLeaveActive.value = false
  listMinHeight.value = ''
}

function onBeforeLeave(el: Element) {
  const node = el as HTMLElement
  const list = listEl()
  if (overflowLeaveActive.value && list) {
    listMinHeight.value = `${list.offsetHeight}px`
    const gap = listRowGap(list)
    node.style.top = 'auto'
    node.style.bottom = `${-(node.offsetHeight + gap)}px`
    node.style.width = `${node.offsetWidth}px`
    return
  }
  node.style.top = `${node.offsetTop}px`
  node.style.bottom = 'auto'
  node.style.width = `${node.offsetWidth}px`
}

function remove(index: number) {
  clickedPoints.value.splice(index, 1)
}

defineExpose({ capture })
</script>

<template>
  <div class="coord-readout">
    <div v-if="cursor" class="coord-readout__cursor" aria-live="polite">
      {{ formatCoordinate(cursor.x) }}, {{ formatCoordinate(cursor.y) }}
    </div>

    <div
      v-if="clickedPoints.length > 0"
      class="coord-readout__history"
      :class="{
        'coord-readout__history--no-transition': !paddingTransitionEnabled,
        'coord-readout__history--collapsed': paddingCollapsed,
      }"
      @transitionend="onPaddingTransitionEnd"
    >
      <TransitionGroup
        ref="listRef"
        name="clicked-points"
        tag="div"
        class="coord-readout__list"
        :style="listMinHeight ? { minHeight: listMinHeight } : undefined"
        :move-class="shiftAnimating ? 'clicked-points-move--paused' : 'clicked-points-move'"
        @before-leave="onBeforeLeave"
        @after-leave="onAfterLeave"
      >
        <div v-for="(point, index) in clickedPoints" :key="point.key" class="coord-readout__point">
          <button
            type="button"
            class="coord-readout__remove ghost"
            aria-label="Remove coordinate"
            @click.stop="remove(index)"
          >
            <span class="material-icons">remove</span>
          </button>
          <span>{{ formatCoordinate(point.x) }}, {{ formatCoordinate(point.y) }}</span>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.coord-readout {
  pointer-events: none;

  &__cursor {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 1;
    padding: var(--coord-padding-y) 0.45rem;
    color: $color-text;
    font-family: $font-mono;
    font-size: var(--coord-font-size);
    line-height: var(--coord-line-height);
    white-space: nowrap;
    background: color-mix(in srgb, var(--bg-raised) 92%, transparent);
    border: var(--coord-border-width) solid var(--border);
    border-radius: $radius-sm;
    backdrop-filter: blur(4px);
  }

  &__history {
    position: absolute;
    top: 0;
    right: 0;
    min-width: 100%;
    padding-top: var(--coord-row-height);
    color: $color-text-muted;
    font-family: $font-mono;
    font-size: var(--coord-font-size);
    line-height: var(--coord-line-height);
    transition:
      padding-top var(--coord-transition-time) ease,
      border-width var(--coord-transition-time) ease;

    &--collapsed {
      padding-top: 0;
    }

    &--no-transition {
      transition: none;
    }

    &:hover {
      .coord-readout__remove {
        opacity: 1;
      }
    }
  }

  &__list {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--coord-gap);
  }

  &__point {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    pointer-events: auto;
    white-space: nowrap;

    > span {
      padding: var(--coord-padding-y) 0.45rem;
      background: color-mix(in srgb, var(--bg-raised) 88%, transparent);
      border: var(--coord-border-width) solid var(--border);
      border-radius: $radius-sm;
    }
  }

  &__remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    padding: 0;
    border-width: 0;
    font-size: 0.875rem;
    line-height: 1;
    color: $color-text-muted;
    opacity: 0;
    transition: opacity var(--coord-transition-time) ease;

    &:hover {
      color: $color-text;
    }
  }

  :deep(.clicked-points-move) {
    transition: transform var(--coord-transition-time) ease;
  }

  :deep(.clicked-points-move--paused) {
    transition: none;
  }

  :deep(.clicked-points-leave-active) {
    position: absolute;
    right: 0;
    transition: opacity var(--coord-transition-time) ease;
  }

  :deep(.clicked-points-leave-to) {
    opacity: 0;
  }
}
</style>
