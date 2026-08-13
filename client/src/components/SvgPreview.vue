<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import DOMPurify from 'dompurify'
import CoordinateReadout from './CoordinateReadout.vue'
import HandleOverlay from './HandleOverlay.vue'
import SvgDefsPreview from './SvgDefsPreview.vue'
import SvgIsolatedPreview from './SvgIsolatedPreview.vue'
import type { DefsPreviewModel } from '../lib/defsPreview'
import type { IsolatedPreviewModel } from '../lib/isolatedPreview'
import type { HandleSurface, PathEditState, PointsEditState } from '../lib/handleEdit'
import type { Point2D } from '../lib/pointsAttribute'
import { clientToSvgPoint, containsClientPoint, formatCoordinate } from '../lib/svgPointer'
import { parseViewBoxFromContent } from '../lib/svgSchema'

const props = withDefaults(
  defineProps<{
    content: string
    emptyMessage?: string
    showAxes?: boolean
    pointsEdit?: PointsEditState | null
    pathEdit?: PathEditState | null
    defsPreview?: DefsPreviewModel | null
    isolatedPreview?: IsolatedPreviewModel | null
    /** Which surface may draw handles for the edit in `pointsEdit`/`pathEdit`. */
    handleSurface?: HandleSurface | null
  }>(),
  {
    emptyMessage: 'Nothing to preview',
    showAxes: false,
    pointsEdit: null,
    pathEdit: null,
    defsPreview: null,
    isolatedPreview: null,
    handleSurface: null,
  },
)

const emit = defineEmits<{
  selectPoint: [index: number]
  updatePoints: [value: string]
  selectPathHandle: [handleIndex: number, commandIndex: number]
  updatePath: [value: string]
}>()

const sanitized = computed(() => {
  if (!props.content.trim()) return ''
  return DOMPurify.sanitize(props.content, {
    USE_PROFILES: { svg: true, svgFilters: true },
  })
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

function tickFraction(value: number, min: number, span: number): number {
  if (span <= 0) return 0
  return (value - min) / span
}

const contentRef = ref<HTMLElement | null>(null)
const readoutRef = ref<{ capture: () => void } | null>(null)
const cursorCoords = ref<Point2D | null>(null)

const MIN_ZOOM = 1
const MAX_ZOOM = 20
const PAN_THRESHOLD_PX = 3

const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const panning = ref(false)
const suppressClick = ref(false)
const panStart = ref<{
  pointerX: number
  pointerY: number
  pan: { x: number; y: number }
  width: number
  height: number
} | null>(null)

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function setView(nextZoom: number, nextPan: { x: number; y: number }) {
  const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
  // Pan is stored as a fraction of the viewport, and stays negative so the
  // artwork always covers the frame.
  const limit = 1 - z
  zoom.value = z
  pan.value = { x: clamp(nextPan.x, limit, 0), y: clamp(nextPan.y, limit, 0) }
}

function resetView() {
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
}

const isZoomed = computed(() => zoom.value !== 1 || pan.value.x !== 0 || pan.value.y !== 0)

const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)

const viewTransform = computed(() => ({
  transform: `translate(${pan.value.x * 100}%, ${pan.value.y * 100}%) scale(${zoom.value})`,
  transformOrigin: '0 0',
  '--preview-zoom': String(zoom.value),
}))

const visibleRange = computed(() => {
  const { minX, minY, width, height } = viewBox.value
  const z = zoom.value
  return {
    minX: minX + width * (-pan.value.x / z),
    maxX: minX + width * ((1 - pan.value.x) / z),
    minY: minY + height * (-pan.value.y / z),
    maxY: minY + height * ((1 - pan.value.y) / z),
  }
})

const xTicks = computed(() => axisTicks(visibleRange.value.minX, visibleRange.value.maxX))
const yTicks = computed(() => axisTicks(visibleRange.value.minY, visibleRange.value.maxY))

function viewportRect(): DOMRect | null {
  const rect = contentRef.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  return rect
}

function onWheel(event: WheelEvent) {
  const rect = viewportRect()
  if (!rect) return

  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : 1)
  const sensitivity = event.ctrlKey ? 0.01 : 0.0025
  const nextZoom = clamp(zoom.value * Math.exp(-delta * sensitivity), MIN_ZOOM, MAX_ZOOM)
  if (nextZoom === zoom.value) return

  const focus = {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  }
  const anchor = {
    x: (focus.x - pan.value.x) / zoom.value,
    y: (focus.y - pan.value.y) / zoom.value,
  }
  setView(nextZoom, {
    x: focus.x - nextZoom * anchor.x,
    y: focus.y - nextZoom * anchor.y,
  })
}

