<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { attributeIdentity, type AttributeContext } from '../lib/svgDocument'
import {
  formatPreserveAspectRatio,
  parsePreserveAspectRatio,
  PRESERVE_ASPECT_RATIO_ALIGNS,
  type MeetOrSlice,
  type PreserveAspectRatio,
  type PreserveAspectRatioAlign,
} from '../lib/preserveAspectRatioAttribute'

const props = defineProps<{
  attribute: AttributeContext
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const DEFAULT_PARSED: PreserveAspectRatio = {
  align: 'xMidYMid',
  meetOrSlice: null,
}

const align = ref<PreserveAspectRatioAlign>(DEFAULT_PARSED.align)
const meetOrSlice = ref<MeetOrSlice | null>(DEFAULT_PARSED.meetOrSlice)
const fieldId = useId()

const parseError = computed(() => {
  const trimmed = props.attribute.value.trim()
  if (!trimmed) return false
  return parsePreserveAspectRatio(props.attribute.value) === null
})

const showMeetOrSlice = computed(() => align.value !== 'none')

function syncFromValue(value: string) {
  const parsed = parsePreserveAspectRatio(value)
  if (!parsed) return
  align.value = parsed.align
  meetOrSlice.value = parsed.meetOrSlice
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

function commitParsed(next: PreserveAspectRatio) {
  align.value = next.align
  meetOrSlice.value = next.align === 'none' ? null : next.meetOrSlice
  emit('update', formatPreserveAspectRatio(next))
}

function onAlignChange(event: Event) {
  const nextAlign = (event.target as HTMLSelectElement).value as PreserveAspectRatioAlign
  commitParsed({
    align: nextAlign,
    meetOrSlice: nextAlign === 'none' ? null : meetOrSlice.value,
  })
}

function toggleMeetOrSlice(option: MeetOrSlice) {
  const next = meetOrSlice.value === option ? null : option
  commitParsed({ align: align.value, meetOrSlice: next })
}
</script>

<template>
  <div class="par-adjuster">
    <p v-if="parseError" class="par-adjuster__error">
      Could not parse value — controls may not reflect the raw string.
    </p>

    <select
      :id="fieldId"
      class="input par-adjuster__select"
      :value="align"
      :aria-label="`${attribute.attrName} align`"
      @change="onAlignChange"
    >
      <option v-if="!PRESERVE_ASPECT_RATIO_ALIGNS.includes(align)" :value="align">
        {{ align }} (custom)
      </option>
      <option v-for="option in PRESERVE_ASPECT_RATIO_ALIGNS" :key="option" :value="option">
        {{ option }}
      </option>
    </select>

    <div
      v-if="showMeetOrSlice"
      class="par-adjuster__meet-slice"
      role="group"
      aria-label="Meet or slice"
    >
      <button
        type="button"
        class="par-adjuster__seg"
        :class="{
          'par-adjuster__seg--selected': meetOrSlice === 'meet',
          'par-adjuster__seg--ghost': meetOrSlice == null,
        }"
        :aria-pressed="meetOrSlice === 'meet'"
        @click="toggleMeetOrSlice('meet')"
      >
        meet
      </button>
      <button
        type="button"
        class="par-adjuster__seg"
        :class="{ 'par-adjuster__seg--selected': meetOrSlice === 'slice' }"
        :aria-pressed="meetOrSlice === 'slice'"
        @click="toggleMeetOrSlice('slice')"
      >
        slice
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.par-adjuster {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__error {
    margin: 0;
    font-size: 0.75rem;
    color: $color-text-muted;
  }

  &__select {
    width: 100%;
    font-family: $font-mono;
    font-size: 0.8125rem;
  }

  &__meet-slice {
    display: flex;
    gap: $spacing-xs;
  }

  &__seg {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.3rem 0.55rem;
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
      color 0.12s,
      opacity 0.12s;

    &:hover {
      border-color: $color-accent;
    }

    &--selected {
      border-color: $color-accent;
      background: color-mix(in srgb, $color-accent 12%, $color-bg);
      color: $color-accent;
    }

    /* Empty state: ghost of the SVG default (meet) without looking selected. */
    &--ghost {
      border-style: dashed;
      border-color: color-mix(in srgb, $color-accent 35%, $color-border);
    }
  }
}
</style>
