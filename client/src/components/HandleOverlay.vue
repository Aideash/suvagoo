<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { formatPoints, updatePoint, type Point2D } from '../lib/pointsAttribute'
import {
  allPathHandles,
  formatPathD,
  getReflectedControl,
  updateHandlePosition,
  type PathCommand,
  type PathHandle,
} from '../lib/pathAttribute'
import type { PathEditState, PointsEditState } from '../lib/handleEdit'
import type { ViewBox } from '../lib/svgSchema'

const props = withDefaults(
  defineProps<{
    /** The coordinate space the handle numbers are written in. */
    viewBox: ViewBox
    pointsEdit?: PointsEditState | null
    pathEdit?: PathEditState | null
    /** Scale applied to the surface below, so handles keep a constant size. */
    zoom?: number
  }>(),
  {
    pointsEdit: null,
    pathEdit: null,
    zoom: 1,
  },
)

const emit = defineEmits<{
  selectPoint: [index: number]
  updatePoints: [value: string]
  selectPathHandle: [handleIndex: number, commandIndex: number]
  updatePath: [value: string]
  /** A drag finished, so the click it leaves behind should be ignored. */
  dragEnd: []
}>()

const overlayRef = ref<SVGSVGElement | null>(null)
const draggingIndex = ref<number | null>(null)
const draggingHandleIndex = ref<number | null>(null)

const overlayViewBox = computed(() => {
  const { minX, minY, width, height } = props.viewBox
  return `${minX} ${minY} ${width} ${height}`
})

const handleRadius = computed(() => {
  const { width, height } = props.viewBox
  if (width <= 0 || height <= 0) return 5 / props.zoom
  return Math.min(width, height) / 20 / props.zoom
})

const showPoints = computed(() => (props.pointsEdit?.points.length ?? 0) > 0)
const showPath = computed(() => (props.pathEdit?.commands.length ?? 0) > 0)

const pathOverlayD = computed(() => (props.pathEdit ? formatPathD(props.pathEdit.commands) : ''))

const pathHandles = computed((): (PathHandle & { flatIndex: number })[] => {
  if (!props.pathEdit) return []
  const handles = allPathHandles(props.pathEdit.commands)
  return handles.filter((h) => h.valueIndex >= 0).map((h, flatIndex) => ({ ...h, flatIndex }))
})

function handlesForCommand(commands: PathCommand[], index: number): PathHandle[] {
  return allPathHandles(commands).filter((h) => h.commandIndex === index)
}

function commandEndPoint(commands: PathCommand[], beforeIndex: number): Point2D | null {
  for (let i = beforeIndex; i >= 0; i--) {
    const end = handlesForCommand(commands, i).find((h) => h.kind === 'endpoint')
    if (end) return end.point
  }
  return null
}

