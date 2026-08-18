<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { durationRangeForUnit } from '../lib/attributeSchema'
import { formatClockValue, parseClockValue, timingKeywords } from '../lib/animationAttribute'
import { attributeIdentity, type AttributeContext } from '../lib/svgDocument'
import AxisControl from './AxisControl.vue'
import SegmentedControl from './SegmentedControl.vue'
import ValueSuggestInput from './ValueSuggestInput.vue'

const props = defineProps<{
  attribute: AttributeContext
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const TIME_UNITS = ['s', 'ms'] as const

type Mode = 'slider' | 'text'

const draft = ref(props.attribute.value)
const mode = ref<Mode>('slider')
const input = ref<{ setCaret: (offset: number) => void }>()

/**
 * Only a plain number with an optional time unit can be dragged. Event-based
 * timings (`click+1s`), alternative lists and `indefinite` need the text input.
 */
const clock = computed(() => parseClockValue(props.attribute.value))

/** The slider cannot show a value it could not have produced. */
const effectiveMode = computed<Mode>(() =>
  mode.value === 'slider' && clock.value ? 'slider' : 'text',
)

const modeOptions = computed(() => [
  {
    value: 'slider' as Mode,
    label: 'Slider',
    disabled: !clock.value,
    title: clock.value ? undefined : 'Only a plain clock value can be dragged',
  },
  { value: 'text' as Mode, label: 'Text' },
])

watch(
  () => props.attribute.value,
  (value) => {
    draft.value = value
  },
)

// Each attribute starts in whichever mode fits the value it already holds.
watch(
  () => attributeIdentity(props.attribute),
  (identity, previous) => {
    if (previous !== undefined && identity === previous) return
    mode.value = parseClockValue(props.attribute.value) ? 'slider' : 'text'
  },
  { immediate: true },
)

const keywords = computed(() => timingKeywords(props.attribute.attrName))

const suggestions = computed(() => {
  const needle = draft.value.trim().toLowerCase()
  const settled = keywords.value.some((keyword) => keyword === draft.value.trim())
  return keywords.value
    .filter((keyword) => !needle || settled || keyword.toLowerCase().includes(needle))
    .map((keyword) => ({ key: keyword, value: keyword }))
})

/** `begin` and `end` accept far more than a duration, so they say so. */
const acceptsEvents = computed(() => {
  const name = props.attribute.attrName.toLowerCase()
  return name === 'begin' || name === 'end'
})

const range = computed(() => durationRangeForUnit(clock.value?.unit ?? 's'))

function onAxisUpdate(value: number, unit: string) {
  emit('update', formatClockValue(value, unit))
}

function applySuggestion(suggestion: { value: string }) {
  draft.value = suggestion.value
  emit('update', suggestion.value)
  input.value?.setCaret(suggestion.value.length)
}

function commitDraft() {
  if (draft.value !== props.attribute.value) emit('update', draft.value)
}

function discardDraft() {
  draft.value = props.attribute.value
}
</script>

<template>
  <div class="duration-adjuster">
    <SegmentedControl
      v-model="mode"
      :options="modeOptions"
      :label="`${attribute.attrName} editing mode`"
    />

    <AxisControl
      v-if="effectiveMode === 'slider' && clock"
      :value="clock.number"
      :unit="clock.unit"
      :units="TIME_UNITS"
      :default-min="range.min"
      :default-max="range.max"
      :default-step="range.step"
      :fixed-min="0"
      @update="onAxisUpdate"
    />

    <template v-else>
      <ValueSuggestInput
        ref="input"
        v-model="draft"
        :suggestions="suggestions"
        open-on-click
        :aria-label="`${attribute.attrName} value`"
        @commit="commitDraft"
        @discard="discardDraft"
        @select="applySuggestion"
      />
      <p class="duration-adjuster__note">
        <template v-if="acceptsEvents">
          A clock value (<code>1s</code>, <code>250ms</code>), an event on the parent
          (<code>click</code>), an offset from another animation's id
          (<code>spin.end+1s</code>), or <code>indefinite</code>. Separate alternatives with
          <code>;</code>.
        </template>
        <template v-else>
          A clock value (<code>1s</code>, <code>250ms</code>) or <code>indefinite</code>.
        </template>
      </p>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.duration-adjuster {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__note {
    margin: 0;
    font-size: 0.6875rem;
    line-height: 1.5;
    color: $color-text-muted;

    code {
      font-family: $font-mono;
      color: $color-text;
    }
  }
}
</style>