function onContentPointerDown(event: PointerEvent) {
  // A pan that ends outside the frame never produces a click here, so clear any
  // leftover suppression at the start of the next gesture instead.
  suppressClick.value = false
  if (event.button !== 0 || zoom.value <= MIN_ZOOM) return
  const rect = viewportRect()
  if (!rect) return

  panStart.value = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    pan: { ...pan.value },
    width: rect.width,
    height: rect.height,
  }
  window.addEventListener('pointermove', onContentPointerMove)
  window.addEventListener('pointerup', onContentPointerUp)
  window.addEventListener('pointercancel', onContentPointerUp)
}

function onContentPointerMove(event: PointerEvent) {
  const start = panStart.value
  if (!start) return

  const dx = event.clientX - start.pointerX
  const dy = event.clientY - start.pointerY
  if (!panning.value && Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return

  panning.value = true
  setView(zoom.value, {
    x: start.pan.x + dx / start.width,
    y: start.pan.y + dy / start.height,
  })
}

function onContentPointerUp() {
  if (panning.value) suppressClick.value = true
  panning.value = false
  panStart.value = null
  window.removeEventListener('pointermove', onContentPointerMove)
  window.removeEventListener('pointerup', onContentPointerUp)
  window.removeEventListener('pointercancel', onContentPointerUp)
}

const hasHandleEdit = computed(
  () => (props.pointsEdit?.points.length ?? 0) > 0 || (props.pathEdit?.commands.length ?? 0) > 0,
)

/**
 * Handles belong on the document only when the geometry is painted here. Edits
 * inside a resource are written in that resource's own space, so they are
 * handed to the isolated preview instead.
 */
const documentHandles = computed(
  () => props.showAxes && hasHandleEdit.value && props.handleSurface === 'document',
)

const isolatedHandles = computed(
  () => props.showAxes && hasHandleEdit.value && props.handleSurface === 'isolated',
)

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onContentPointerMove)
  window.removeEventListener('pointerup', onContentPointerUp)
  window.removeEventListener('pointercancel', onContentPointerUp)
})

