<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import DOMPurify from 'dompurify'
import { formatPoints, updatePoint, type Point2D } from '../lib/pointsAttribute'
import {
  allPathHandles,
  formatPathD,
  getReflectedControl,
  updateHandlePosition,
  type PathCommand,
  type PathHandle,
} from '../lib/pathAttribute'
import { parseViewBoxFromContent } from '../lib/svgSchema'
import type { PathSegment } from '../lib/svgDocument'

export interface PointsEditState {
  path: PathSegment[]
  points: Point2D[]
  selectedIndex: number | null
}

export interface PathEditState {
  path: PathSegment[]
  commands: PathCommand[]
  selectedCommandIndex: number | null
  selectedHandleIndex: number | null
}

interface KeyedPoint extends Point2D {
  key: string
}

const props = withDefaults(
  defineProps<{
    content: string
    emptyMessage?: string
    showAxes?: boolean
    pointsEdit?: PointsEditState | null
    pathEdit?: PathEditState | null
  }>(),
  {
    emptyMessage: 'Nothing to preview',
    showAxes: false,
    pointsEdit: null,
    pathEdit: null,
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

function formatCoord(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

const contentRef = ref<HTMLElement | null>(null)
const overlayRef = ref<SVGSVGElement | null>(null)
const cursorCoords = ref<{ x: number; y: number } | null>(null)
const paddingTransitionEnabled = ref(true)
const clickedPointsPaddingCollapsed = ref(false)
const coordsShiftAnimating = ref(false)
const overflowLeaveActive = ref(false)
const clickedPointsListRef = ref<{ $el: HTMLElement } | null>(null)
const clickedPointsListMinHeight = ref('')

function clickedPointsListEl(): HTMLElement | null {
  return clickedPointsListRef.value?.$el ?? null
}
const draggingIndex = ref<number | null>(null)
const clickedPoints = ref<KeyedPoint[]>([])
const MAX_CLICKED_POINTS = 5

function listRowGap(parent: HTMLElement): number {
  return parseFloat(getComputedStyle(parent).rowGap) || 0
}

const overlayViewBox = computed(() => {
  const { minX, minY, width, height } = viewBox.value
  return `${minX} ${minY} ${width} ${height}`
})

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

const showPointsOverlay = computed(
  () => props.pointsEdit != null && props.pointsEdit.points.length > 0 && props.showAxes,
)

const showPathOverlay = computed(
  () => props.pathEdit != null && props.pathEdit.commands.length > 0 && props.showAxes,
)

const pathOverlayD = computed(() => (props.pathEdit ? formatPathD(props.pathEdit.commands) : ''))

const pathHandles = computed((): (PathHandle & { flatIndex: number })[] => {
  if (!props.pathEdit) return []
  const handles = allPathHandles(props.pathEdit.commands)
  return handles.filter((h) => h.valueIndex >= 0).map((h, flatIndex) => ({ ...h, flatIndex }))
})

const pathControlLines = computed(() => {
  if (!props.pathEdit) return []
  const lines: { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }[] = []
  const commands = props.pathEdit.commands

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]
    if (!['C', 'S', 'Q'].includes(cmd.type)) continue

    const handles = getHandlesForCommandLocal(commands, i)
    const endHandle = handles.find((h) => h.kind === 'endpoint')
    const start = getCommandEndPoint(commands, i - 1)

    if (cmd.type === 'C') {
      const c1 = handles.find((h) => h.kind === 'control1')
      const c2 = handles.find((h) => h.kind === 'control2')
      if (start && c1) lines.push({ x1: start.x, y1: start.y, x2: c1.point.x, y2: c1.point.y })
      if (c2 && endHandle) {
        lines.push({ x1: c2.point.x, y1: c2.point.y, x2: endHandle.point.x, y2: endHandle.point.y })
      }
    }

    if (cmd.type === 'Q') {
      const c1 = handles.find((h) => h.kind === 'control1')
      if (start && c1) lines.push({ x1: start.x, y1: start.y, x2: c1.point.x, y2: c1.point.y })
      if (c1 && endHandle) {
        lines.push({ x1: c1.point.x, y1: c1.point.y, x2: endHandle.point.x, y2: endHandle.point.y })
      }
    }

    if (cmd.type === 'S') {
      const reflected = getReflectedControl(commands, i)
      const c2 = handles.find((h) => h.kind === 'control2')
      if (start && reflected) {
        lines.push({ x1: start.x, y1: start.y, x2: reflected.x, y2: reflected.y, dashed: true })
      }
      if (c2 && endHandle) {
        lines.push({ x1: c2.point.x, y1: c2.point.y, x2: endHandle.point.x, y2: endHandle.point.y })
      }
    }
  }
  return lines
})

function getHandlesForCommandLocal(commands: PathCommand[], index: number): PathHandle[] {
  return allPathHandles(commands).filter((h) => h.commandIndex === index)
}

function getCommandEndPoint(commands: PathCommand[], beforeIndex: number): Point2D | null {
  for (let i = beforeIndex; i >= 0; i--) {
    const handles = getHandlesForCommandLocal(commands, i)
    const end = handles.find((h) => h.kind === 'endpoint')
    if (end) return end.point
  }
  return null
}

const draggingHandleIndex = ref<number | null>(null)

function clientToSvgCoords(clientX: number, clientY: number): Point2D | null {
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
  draggingHandleIndex.value = null
  window.removeEventListener('pointermove', onHandlePointerMove)
  window.removeEventListener('pointermove', onPathHandlePointerMove)
  window.removeEventListener('pointerup', onHandlePointerUp)
  window.removeEventListener('pointercancel', onHandlePointerUp)
}

function onPathHandlePointerDown(flatIndex: number, event: PointerEvent) {
  if (!props.pathEdit) return
  event.preventDefault()
  event.stopPropagation()
  draggingHandleIndex.value = flatIndex
  const handle = pathHandles.value[flatIndex]
  if (handle) {
    emit('selectPathHandle', flatIndex, handle.commandIndex)
  }
  window.addEventListener('pointermove', onPathHandlePointerMove)
  window.addEventListener('pointerup', onHandlePointerUp)
  window.addEventListener('pointercancel', onHandlePointerUp)
}

function onPathHandlePointerMove(event: PointerEvent) {
  if (draggingHandleIndex.value == null || !props.pathEdit) return
  const coords = clientToSvgCoords(event.clientX, event.clientY)
  if (!coords) return
  const handle = pathHandles.value[draggingHandleIndex.value]
  if (!handle) return
  const next = updateHandlePosition(props.pathEdit.commands, handle, coords)
  emit('updatePath', formatPathD(next))
}

function onPathHandleClick(flatIndex: number, event: MouseEvent) {
  event.stopPropagation()
  const handle = pathHandles.value[flatIndex]
  if (handle) emit('selectPathHandle', flatIndex, handle.commandIndex)
}

function isPathHandleSelected(flatIndex: number): boolean {
  if (!props.pathEdit) return false
  if (props.pathEdit.selectedHandleIndex === flatIndex) return true
  if (props.pathEdit.selectedHandleIndex == null && props.pathEdit.selectedCommandIndex != null) {
    const handle = pathHandles.value[flatIndex]
    return handle?.commandIndex === props.pathEdit.selectedCommandIndex
  }
  return false
}

function onHandleClick(index: number, event: MouseEvent) {
  event.stopPropagation()
  emit('selectPoint', index)
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onHandlePointerMove)
  window.removeEventListener('pointermove', onPathHandlePointerMove)
  window.removeEventListener('pointerup', onHandlePointerUp)
  window.removeEventListener('pointercancel', onHandlePointerUp)
  window.removeEventListener('pointermove', onContentPointerMove)
  window.removeEventListener('pointerup', onContentPointerUp)
  window.removeEventListener('pointercancel', onContentPointerUp)
})

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): Point2D | null {
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

const handleRadius = computed(() => {
  const { width, height } = viewBox.value
  if (width <= 0 || height <= 0) return 5 / zoom.value
  return Math.min(width, height) / 20 / zoom.value
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

async function addClickedPoint() {
  if (suppressClick.value) {
    suppressClick.value = false
    return
  }

  const currentCoords = cursorCoords.value
  if (!currentCoords) return

  coordsShiftAnimating.value = true
  paddingTransitionEnabled.value = false
  clickedPointsPaddingCollapsed.value = true
  await nextTick()

  clickedPoints.value.unshift({ ...currentCoords, key: crypto.randomUUID() })
  if (clickedPoints.value.length > MAX_CLICKED_POINTS) {
    clickedPoints.value.pop()
    overflowLeaveActive.value = true
  }

  await nextTick()
  paddingTransitionEnabled.value = true
  await nextTick()
  requestAnimationFrame(() => {
    clickedPointsPaddingCollapsed.value = false
  })
}

function onClickedPointsPaddingTransitionEnd(event: TransitionEvent) {
  if (event.propertyName !== 'padding-top') return
  coordsShiftAnimating.value = false
}

function onClickedPointAfterLeave() {
  overflowLeaveActive.value = false
  clickedPointsListMinHeight.value = ''
}

function onClickedPointBeforeLeave(el: Element) {
  const node = el as HTMLElement
  const list = clickedPointsListEl()
  if (overflowLeaveActive.value && list) {
    clickedPointsListMinHeight.value = `${list.offsetHeight}px`
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

function removeClickedPoint(index = -1) {
  if (clickedPoints.value.length === 0) return
  if (index === -1) {
    clickedPoints.value.shift()
  } else {
    clickedPoints.value.splice(index, 1)
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

        <div class="svg-preview__coords-panel">
          <div v-if="cursorCoords" class="svg-preview__cursor-coords" aria-live="polite">
            {{ formatCoord(cursorCoords.x) }}, {{ formatCoord(cursorCoords.y) }}
          </div>

          <div
            v-if="clickedPoints.length > 0"
            class="svg-preview__clicked-points"
            :class="{
              'svg-preview__clicked-points--no-transition': !paddingTransitionEnabled,
              'svg-preview__clicked-points--collapsed': clickedPointsPaddingCollapsed,
            }"
            @transitionend="onClickedPointsPaddingTransitionEnd"
          >
            <TransitionGroup
              ref="clickedPointsListRef"
              name="clicked-points"
              tag="div"
              class="svg-preview__clicked-points-list"
              :style="
                clickedPointsListMinHeight ? { minHeight: clickedPointsListMinHeight } : undefined
              "
              :move-class="
                coordsShiftAnimating ? 'clicked-points-move--paused' : 'clicked-points-move'
              "
              @before-leave="onClickedPointBeforeLeave"
              @after-leave="onClickedPointAfterLeave"
            >
              <div
                v-for="(point, index) in clickedPoints"
                :key="point.key"
                class="svg-preview__clicked-point"
              >
                <button
                  type="button"
                  class="svg-preview__clicked-point-remove ghost"
                  aria-label="Remove coordinate"
                  @click.stop="removeClickedPoint(index)"
                >
                  <span class="material-icons">remove</span>
                </button>
                <span>{{ formatCoord(point.x) }}, {{ formatCoord(point.y) }}</span>
              </div>
            </TransitionGroup>
          </div>
        </div>

        <div class="svg-preview__axis-unit">
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
              <span class="svg-preview__tick-label">{{ formatCoord(tick) }}</span>
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
              <span class="svg-preview__tick-label">{{ formatCoord(tick) }}</span>
            </span>
          </div>

          <div
            ref="contentRef"
            class="svg-preview__content svg-preview__content--framed"
            :class="{
              'svg-preview__content--editing-points': showPointsOverlay || showPathOverlay,
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
              <svg
                v-if="(showPointsOverlay && pointsEdit) || (showPathOverlay && pathEdit)"
                ref="overlayRef"
                class="svg-preview__overlay"
                :viewBox="overlayViewBox"
                preserveAspectRatio="xMidYMid meet"
                aria-hidden="true"
              >
                <template v-if="showPathOverlay && pathEdit">
                  <path class="svg-preview__overlay-path" :d="pathOverlayD" fill="none" />
                  <line
                    v-for="(line, li) in pathControlLines"
                    :key="`cl-${li}`"
                    class="svg-preview__control-line"
                    :class="{ 'svg-preview__control-line--dashed': line.dashed }"
                    :x1="line.x1"
                    :y1="line.y1"
                    :x2="line.x2"
                    :y2="line.y2"
                  />
                  <rect
                    v-for="handle in pathHandles.filter((h) => h.kind !== 'endpoint')"
                    :key="`ph-${handle.flatIndex}`"
                    class="svg-preview__handle svg-preview__handle--control"
                    :class="{
                      'svg-preview__handle--selected': isPathHandleSelected(handle.flatIndex),
                      'svg-preview__handle--dragging': draggingHandleIndex === handle.flatIndex,
                    }"
                    :x="handle.point.x - handleRadius * 0.75"
                    :y="handle.point.y - handleRadius * 0.75"
                    :width="handleRadius * 1.5"
                    :height="handleRadius * 1.5"
                    @pointerdown="onPathHandlePointerDown(handle.flatIndex, $event)"
                    @click="onPathHandleClick(handle.flatIndex, $event)"
                  />
                  <circle
                    v-for="handle in pathHandles.filter((h) => h.kind === 'endpoint')"
                    :key="`pe-${handle.flatIndex}`"
                    class="svg-preview__handle"
                    :class="{
                      'svg-preview__handle--selected': isPathHandleSelected(handle.flatIndex),
                      'svg-preview__handle--dragging': draggingHandleIndex === handle.flatIndex,
                    }"
                    :cx="handle.point.x"
                    :cy="handle.point.y"
                    :r="handleRadius"
                    @pointerdown="onPathHandlePointerDown(handle.flatIndex, $event)"
                    @click="onPathHandleClick(handle.flatIndex, $event)"
                  />
                </template>
                <template v-if="showPointsOverlay && pointsEdit">
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
                    :r="handleRadius"
                    @pointerdown="onHandlePointerDown(index, $event)"
                    @click="onHandleClick(index, $event)"
                  />
                </template>
              </svg>
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

// Overlay strokes and dashes are scaled by the viewport transform, so counter-scale
// them to keep a constant on-screen size at every zoom level.
@function unzoomed($value) {
  @return calc(#{$value} / var(--preview-zoom, 1));
}

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
  --clicked-coord-transition-time: 250ms;
  --clicked-coord-gap: 0.15rem;
  --clicked-coord-font-size: 0.6875rem;
  --clicked-coord-line-height: 1.3;
  --clicked-coord-padding-y: 0.15rem;
  --clicked-coord-border-width: 1px;
  --clicked-coord-row-height: calc(
    2 * var(--clicked-coord-padding-y) + var(--clicked-coord-line-height) *
      var(--clicked-coord-font-size) + 2 * var(--clicked-coord-border-width)
  );

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

  &__cursor-coords {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 1;
    padding: var(--clicked-coord-padding-y) 0.45rem;
    color: $color-text;
    font-family: $font-mono;
    font-size: var(--clicked-coord-font-size);
    line-height: var(--clicked-coord-line-height);
    white-space: nowrap;
    background: color-mix(in srgb, var(--bg-raised) 92%, transparent);
    border: var(--clicked-coord-border-width) solid var(--border);
    border-radius: $radius-sm;
    backdrop-filter: blur(4px);
  }

  &__clicked-points {
    position: absolute;
    top: 0;
    right: 0;
    min-width: 100%;
    padding-top: var(--clicked-coord-row-height);
    color: $color-text-muted;
    font-family: $font-mono;
    font-size: var(--clicked-coord-font-size);
    line-height: var(--clicked-coord-line-height);
    transition:
      padding-top var(--clicked-coord-transition-time) ease,
      border-width var(--clicked-coord-transition-time) ease;

    &--collapsed {
      padding-top: 0;
    }

    &--no-transition {
      transition: none;
    }

    &:hover {
      .svg-preview__clicked-point-remove {
        opacity: 1;
      }
    }
  }

  &__clicked-points-list {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--clicked-coord-gap);
  }

  &__clicked-point {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    pointer-events: auto;
    white-space: nowrap;

    > span {
      padding: var(--clicked-coord-padding-y) 0.45rem;
      background: color-mix(in srgb, var(--bg-raised) 88%, transparent);
      border: var(--clicked-coord-border-width) solid var(--border);
      border-radius: $radius-sm;
    }
  }

  &__clicked-point-remove {
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
    transition: opacity var(--clicked-coord-transition-time) ease;

    &:hover {
      color: $color-text;
    }
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
    padding: var(--clicked-coord-padding-y) 0.45rem;
    color: $color-text-muted;
    font-family: $font-mono;
    font-size: var(--clicked-coord-font-size);
    line-height: var(--clicked-coord-line-height);
    background: color-mix(in srgb, var(--bg-raised) 88%, transparent);
    border: var(--clicked-coord-border-width) solid var(--border);
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
    stroke-width: unzoomed(1px);
    stroke-dasharray: unzoomed(4px) unzoomed(3px);
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  &__control-line {
    stroke: color-mix(in srgb, $color-accent 35%, transparent);
    stroke-width: unzoomed(1px);
    vector-effect: non-scaling-stroke;
    pointer-events: none;

    &--dashed {
      stroke-dasharray: unzoomed(3px) unzoomed(2px);
      opacity: 0.7;
    }
  }

  &__handle {
    fill: var(--bg-raised);
    stroke: $color-accent;
    stroke-width: unzoomed(2px);
    vector-effect: non-scaling-stroke;
    pointer-events: all;
    cursor: grab;
    transition: fill 0.12s;

    &--selected {
      fill: color-mix(in srgb, $color-accent 25%, var(--bg-raised));
      stroke-width: unzoomed(2.5px);
    }

    &--dragging {
      cursor: grabbing;
      fill: color-mix(in srgb, $color-accent 40%, var(--bg-raised));
    }

    &--control {
      fill: color-mix(in srgb, $color-accent 15%, var(--bg-raised));
      stroke: color-mix(in srgb, $color-accent 70%, transparent);
      stroke-width: unzoomed(1.5px);
    }

    &--control#{&}--selected {
      fill: color-mix(in srgb, $color-accent 30%, var(--bg-raised));
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
    --clicked-coord-font-size: 1rem;

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

    .fullscreen-button {
      font-size: 1.5rem;
    }
  }

  :deep(.clicked-points-move) {
    transition: transform var(--clicked-coord-transition-time) ease;
  }

  :deep(.clicked-points-move--paused) {
    transition: none;
  }

  :deep(.clicked-points-leave-active) {
    position: absolute;
    right: 0;
    transition: opacity var(--clicked-coord-transition-time) ease;
  }

  :deep(.clicked-points-leave-to) {
    opacity: 0;
  }
}
</style>
