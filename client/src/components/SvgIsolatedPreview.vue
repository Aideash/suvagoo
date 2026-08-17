<script setup lang="ts">
import { computed, ref } from 'vue'
import CoordinateReadout from './CoordinateReadout.vue'
import HandleOverlay from './HandleOverlay.vue'
import type { IsolatedPreviewModel } from '../lib/isolatedPreview'
import type { PathEditState, PointsEditState } from '../lib/handleEdit'
import type { Point2D } from '../lib/pointsAttribute'
import { sanitizeSvgMarkup } from '../lib/previewMarkup'
import { clientToSvgPoint, containsClientPoint } from '../lib/svgPointer'
import { formatViewBoxValue } from '../lib/svgSchema'

const props = withDefaults(
  defineProps<{
    preview: IsolatedPreviewModel
    pointsEdit?: PointsEditState | null
    pathEdit?: PathEditState | null
  }>(),
  {
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

const sanitized = computed(() => sanitizeSvgMarkup(props.preview.content))

const viewBoxLabel = computed(() => formatViewBoxValue(props.preview.viewBox))

/**
 * The stage carries the resource's aspect ratio so the artwork and the handle
 * overlay, both `xMidYMid meet` over the same box, land on the same pixels.
 */
const stageStyle = computed(() => {
  const { width, height } = props.preview.viewBox
  const ratio = width > 0 && height > 0 ? width / height : 1
  return {
    aspectRatio: String(ratio),
    width: `min(100cqw, calc(100cqh * ${ratio}))`,
  }
})

const guide = computed(() => {
  const point = props.preview.refPoint
  if (!point) return null
  const { minX, minY, width, height } = props.preview.viewBox
  return {
    point,
    dotRadius: Math.min(width, height) / 60,
    minX,
    minY,
    maxX: minX + width,
    maxY: minY + height,
  }
})

const spaceRef = ref<SVGSVGElement | null>(null)
const readoutRef = ref<{ capture: () => void } | null>(null)
const cursor = ref<Point2D | null>(null)
const suppressClick = ref(false)

function onMouseMove(event: MouseEvent) {
  const svg = spaceRef.value
  if (!svg || !containsClientPoint(svg, event.clientX, event.clientY)) {
    cursor.value = null
    return
  }
  cursor.value = clientToSvgPoint(svg, event.clientX, event.clientY)
}

function onMouseLeave() {
  cursor.value = null
}

/**
 * A handle drag can finish as a click on the stage, which is not a pick. The
 * stage clears the flag when the next gesture starts, since a drag that ends on
 * the handle itself leaves no click here to swallow.
 */
function onStageClick() {
  if (suppressClick.value) {
    suppressClick.value = false
    return
  }
  readoutRef.value?.capture()
}
</script>

<template>
  <div class="isolated-preview">
    <header class="isolated-preview__meta">
      <span class="isolated-preview__label">{{ preview.label }}</span>
      <span class="isolated-preview__space">{{ viewBoxLabel }}</span>
    </header>

    <div class="isolated-preview__frame">
      <CoordinateReadout ref="readoutRef" class="isolated-preview__coords" :cursor="cursor" />

      <p v-if="preview.empty" class="isolated-preview__empty">
        This {{ preview.label }} has no artwork to draw yet.
      </p>
      <div
        v-else
        class="isolated-preview__stage"
        :style="stageStyle"
        @mousemove="onMouseMove"
        @mouseleave="onMouseLeave"
        @click="onStageClick"
        @pointerdown="suppressClick = false"
      >
        <div class="isolated-preview__artwork" v-html="sanitized" />

        <!-- Always present: the reference for pointer coordinates as well as the guides. -->
        <svg
          ref="spaceRef"
          class="isolated-preview__guides"
          :viewBox="viewBoxLabel"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <template v-if="guide">
            <line
              class="isolated-preview__guide-line"
              :x1="guide.minX"
              :y1="guide.point.y"
              :x2="guide.maxX"
              :y2="guide.point.y"
            />
            <line
              class="isolated-preview__guide-line"
              :x1="guide.point.x"
              :y1="guide.minY"
              :x2="guide.point.x"
              :y2="guide.maxY"
            />
            <circle
              class="isolated-preview__guide-dot"
              :cx="guide.point.x"
              :cy="guide.point.y"
              :r="guide.dotRadius"
            />
          </template>
        </svg>

        <HandleOverlay
          :view-box="preview.viewBox"
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

    <p v-if="guide" class="isolated-preview__note">
      Dashed lines mark the marker anchor ({{ guide.point.x }}, {{ guide.point.y }}).
    </p>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.isolated-preview {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: $spacing-sm;

  &__meta {
    display: flex;
    align-items: baseline;
    gap: $spacing-sm;
    // Leaves room for the mode toggle and fullscreen button above.
    padding-right: 9rem;
    overflow: hidden;
    font-family: $font-mono;
    font-size: 0.6875rem;
    line-height: 1.2;
    white-space: nowrap;
  }

  &__label {
    overflow: hidden;
    color: $color-accent;
    text-overflow: ellipsis;
  }

  &__space {
    color: $color-text-muted;
  }

  &__frame {
    position: relative;
    display: grid;
    flex: 1;
    place-items: center;
    min-height: 0;
    container-type: size;
  }

  // Clear of the toolbar buttons sitting above the frame.
  &__coords {
    position: absolute;
    top: 1.6rem;
    right: 0;
    z-index: 2;
    max-width: calc(100% - 2.5rem);
  }

  &__stage {
    position: relative;
    max-width: 100cqw;
    max-height: 100cqh;
    cursor: crosshair;
    outline: 1px dashed color-mix(in srgb, $color-text-muted 35%, transparent);
    outline-offset: 0;
  }

  &__artwork {
    width: 100%;
    height: 100%;

    :deep(svg) {
      display: block;
      width: 100%;
      height: 100%;
    }

    // Shapes authored for a clipPath or mask carry no fill of their own, so give
    // the group one they can inherit without overriding authored colours.
    :deep(.suvagoo-isolated-content) {
      fill: color-mix(in srgb, $color-text 65%, transparent);
    }
  }

  &__guides {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  &__guide-line {
    stroke: color-mix(in srgb, $color-text-muted 60%, transparent);
    stroke-width: 1px;
    stroke-dasharray: 3px 3px;
    vector-effect: non-scaling-stroke;
  }

  &__guide-dot {
    fill: none;
    stroke: $color-text-muted;
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }

  &__empty,
  &__note {
    margin: 0;
    color: $color-text-muted;
    font-size: 0.75rem;
    text-align: center;
  }
}
</style>