function onMouseMove(event: MouseEvent) {
  const svg = contentRef.value?.querySelector('svg')
  if (!svg || !containsClientPoint(svg, event.clientX, event.clientY)) {
    cursorCoords.value = null
    return
  }

  cursorCoords.value = clientToSvgPoint(svg, event.clientX, event.clientY)
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

type PreviewMode = 'document' | 'defs' | 'isolated'

const MODE_LABELS: Record<PreviewMode, { icon: string; description: string }> = {
  document: { icon: 'image', description: 'Whole document' },
  defs: { icon: 'preview', description: 'Defs resources in use' },
  isolated: { icon: 'center_focus_strong', description: 'This resource on its own' },
}

const mode = ref<PreviewMode>('document')

const availableModes = computed<PreviewMode[]>(() => {
  const modes: PreviewMode[] = ['document']
  if (props.defsPreview) modes.push('defs')
  if (props.isolatedPreview) modes.push('isolated')
  return modes
})

watch(availableModes, (modes) => {
  if (!modes.includes(mode.value)) mode.value = 'document'
})

/** The document hides handles it cannot place; point at where they live instead. */
const handlesElsewhere = computed(
  () => mode.value === 'document' && isolatedHandles.value && props.isolatedPreview != null,
)

function toggleFullscreen() {
  fullscreen.value = !fullscreen.value
  if (fullscreen.value) {
    svgPreviewRef.value?.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

function addClickedPoint() {
  // A pan or a handle drag can finish as a click here; neither one is a pick.
  if (suppressClick.value) {
    suppressClick.value = false
    return
  }
  readoutRef.value?.capture()
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
        <div class="svg-preview__toolbar">
          <div
            v-if="availableModes.length > 1"
            class="svg-preview__modes"
            role="group"
            aria-label="Preview mode"
          >
            <button
              v-for="option in availableModes"
              :key="option"
              type="button"
              class="svg-preview__mode"
              :class="{ 'svg-preview__mode--active': mode === option }"
              :aria-pressed="mode === option"
              :title="MODE_LABELS[option].description"
              @click="mode = option"
            >
              <span class="material-icons">{{ MODE_LABELS[option].icon }}</span>
            </button>
          </div>
          <button
            type="button"
            class="ghost fullscreen-button"
            :title="fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
            @click="toggleFullscreen"
          >
            <span class="material-icons">{{ fullscreen ? 'fullscreen_exit' : 'fullscreen' }}</span>
          </button>
        </div>

        <SvgDefsPreview v-if="mode === 'defs' && defsPreview" :preview="defsPreview" />

        <SvgIsolatedPreview
          v-else-if="mode === 'isolated' && isolatedPreview"
          :preview="isolatedPreview"
          :points-edit="isolatedHandles ? pointsEdit : null"
          :path-edit="isolatedHandles ? pathEdit : null"
          @select-point="emit('selectPoint', $event)"
          @update-points="emit('updatePoints', $event)"
          @select-path-handle="
            (handleIndex, commandIndex) => emit('selectPathHandle', handleIndex, commandIndex)
          "
          @update-path="emit('updatePath', $event)"
        />

        <CoordinateReadout
          v-show="mode === 'document'"
          ref="readoutRef"
          class="svg-preview__coords-panel"
          :cursor="cursorCoords"
        />

        <button
          v-if="handlesElsewhere"
          type="button"
          class="ghost svg-preview__handles-hint"
          title="Show this resource on its own to edit its handles"
          @click="mode = 'isolated'"
        >
          <span class="material-icons sm">center_focus_strong</span>
          Handles live in the isolated preview
        </button>

        <div v-show="mode === 'document'" class="svg-preview__axis-unit">
          <div class="svg-preview__corner" />

          <div class="svg-preview__axis-x">
            <span
              v-for="tick in xTicks"
              :key="`x-${tick}`"
              class="svg-preview__tick svg-preview__tick--x"
              :style="{
                left: `${tickFraction(tick, visibleRange.minX, visibleRange.maxX - visibleRange.minX) * 100}%`,
              }"
            >
              <span class="svg-preview__tick-label">{{ formatCoordinate(tick) }}</span>
              <span class="svg-preview__tick-mark svg-preview__tick-mark--x" />
            </span>
          </div>

          <div class="svg-preview__axis-y">
            <span
              v-for="tick in yTicks"
              :key="`y-${tick}`"
              class="svg-preview__tick svg-preview__tick--y"
              :style="{
                top: `${tickFraction(tick, visibleRange.minY, visibleRange.maxY - visibleRange.minY) * 100}%`,
              }"
            >
              <span class="svg-preview__tick-mark svg-preview__tick-mark--y" />
              <span class="svg-preview__tick-label">{{ formatCoordinate(tick) }}</span>
            </span>
          </div>

          <div
            ref="contentRef"
            class="svg-preview__content svg-preview__content--framed"
            :class="{
              'svg-preview__content--editing-points': documentHandles,
              'svg-preview__content--panning': panning,
            }"
            :style="aspectRatioStyle"
            @mousemove="onMouseMove"
            @mouseleave="onMouseLeave"
            @click="addClickedPoint"
            @wheel.prevent="onWheel"
            @pointerdown="onContentPointerDown"
          >
            <button
              v-if="isZoomed"
              type="button"
              class="ghost svg-preview__zoom-badge"
              title="Reset zoom"
              @click.stop="resetView"
              @pointerdown.stop
            >
              {{ zoomLabel }}
            </button>

            <div class="svg-preview__viewport" :style="viewTransform">
              <div class="svg-preview__svg-host" v-html="sanitized" />
              <HandleOverlay
                v-if="documentHandles"
                :view-box="viewBox"
                :zoom="zoom"
                :points-edit="pointsEdit"
                :path-edit="pathEdit"
                @select-point="emit('selectPoint', $event)"
                @update-points="emit('updatePoints', $event)"
                @select-path-handle="
                  (handleIndex, commandIndex) => emit('selectPathHandle', handleIndex, commandIndex)
                "
                @update-path="emit('updatePath', $event)"
                @drag-end="suppressClick = true"
              />
            </div>
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

  &__coords-panel {
    position: absolute;
    top: 35px;
    right: 0;
    z-index: 2;
    max-width: calc(100% - 2.5rem);
    pointer-events: none;
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
      overflow: hidden;

      :deep(svg) {
        display: block;
        width: 100%;
        height: 100%;
      }
    }

    &--editing-points {
      cursor: crosshair;
    }

    &--panning {
      cursor: grabbing;
    }
  }

  &__viewport {
    position: absolute;
    inset: 0;
  }

  &__zoom-badge {
    position: absolute;
    bottom: 0;
    left: 0;
    z-index: 2;
    padding: var(--coord-padding-y) 0.45rem;
    color: $color-text-muted;
    font-family: $font-mono;
    font-size: var(--coord-font-size);
    line-height: var(--coord-line-height);
    background: color-mix(in srgb, var(--bg-raised) 88%, transparent);
    border: var(--coord-border-width) solid var(--border);
    border-radius: $radius-sm;
    cursor: pointer;

    &:hover {
      color: $color-text;
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

  &__empty {
    margin: 0;
    color: $color-text-muted;
    font-size: 0.875rem;
  }

  &__toolbar {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 2;
    display: flex;
    gap: $spacing-xs;
  }

  &__modes {
    display: flex;
    overflow: hidden;
    background: color-mix(in srgb, var(--bg-raised) 88%, transparent);
    border: var(--coord-border-width) solid var(--border);
    border-radius: $radius-sm;
  }

  &__mode {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3px 7px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: $color-text-muted;
    cursor: pointer;

    & + & {
      border-left: var(--coord-border-width) solid var(--border);
    }

    &:hover:not(&--active) {
      background: var(--bg-hover);
      color: $color-text;
    }

    &--active {
      color: $color-accent;
      background: color-mix(in srgb, $color-accent 16%, var(--bg-raised));
    }
  }

  &__handles-hint {
    position: absolute;
    right: 0;
    bottom: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: var(--coord-padding-y) 0.45rem;
    color: $color-text-muted;
    font-family: $font-mono;
    font-size: var(--coord-font-size);
    line-height: var(--coord-line-height);
    text-align: left;
    background: color-mix(in srgb, var(--bg-raised) 88%, transparent);
    border: var(--coord-border-width) solid var(--border);
    border-radius: $radius-sm;
    cursor: pointer;

    &:hover {
      color: $color-accent;
      border-color: color-mix(in srgb, $color-accent 45%, transparent);
    }
  }

  &:fullscreen {
    --coord-font-size: 1rem;

    .svg-preview {
      &__axis-unit {
        max-width: 80vw;
        max-height: 80vh;
      }

      &__content {
        max-width: calc(80vw - #{$axis-size});
        max-height: calc(80vh - #{$axis-size});
      }
    }

    .svg-preview__toolbar {
      font-size: 1.5rem;
    }
  }
}
</style>
