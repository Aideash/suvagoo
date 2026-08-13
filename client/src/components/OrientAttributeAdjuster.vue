<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { attributeIdentity, type AttributeContext } from '../lib/svgDocument'
import {
  formatOrient,
  parseOrient,
  type OrientMode,
  type OrientValue,
} from '../lib/orientAttribute'
import AxisControl from './AxisControl.vue'

const props = defineProps<{
  attribute: AttributeContext
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const DEFAULT_PARSED: OrientValue = {
  mode: 'auto',
  angle: 0,
}

const ORIENT_MODES: readonly OrientMode[] = ['auto', 'auto-start-reverse', 'angle']

const mode = ref<OrientMode>(DEFAULT_PARSED.mode)
const angle = ref(DEFAULT_PARSED.angle)

const parseError = computed(() => {
  const trimmed = props.attribute.value.trim()
  if (!trimmed) return false
  return parseOrient(props.attribute.value) === null
})

function syncFromValue(value: string) {
  const parsed = parseOrient(value)
  if (!parsed) return
  mode.value = parsed.mode
  angle.value = parsed.angle
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

function commitParsed(next: OrientValue) {
  mode.value = next.mode
  angle.value = next.angle
  emit('update', formatOrient(next))
}

function setMode(nextMode: OrientMode) {
  commitParsed({
    mode: nextMode,
    angle: angle.value,
  })
}

function onAngleUpdate(value: number, _unit: string) {
  commitParsed({ mode: 'angle', angle: value })
}
</script>

<template>
  <div class="orient-adjuster">
    <p v-if="parseError" class="orient-adjuster__error">
      Could not parse value — controls may not reflect the raw string.
    </p>

    <div class="orient-adjuster__modes" role="group" :aria-label="`${attribute.attrName} mode`">
      <button
        v-for="option in ORIENT_MODES"
        :key="option"
        type="button"
        class="orient-adjuster__seg"
        :class="{ 'orient-adjuster__seg--selected': mode === option }"
        :aria-pressed="mode === option"
        @click="setMode(option)"
      >
        {{ option }}
      </button>
    </div>

    <AxisControl
      v-if="mode === 'angle'"
      label="Angle"
      :value="angle"
      :default-min="0"
      :default-max="360"
      :default-step="1"
      :fixed-min="0"
      :units="['']"
      unit=""
      @update="onAngleUpdate"
    />
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.orient-adjuster {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  min-height: 160px;

  &__error {
    margin: 0;
    font-size: 0.75rem;
    color: $color-text-muted;
  }

  &__modes {
    display: flex;
    gap: $spacing-xs;
  }

  &__seg {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.3rem 0.4rem;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: $color-bg;
    font-family: $font-mono;
    font-size: 0.6875rem;
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
}
</style>
