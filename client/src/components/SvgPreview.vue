<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import DOMPurify from 'dompurify'
import { formatPoints, updatePoint, type Point2D } from '../lib/pointsAttribute'
import { parseViewBoxFromContent } from '../lib/svgSchema'
import type { PathSegment } from '../lib/svgDocument'

export interface PointsEditState {
  path: PathSegment[]
  points: Point2D[]
  selectedIndex: number | null
}

const props = withDefaults(
  defineProps<{
    content: string
    emptyMessage?: string
    showAxes?: boolean
    pointsEdit?: PointsEditState | null
  }>(),
  {
    emptyMessage: 'Nothing to preview',
    showAxes: false,
    pointsEdit: null,
  },
)

const emit = defineEmits<{
  selectPoint: [index: number]
  updatePoints: [value: string]
}>()

const sanitized = computed(() => {
  if (!props.content.trim()) return ''
  return DOMPurify.sanitize(props.content, { USE_PROFILES: { svg: true } })
})

const viewBox = computed(() => parseViewBoxFromContent(props.content))

const axisSteps = 4

function axisTicks(min: number, max: number): number[] {
  const ticks: number[] = []
  for (let i = 0; i <= axisSteps; i++) {
    ticks.push(min + (max - min) * (i / axisSteps))
  }
  return ticks
}

const xTicks = computed(() =>
  axisTicks(viewBox.value.minX, viewBox.value.minX + viewBox.value.width),
)
const yTicks = computed(() =>
  axisTicks(viewBox.value.minY, viewBox.value.minY + viewBox.value.height),
)

function tickFraction(value: number, min: number, span: number): number {
  if (span <= 0) return 0
  return (value - min) / span
}

function formatCoord(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

const contentRef = ref<HTMLElement | null>(null)
const overlayRef = ref<SVGSVGElement | null>(null)
const cursorCoords = ref<{ x: number; y: number } | null>(null)
const draggingIndex = ref<number | null>(null)

const overlayViewBox = computed(() => {
  const { minX, minY, width, height } = viewBox.value
  return `${minX} ${minY} ${width} ${height}`
})

const showPointsOverlay = computed(
  () => props.pointsEdit != null && props.pointsEdit.points.length > 0 && props.showAxes,
)

function clientToSvgCoords(clientX: number, clientY: number): { x: number; y: number } | null {
  const svg = overlayRef.value ?? contentRef.value?.querySelector('svg')
  if (!svg) return null
  return clientToSvg(svg as SVGSVGElement, clientX, clientY)
}

function onHandlePointerDown(index: number, event: PointerEvent) {
  if (!props.pointsEdit) return
  event.preventDefault()
  event.stopPropagation()
  draggingIndex.value = index
  emit('selectPoint', index)
  window.addEventListener('pointermove', onHandlePointerMove)
  window.addEventListener('pointerup', onHandlePointerUp)
  window.addEventListener('pointercancel', onHandlePointerUp)
}

function onHandlePointerMove(event: PointerEvent) {
  if (draggingIndex.value == null || !props.pointsEdit) return
  const coords = clientToSvgCoords(event.clientX, event.clientY)
  if (!coords) return
  const next = updatePoint(props.pointsEdit.points, draggingIndex.value, {
    x: coords.x,
    y: coords.y,
  })
  emit('updatePoints', formatPoints(next))
}

function onHandlePointerUp() {
  draggingIndex.value = null
  window.removeEventListener('pointermove', onHandlePointerMove)
  window.removeEventListener('pointerup', onHandlePointerUp)
  window.removeEventListener('pointercancel', onHandlePointerUp)
}

function onHandleClick(index: number, event: MouseEvent) {
  event.stopPropagation()
  emit('selectPoint', index)
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onHandlePointerMove)
  window.removeEventListener('pointerup', onHandlePointerUp)
  window.removeEventListener('pointercancel', onHandlePointerUp)
})

function clientToSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const transformed = point.matrixTransform(ctm.inverse())
  return { x: transformed.x, y: transformed.y }
}

function onMouseMove(event: MouseEvent) {
  const svg = contentRef.value?.querySelector('svg')
  if (!svg) {
    cursorCoords.value = null
    return
  }

  const rect = svg.getBoundingClientRect()
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  ) {
    cursorCoords.value = null
    return
  }

  const coords = clientToSvg(svg, event.clientX, event.clientY)
  cursorCoords.value = coords
}

