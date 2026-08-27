<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { REPEAT_COUNT_RANGE } from '../lib/attributeSchema'
import { INDEFINITE, isIndefinite, parseRepeatCount } from '../lib/animationAttribute'
import type { AttributeContext } from '../lib/svgDocument'
import AxisControl from './AxisControl.vue'
import SegmentedControl from './SegmentedControl.vue'

const props = defineProps<{
  attribute: AttributeContext
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const DEFAULT_COUNT = 3

const fieldId = useId()
const draft = ref(props.attribute.value)
/** Remembered so toggling away from Indefinite and back restores the count. */
const lastCount = ref(parseRepeatCount(props.attribute.value) ?? DEFAULT_COUNT)

watch(
  () => props.attribute.value,
  (value) => {
    draft.value = value
    const count = parseRepeatCount(value)
    if (count != null) lastCount.value = count
  },
)

const repeatsForever = computed(() => isIndefinite(props.attribute.value))
const count = computed(() => parseRepeatCount(props.attribute.value))

type Mode = 'count' | 'indefinite'

const MODE_OPTIONS = [
  { value: 'count' as Mode, label: 'Count' },
  { value: 'indefinite' as Mode, label: 'Indefinite' },
]

const mode = computed<Mode>({
  get: () => (repeatsForever.value ? 'indefinite' : 'count'),
  set(next) {
    if (next === mode.value) return
    emit('update', next === 'indefinite' ? INDEFINITE : String(lastCount.value))
  },
})

function onAxisUpdate(value: number) {
  const rounded = Math.max(0, Math.round(value * 100) / 100)
  emit('update', String(rounded))
}

function commitDraft() {
  if (draft.value !== props.attribute.value) emit('update', draft.value)
}

function onEscape(event: KeyboardEvent) {
  // Keeps the keystroke away from the global shortcut that resets the selection.
  event.stopPropagation()
  draft.value = props.attribute.value
}
</script>

<template>
  <div class="repeat-count">
    <SegmentedControl v-model="mode" :options="MODE_OPTIONS" label="Repeat count mode" />

    <p v-if="repeatsForever" class="repeat-count__note">Repeats until the document stops.</p>

    <AxisControl
      v-else-if="count != null"
      :value="count"
      :default-min="REPEAT_COUNT_RANGE.min"
      :default-max="REPEAT_COUNT_RANGE.max"
      :default-step="REPEAT_COUNT_RANGE.step"
      :fixed-min="0"
      @update="onAxisUpdate"
    />

    <input
      v-else
      :id="fieldId"
      v-model="draft"
      type="text"
      class="input repeat-count__text"
      :aria-label="`${attribute.attrName} value`"
      spellcheck="false"
      @change="commitDraft"
      @keydown.enter="commitDraft"
      @keydown.escape="onEscape"
    />
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.repeat-count {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__text {
    width: 100%;
    font-family: $font-mono;
    font-size: 0.8125rem;
  }

  &__note {
    margin: 0;
    font-size: 0.6875rem;
    color: $color-text-muted;
  }
}
</style>
