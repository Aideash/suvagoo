<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  dualNumericRangeForAttribute,
  getAttributeSchema,
  viewBoxFromContent,
} from '../lib/attributeSchema'
import {
  formatDualNumeric,
  parseDualNumeric,
  type DualNumeric,
} from '../lib/dualNumericAttribute'
import { attributeIdentity, type AttributeContext } from '../lib/svgDocument'
import AxisControl from './AxisControl.vue'

const props = defineProps<{
  attribute: AttributeContext
  content: string
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const separateValues = ref(false)
const primary = ref(0)
const secondary = ref(0)

const viewBox = computed(() => viewBoxFromContent(props.content))
const schema = computed(() => getAttributeSchema(props.attribute.attrName))
const labels = computed(() => schema.value.dualNumber ?? { primary: 'X', secondary: 'Y' })

const defaultRange = computed(() =>
  dualNumericRangeForAttribute(props.attribute.attrName, viewBox.value),
)

const parseError = computed(() => {
  const trimmed = props.attribute.value.trim()
  if (!trimmed) return false
  return parseDualNumeric(props.attribute.value) === null
})

function syncFromValue(value: string) {
  const parsed = parseDualNumeric(value)
  if (!parsed) return
  primary.value = Math.max(0, parsed.primary)
  secondary.value = Math.max(0, parsed.secondary ?? parsed.primary)
  separateValues.value = parsed.secondary != null
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
  },
  { immediate: true },
)

function commitState() {
  const next: DualNumeric = separateValues.value
    ? { primary: primary.value, secondary: secondary.value }
    : { primary: primary.value, secondary: null }
  emit('update', formatDualNumeric(next))
}

function setPrimary(value: number) {
  primary.value = Math.max(0, value)
  commitState()
}

function setSecondary(value: number) {
  secondary.value = Math.max(0, value)
  commitState()
}

function onSeparateChange(event: Event) {
  const enabled = (event.target as HTMLInputElement).checked
  separateValues.value = enabled
  if (enabled && secondary.value < primary.value) {
    secondary.value = primary.value
  }
  commitState()
}
</script>

<template>
  <div class="dual-numeric-adjuster">
    <p v-if="parseError" class="dual-numeric-adjuster__error">
      Could not parse value — sliders may not reflect the raw string.
    </p>

    <label class="dual-numeric-adjuster__toggle">
      <input
        type="checkbox"
        :checked="separateValues"
        @change="onSeparateChange"
      />
      <span>Separate {{ labels.primary }} / {{ labels.secondary }} values</span>
    </label>

    <AxisControl
      :label="separateValues ? labels.primary : 'Value'"
      axis="x"
      :value="primary"
      :default-min="defaultRange.min"
      :default-max="defaultRange.max"
      :default-step="defaultRange.step"
      :fixed-min="0"
      @update="setPrimary"
    />

    <AxisControl
      v-if="separateValues"
      :label="labels.secondary"
      axis="y"
      :value="secondary"
      :default-min="defaultRange.min"
      :default-max="defaultRange.max"
      :default-step="defaultRange.step"
      :fixed-min="0"
      @update="setSecondary"
    />
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.dual-numeric-adjuster {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__error {
    margin: 0;
    font-size: 0.75rem;
    color: $color-text-muted;
  }

  &__toggle {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    font-size: 0.8125rem;
    color: $color-text;
    cursor: pointer;
    user-select: none;

    input {
      accent-color: $color-accent;
    }
  }
}
</style>