function onMouseLeave() {
  cursorCoords.value = null
}

const aspectRatioStyle = computed(() => {
  const { width, height } = viewBox.value
  if (width <= 0 || height <= 0) return undefined

  const aspectRatio = `${width} / ${height}`
  const moreWideThanTall = width > height
  if (moreWideThanTall) {
    const widthValue = `calc(min(100cqw, ${(100 * width) / height}cqh) - 150px)`
    return { aspectRatio, width: widthValue }
  } else {
    const heightValue = `calc(min(100cqh, ${(100 * height) / width}cqw))`
    return { aspectRatio, height: heightValue }
  }
})

const fullscreen = ref(false)
const svgPreviewRef = ref<HTMLElement | null>(null)

function toggleFullscreen() {
  fullscreen.value = !fullscreen.value
  if (fullscreen.value) {
    svgPreviewRef.value?.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}
</script>

<template>
  <div
    ref="svgPreviewRef"
    class="svg-preview"
    :class="{ 'svg-preview--framed': showAxes && sanitized }"
  >
    <template v-if="sanitized">
      <div v-if="showAxes" class="svg-preview__framed">
        <button class="ghost fullscreen-button" @click="toggleFullscreen">
          <span class="material-icons">{{ fullscreen ? 'fullscreen_exit' : 'fullscreen' }}</span>
        </button>

        <div v-if="cursorCoords" class="svg-preview__cursor-coords" aria-live="polite">
          {{ formatCoord(cursorCoords.x) }}, {{ formatCoord(cursorCoords.y) }}
        </div>

        <div class="svg-preview__axis-unit">
          <div class="svg-preview__corner" />

          <div class="svg-preview__axis-x">
            <span
              v-for="tick in xTicks"
              :key="`x-${tick}`"
              class="svg-preview__tick svg-preview__tick--x"
              :style="{ left: `${tickFraction(tick, viewBox.minX, viewBox.width) * 100}%` }"
            >
              <span class="svg-preview__tick-label">{{ formatCoord(tick) }}</span>
              <span class="svg-preview__tick-mark svg-preview__tick-mark--x" />
            </span>
          </div>

          <div class="svg-preview__axis-y">
            <span
              v-for="tick in yTicks"
              :key="`y-${tick}`"
              class="svg-preview__tick svg-preview__tick--y"
              :style="{ top: `${tickFraction(tick, viewBox.minY, viewBox.height) * 100}%` }"
            >
              <span class="svg-preview__tick-mark svg-preview__tick-mark--y" />
              <span class="svg-preview__tick-label">{{ formatCoord(tick) }}</span>
            </span>
          </div>

          <div
            ref="contentRef"
            class="svg-preview__content svg-preview__content--framed"
            :class="{ 'svg-preview__content--editing-points': showPointsOverlay }"
            :style="aspectRatioStyle"
            @mousemove="onMouseMove"
            @mouseleave="onMouseLeave"
          >
            <div class="svg-preview__svg-host" v-html="sanitized" />
            <svg
              v-if="showPointsOverlay && pointsEdit"
              ref="overlayRef"
              class="svg-preview__overlay"
              :viewBox="overlayViewBox"
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
            >
              <polyline
                class="svg-preview__overlay-path"
                :points="formatPoints(pointsEdit.points)"
                fill="none"
              />
              <circle
                v-for="(point, index) in pointsEdit.points"
                :key="index"
                class="svg-preview__handle"
                :class="{
                  'svg-preview__handle--selected': pointsEdit.selectedIndex === index,
                  'svg-preview__handle--dragging': draggingIndex === index,
                }"
                :cx="point.x"
                :cy="point.y"
                r="5"
                @pointerdown="onHandlePointerDown(index, $event)"
                @click="onHandleClick(index, $event)"
              />
            </svg>
          </div>
        </div>
      </div>

      <div v-else class="svg-preview__content" v-html="sanitized" />
    </template>

    <p v-else class="svg-preview__empty">{{ emptyMessage }}</p>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

$axis-size: 1.75rem;
$tick-color: color-mix(in srgb, $color-text-muted 45%, transparent);

