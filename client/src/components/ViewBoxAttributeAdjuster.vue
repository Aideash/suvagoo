<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { viewBoxFieldRange, type ViewBoxField } from '../lib/attributeSchema'
import { attributeIdentity, type AttributeContext } from '../lib/svgDocument'
import {
  DEFAULT_VIEWBOX,
  formatViewBoxValue,
  parseViewBoxValue,
  type ViewBox,
} from '../lib/svgSchema'
import AxisControl from './AxisControl.vue'

const props = defineProps<{
  attribute: AttributeContext
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const minX = ref(DEFAULT_VIEWBOX.minX)
const minY = ref(DEFAULT_VIEWBOX.minY)
const width = ref(DEFAULT_VIEWBOX.width)
const height = ref(DEFAULT_VIEWBOX.height)

type FieldRange = { min: number; max: number; step: number }

const fieldDefaults = ref<Record<ViewBoxField, FieldRange>>({
  minX: { min: 0, max: 100, step: 1 },
  minY: { min: 0, max: 100, step: 1 },
  width: { min: 0, max: 100, step: 1 },
  height: { min: 0, max: 100, step: 1 },
})

const parseError = computed(() => {
  const trimmed = props.attribute.value.trim()
  if (!trimmed) return false
  return parseViewBoxValue(props.attribute.value) === null
})

function currentViewBox(): ViewBox {
  return {
    minX: minX.value,
    minY: minY.value,
    width: width.value,
    height: height.value,
  }
}

function syncFieldDefaults(vb: ViewBox) {
  fieldDefaults.value = {
    minX: viewBoxFieldRange('minX', vb),
    minY: viewBoxFieldRange('minY', vb),
    width: viewBoxFieldRange('width', vb),
    height: viewBoxFieldRange('height', vb),
  }
}

function syncFromValue(value: string) {
  const parsed = parseViewBoxValue(value)
  if (!parsed) return
  minX.value = parsed.minX
  minY.value = parsed.minY
  width.value = parsed.width
  height.value = parsed.height
}

watch(
  () => props.attribute.value,
  (value) => syncFromValue(value),
)

watch(
  () => attributeIdentity(props.attribute),
  (identity, previous) => {
    if (previous !== undefined && identity === previous) return
    syncFromValue(props.attribute.value)
    const parsed = parseViewBoxValue(props.attribute.value) ?? DEFAULT_VIEWBOX
    syncFieldDefaults(parsed)
  },
  { immediate: true },
)

function commitState() {
  emit('update', formatViewBoxValue(currentViewBox()))
}

function setMinX(value: number) {
  minX.value = value
  commitState()
}

function setMinY(value: number) {
  minY.value = value
  commitState()
}

function setWidth(value: number) {
  width.value = Math.max(0, value)
  commitState()
}

function setHeight(value: number) {
  height.value = Math.max(0, value)
  commitState()
}
</script>

<template>
  <div class="viewbox-adjuster">
    <p v-if="parseError" class="viewbox-adjuster__error">
      Could not parse value — sliders may not reflect the raw string.
    </p>

    <AxisControl
      label="min-x"
      :value="minX"
      :default-min="fieldDefaults.minX.min"
      :default-max="fieldDefaults.minX.max"
      :default-step="fieldDefaults.minX.step"
      @update="setMinX"
    />

    <AxisControl
      label="min-y"
      :value="minY"
      :default-min="fieldDefaults.minY.min"
      :default-max="fieldDefaults.minY.max"
      :default-step="fieldDefaults.minY.step"
      @update="setMinY"
    />

    <AxisControl
      label="width"
      :value="width"
      :default-min="fieldDefaults.width.min"
      :default-max="fieldDefaults.width.max"
      :default-step="fieldDefaults.width.step"
      :fixed-min="0"
      @update="setWidth"
    />

    <AxisControl
      label="height"
      :value="height"
      :default-min="fieldDefaults.height.min"
      :default-max="fieldDefaults.height.max"
      :default-step="fieldDefaults.height.step"
      :fixed-min="0"
      @update="setHeight"
    />
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.viewbox-adjuster {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__error {
    margin: 0;
    font-size: 0.75rem;
    color: $color-text-muted;
  }
}
</style>