const pathControlLines = computed(() => {
  if (!props.pathEdit) return []
  const lines: { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }[] = []
  const commands = props.pathEdit.commands

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]
    if (!['C', 'S', 'Q'].includes(cmd.type)) continue

    const handles = handlesForCommand(commands, i)
    const endHandle = handles.find((h) => h.kind === 'endpoint')
    const start = commandEndPoint(commands, i - 1)

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

function clientToSvgCoords(clientX: number, clientY: number): Point2D | null {
  const svg = overlayRef.value
  const ctm = svg?.getScreenCTM()
  if (!svg || !ctm) return null
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const transformed = point.matrixTransform(ctm.inverse())
  return { x: transformed.x, y: transformed.y }
}

function stopDragging() {
  const wasDragging = draggingIndex.value != null || draggingHandleIndex.value != null
  draggingIndex.value = null
  draggingHandleIndex.value = null
  if (wasDragging) emit('dragEnd')
  window.removeEventListener('pointermove', onPointHandlePointerMove)
  window.removeEventListener('pointermove', onPathHandlePointerMove)
  window.removeEventListener('pointerup', stopDragging)
  window.removeEventListener('pointercancel', stopDragging)
}

function onPointHandlePointerDown(index: number, event: PointerEvent) {
  if (!props.pointsEdit) return
  event.preventDefault()
  event.stopPropagation()
  draggingIndex.value = index
  emit('selectPoint', index)
  window.addEventListener('pointermove', onPointHandlePointerMove)
  window.addEventListener('pointerup', stopDragging)
  window.addEventListener('pointercancel', stopDragging)
}

function onPointHandlePointerMove(event: PointerEvent) {
  if (draggingIndex.value == null || !props.pointsEdit) return
  const coords = clientToSvgCoords(event.clientX, event.clientY)
  if (!coords) return
  const next = updatePoint(props.pointsEdit.points, draggingIndex.value, coords)
  emit('updatePoints', formatPoints(next))
}

function onPointHandleClick(index: number, event: MouseEvent) {
  event.stopPropagation()
  emit('selectPoint', index)
}

function onPathHandlePointerDown(flatIndex: number, event: PointerEvent) {
  if (!props.pathEdit) return
  event.preventDefault()
  event.stopPropagation()
  draggingHandleIndex.value = flatIndex
  const handle = pathHandles.value[flatIndex]
  if (handle) emit('selectPathHandle', flatIndex, handle.commandIndex)
  window.addEventListener('pointermove', onPathHandlePointerMove)
  window.addEventListener('pointerup', stopDragging)
  window.addEventListener('pointercancel', stopDragging)
}

function onPathHandlePointerMove(event: PointerEvent) {
  if (draggingHandleIndex.value == null || !props.pathEdit) return
  const coords = clientToSvgCoords(event.clientX, event.clientY)
  if (!coords) return
  const handle = pathHandles.value[draggingHandleIndex.value]
  if (!handle) return
  emit('updatePath', formatPathD(updateHandlePosition(props.pathEdit.commands, handle, coords)))
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
    return pathHandles.value[flatIndex]?.commandIndex === props.pathEdit.selectedCommandIndex
  }
  return false
}

onBeforeUnmount(stopDragging)
</script>

<template>
  <svg
    v-if="showPoints || showPath"
    ref="overlayRef"
    class="handle-overlay"
    :viewBox="overlayViewBox"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
  >
    <template v-if="showPath && pathEdit">
      <path class="handle-overlay__path" :d="pathOverlayD" fill="none" />
      <line
        v-for="(line, li) in pathControlLines"
        :key="`cl-${li}`"
        class="handle-overlay__control-line"
        :class="{ 'handle-overlay__control-line--dashed': line.dashed }"
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
      />
      <rect
        v-for="handle in pathHandles.filter((h) => h.kind !== 'endpoint')"
        :key="`ph-${handle.flatIndex}`"
        class="handle-overlay__handle handle-overlay__handle--control"
        :class="{
          'handle-overlay__handle--selected': isPathHandleSelected(handle.flatIndex),
          'handle-overlay__handle--dragging': draggingHandleIndex === handle.flatIndex,
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
        class="handle-overlay__handle"
        :class="{
          'handle-overlay__handle--selected': isPathHandleSelected(handle.flatIndex),
          'handle-overlay__handle--dragging': draggingHandleIndex === handle.flatIndex,
        }"
        :cx="handle.point.x"
        :cy="handle.point.y"
        :r="handleRadius"
        @pointerdown="onPathHandlePointerDown(handle.flatIndex, $event)"
        @click="onPathHandleClick(handle.flatIndex, $event)"
      />
    </template>

    <template v-if="showPoints && pointsEdit">
      <polyline
        class="handle-overlay__path"
        :points="formatPoints(pointsEdit.points)"
        fill="none"
      />
      <circle
        v-for="(point, index) in pointsEdit.points"
        :key="index"
        class="handle-overlay__handle"
        :class="{
          'handle-overlay__handle--selected': pointsEdit.selectedIndex === index,
          'handle-overlay__handle--dragging': draggingIndex === index,
        }"
        :cx="point.x"
        :cy="point.y"
        :r="handleRadius"
        @pointerdown="onPointHandlePointerDown(index, $event)"
        @click="onPointHandleClick(index, $event)"
      />
    </template>
  </svg>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

// Strokes and dashes are scaled by the surface transform below, so counter-scale
// them to keep a constant on-screen size at every zoom level.
@function unzoomed($value) {
  @return calc(#{$value} / var(--preview-zoom, 1));
}

.handle-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;

  &__path {
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
      opacity: 0.5;
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
}
</style>