.svg-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 120px;
  background: repeating-conic-gradient(
      color-mix(in srgb, var(--bg-hover) 80%, var(--bg)) 0% 25%,
      var(--bg-hover) 0% 50%
    )
    50% / 20px 20px;
  border-radius: $radius-md;
  overflow: hidden;

  &--framed {
    padding: $spacing-sm;
    container-type: size;
  }

  &__framed {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    min-height: 0;
    position: relative;
  }

  &__cursor-coords {
    position: absolute;
    top: 35px;
    right: 0;
    z-index: 2;
    padding: 0.15rem 0.45rem;
    font-family: $font-mono;
    font-size: 0.6875rem;
    line-height: 1.3;
    color: $color-text;
    background: color-mix(in srgb, var(--bg-raised) 92%, transparent);
    border: 1px solid var(--border);
    border-radius: $radius-sm;
    pointer-events: none;
    backdrop-filter: blur(4px);
  }

  &__axis-unit {
    display: inline-grid;
    grid-template-columns: $axis-size 1fr;
    grid-template-rows: $axis-size 1fr;
    max-width: 100cqw;
    max-height: 100cqh;
  }

  &__corner {
    grid-column: 1;
    grid-row: 1;
  }

  &__axis-x {
    grid-column: 2;
    grid-row: 1;
    position: relative;
    height: $axis-size;
    border-bottom: 1px solid $tick-color;
  }

  &__axis-y {
    grid-column: 1;
    grid-row: 2;
    position: relative;
    width: $axis-size;
    border-right: 1px solid $tick-color;
  }

  &__tick {
    position: absolute;
    pointer-events: none;

    &--x {
      bottom: 0;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.15rem;
    }

    &--y {
      right: 0;
      transform: translateY(-50%);
      display: flex;
      flex-direction: row-reverse;
      align-items: center;
      gap: 0.2rem;
    }
  }

  &__tick-label {
    font-family: $font-mono;
    font-size: 0.625rem;
    line-height: 1;
    color: $color-text-muted;
    user-select: none;
  }

  &__tick-mark {
    background: $tick-color;

    &--x {
      width: 1px;
      height: 0.35rem;
    }

    &--y {
      width: 0.35rem;
      height: 1px;
    }
  }

  &__content {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: $spacing-md;

    :deep(svg) {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
    }

    &--framed {
      grid-column: 2;
      grid-row: 2;
      padding: 0;
      max-width: calc(100cqw - #{$axis-size});
      max-height: calc(100cqh - #{$axis-size});
      cursor: crosshair;
      position: relative;

      :deep(svg) {
        display: block;
        width: 100%;
        height: 100%;
      }
    }

    &--editing-points {
      cursor: default;
    }
  }

  &__svg-host {
    width: 100%;
    height: 100%;

    :deep(svg) {
      display: block;
      width: 100%;
      height: 100%;
    }
  }

  &__overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  &__overlay-path {
    stroke: color-mix(in srgb, $color-accent 55%, transparent);
    stroke-width: 1;
    stroke-dasharray: 4 3;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  &__handle {
    fill: var(--bg-raised);
    stroke: $color-accent;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    pointer-events: all;
    cursor: grab;
    transition: fill 0.12s;

    &--selected {
      fill: color-mix(in srgb, $color-accent 25%, var(--bg-raised));
      stroke-width: 2.5;
    }

    &--dragging {
      cursor: grabbing;
      fill: color-mix(in srgb, $color-accent 40%, var(--bg-raised));
    }

    &:hover {
      fill: color-mix(in srgb, $color-accent 18%, var(--bg-raised));
    }
  }

  &__empty {
    margin: 0;
    color: $color-text-muted;
    font-size: 0.875rem;
  }

  .fullscreen-button {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 2;
  }

  &:fullscreen {
    .svg-preview {
      &__cursor-coords {
        font-size: 1rem;
      }

      &__axis-unit {
        max-width: 80vw;
        max-height: 80vh;
      }

      &__content {
        max-width: calc(80vw - #{$axis-size});
        max-height: calc(80vh - #{$axis-size});
      }
    }

    .fullscreen-button {
      font-size: 1.5rem;
    }
  }
}
</style>
