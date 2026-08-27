<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getAttributeSchema } from '../lib/attributeSchema'
import { handleListboxKeydown, optionTabIndex } from '../composables/listboxNavigation'
import {
  dashRole,
  formatDashArray,
  formatDashEntry,
  insertEntry,
  moveEntry,
  parseDashArray,
  patternReverses,
  removeEntry,
  updateEntry,
  type DashEntry,
} from '../lib/strokeDashArrayAttribute'
import { attributeIdentity, type AttributeContext } from '../lib/svgDocument'
import AxisControl from './AxisControl.vue'

const props = defineProps<{
  attribute: AttributeContext
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const textDraft = ref(props.attribute.value)
const isEditingText = ref(false)
const selectedIndex = ref<number | null>(null)

const units = computed(() => getAttributeSchema(props.attribute.attrName).units ?? [''])

const parsedEntries = computed(() => {
  if (isEditingText.value) return parseDashArray(props.attribute.value)
  return parseDashArray(textDraft.value) ?? parseDashArray(props.attribute.value)
})

const parseError = computed(() => {
  if (isEditingText.value) return false
  const trimmed = textDraft.value.trim()
  if (!trimmed) return false
  return parsedEntries.value === null
})

const entries = computed(() => parsedEntries.value ?? [])

const selectedEntry = computed(() => {
  if (selectedIndex.value == null) return null
  return entries.value[selectedIndex.value] ?? null
})

const selectedRole = computed(() =>
  selectedIndex.value == null ? null : dashRole(selectedIndex.value),
)

const reverses = computed(() => patternReverses(entries.value.length))

const previewSegments = computed(() => {
  const list = entries.value
  if (list.length === 0) return []

  const cycleCount = patternReverses(list.length) ? 2 : 1
  return Array.from({ length: list.length * cycleCount }, (_, visualIndex) => {
    const entryIndex = visualIndex % list.length
    const cycle = Math.floor(visualIndex / list.length)
    const entry = list[entryIndex]
    return {
      key: `${cycle}-${entryIndex}`,
      entry,
      entryIndex,
      cycle,
      role: dashRole(visualIndex),
      // Keep zero-length entries present as a tiny selectable target.
      weight: entry.number > 0 ? entry.number : 0.05,
    }
  })
})

function previewTabIndex(segmentIndex: number): number {
  const selected = selectedIndex.value ?? 0
  return previewSegments.value.findIndex((segment) => segment.entryIndex === selected) ===
    segmentIndex
    ? 0
    : -1
}

watch(
  () => props.attribute.value,
  (value) => {
    if (!isEditingText.value) {
      textDraft.value = value
    }
  },
)

watch(
  () => attributeIdentity(props.attribute),
  (identity, previous) => {
    if (previous !== undefined && identity === previous) return
    isEditingText.value = false
    textDraft.value = props.attribute.value
    selectedIndex.value = null
  },
  { immediate: true },
)

watch(
  parsedEntries,
  (list) => {
    if (!list) {
      selectedIndex.value = null
      return
    }
    if (selectedIndex.value != null && selectedIndex.value >= list.length) {
      selectedIndex.value = list.length > 0 ? list.length - 1 : null
    }
  },
  { immediate: true },
)

function commit(value: string) {
  textDraft.value = value
  emit('update', value)
}

function commitEntries(next: DashEntry[]) {
  commit(formatDashArray(next))
}

function selectEntry(index: number) {
  selectedIndex.value = index
}

function onTextInput(event: Event) {
  isEditingText.value = true
  textDraft.value = (event.target as HTMLInputElement).value
}

function commitText(input: HTMLInputElement) {
  isEditingText.value = false
  const value = input.value.trim()
  if (value === props.attribute.value) {
    revertText(input)
    return
  }
  commit(value)
}

function revertText(input: HTMLInputElement) {
  isEditingText.value = false
  textDraft.value = props.attribute.value
  input.value = props.attribute.value
}

function onTextEnter(event: KeyboardEvent) {
  commitText(event.target as HTMLInputElement)
}

function onTextBlur(event: FocusEvent) {
  commitText(event.target as HTMLInputElement)
}

function onTextEscape(event: KeyboardEvent) {
  // Keeps the keystroke away from the global shortcut that resets the selection.
  event.stopPropagation()
  revertText(event.target as HTMLInputElement)
}

function updateSelected(number: number, unit: string) {
  if (selectedIndex.value == null) return
  commitEntries(updateEntry(entries.value, selectedIndex.value, { number, unit }))
}

function addEntry() {
  const list = entries.value
  const template: DashEntry =
    selectedIndex.value != null && list[selectedIndex.value]
      ? { ...list[selectedIndex.value] }
      : list.length > 0
        ? { ...list[list.length - 1] }
        : { number: 2, unit: '' }
  const insertAt = selectedIndex.value != null ? selectedIndex.value + 1 : list.length
  commitEntries(insertEntry(list, insertAt, template))
  selectEntry(insertAt)
}

function seedEntries() {
  const seeded: DashEntry[] = [
    { number: 4, unit: '' },
    { number: 2, unit: '' },
  ]
  commitEntries(seeded)
  selectEntry(0)
}

function removeSelected() {
  const list = entries.value
  if (selectedIndex.value == null || list.length === 0) return
  const index = selectedIndex.value
  const next = removeEntry(list, index)
  commitEntries(next)
  const newIndex = Math.min(index, next.length - 1)
  selectedIndex.value = newIndex >= 0 ? newIndex : null
}

function moveSelected(delta: -1 | 1) {
  if (selectedIndex.value == null) return
  const from = selectedIndex.value
  const to = from + delta
  if (to < 0 || to >= entries.value.length) return
  commitEntries(moveEntry(entries.value, from, to))
  selectedIndex.value = to
}
</script>

<template>
  <div class="dash-adjuster">
    <input
      :value="textDraft"
      type="text"
      class="input dash-adjuster__text"
      spellcheck="false"
      placeholder="none"
      aria-label="stroke-dasharray value"
      @input="onTextInput"
      @keydown.enter="onTextEnter"
      @keydown.escape="onTextEscape"
      @blur="onTextBlur"
    />

    <p v-if="parseError" class="dash-adjuster__warn">
      Could not parse dash array — use non-negative numbers, optionally with units.
    </p>

    <template v-else-if="entries.length > 0">
      <div
        class="dash-adjuster__preview"
        role="listbox"
        aria-label="Dash pattern preview"
        @keydown="handleListboxKeydown($event, entries.length, selectedIndex, selectEntry)"
      >
        <button
          v-for="(segment, segmentIndex) in previewSegments"
          :key="segment.key"
          type="button"
          role="option"
          class="dash-adjuster__preview-segment"
          :class="{
            'dash-adjuster__preview-segment--dash': segment.role === 'dash',
            'dash-adjuster__preview-segment--space': segment.role === 'space',
            'dash-adjuster__preview-segment--repeat': segment.cycle > 0,
            'dash-adjuster__preview-segment--cycle-start':
              segment.cycle > 0 && segment.entryIndex === 0,
            'dash-adjuster__preview-segment--selected': selectedIndex === segment.entryIndex,
          }"
          :style="{ flexGrow: segment.weight }"
          :tabindex="previewTabIndex(segmentIndex)"
          :aria-selected="selectedIndex === segment.entryIndex"
          :aria-label="`${segment.role}, ${formatDashEntry(segment.entry)}${segment.cycle > 0 ? ', repeated cycle' : ''}`"
          :title="`${segment.role}: ${formatDashEntry(segment.entry)}`"
          @click="selectEntry(segment.entryIndex)"
        ></button>
      </div>

      <div
        class="dash-adjuster__chips"
        role="listbox"
        aria-label="Dash pattern entries"
        @keydown="handleListboxKeydown($event, entries.length, selectedIndex, selectEntry)"
      >
        <button
          v-for="(entry, index) in entries"
          :key="index"
          type="button"
          role="option"
          class="dash-adjuster__chip"
          :class="{
            'dash-adjuster__chip--dash': dashRole(index) === 'dash',
            'dash-adjuster__chip--space': dashRole(index) === 'space',
            'dash-adjuster__chip--selected': selectedIndex === index,
          }"
          :tabindex="optionTabIndex(index, selectedIndex)"
          :aria-selected="selectedIndex === index"
          @click="selectEntry(index)"
        >
          <span class="dash-adjuster__swatch" aria-hidden="true"></span>
          <!-- <span class="dash-adjuster__chip-role">{{ dashRole(index) }}</span> -->
          {{ formatDashEntry(entry) }}
        </button>
      </div>

      <div class="dash-adjuster__ops">
        <button
          type="button"
          class="dash-adjuster__op-btn"
          title="Add entry"
          aria-label="Add entry"
          @click="addEntry"
        >
          +
        </button>
        <button
          type="button"
          class="dash-adjuster__op-btn"
          title="Remove selected entry"
          aria-label="Remove selected entry"
          :disabled="selectedIndex == null || entries.length <= 1"
          @click="removeSelected"
        >
          −
        </button>
        <button
          type="button"
          class="dash-adjuster__op-btn"
          title="Move entry earlier"
          aria-label="Move entry earlier"
          :disabled="selectedIndex == null || selectedIndex <= 0"
          @click="moveSelected(-1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="dash-adjuster__op-btn"
          title="Move entry later"
          aria-label="Move entry later"
          :disabled="selectedIndex == null || selectedIndex >= entries.length - 1"
          @click="moveSelected(1)"
        >
          ↓
        </button>
      </div>

      <p class="dash-adjuster__parity" :class="{ 'dash-adjuster__parity--reverses': reverses }">
        <template v-if="reverses">
          Odd ({{ entries.length }}) — list repeats; dash/gap roles reverse each cycle
        </template>
        <template v-else> Even ({{ entries.length }}) — pattern period is stable </template>
      </p>

      <AxisControl
        v-if="selectedEntry"
        :label="selectedRole === 'space' ? 'Space' : 'Dash'"
        :value="selectedEntry.number"
        :unit="selectedEntry.unit"
        :units="units"
        :default-min="0"
        :default-max="20"
        :default-step="1"
        :fixed-min="0"
        @update="updateSelected"
      />
    </template>

    <div v-else class="dash-adjuster__empty">
      <p class="dash-adjuster__empty-note">No dashes (solid line).</p>
      <button
        type="button"
        class="dash-adjuster__op-btn"
        title="Add dashes"
        aria-label="Add dashes"
        @click="seedEntries"
      >
        Add dashes
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.dash-adjuster {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__text {
    width: 100%;
    font-family: $font-mono;
    font-size: 0.8125rem;
  }

  &__warn {
    margin: 0;
    font-size: 0.75rem;
    color: var(--red);
  }

  &__preview {
    display: flex;
    width: 100%;
    height: 20px;
    overflow: hidden;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: color-mix(in srgb, $color-text-muted 6%, $color-bg);
  }

  &__preview-segment {
    min-width: 2px;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    transition:
      filter 0.12s,
      opacity 0.12s,
      box-shadow 0.12s;

    &:hover {
      filter: brightness(1.2);
      box-shadow: inset 0 0 0 1px $color-accent;
    }

    &--dash {
      background: $color-accent;
    }

    &--space {
      background: color-mix(in srgb, $color-text-muted 10%, transparent);
    }

    &--repeat {
      opacity: 0.55;
    }

    &--cycle-start {
      border-left: 1px dashed $color-text-muted;
    }

    &--selected {
      box-shadow: inset 0 0 0 2px $color-text;
    }
  }

  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-xs;
  }

  &__chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.45rem;
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

  &__swatch {
    width: 12px;
    height: 3px;
    border-radius: 1px;
    flex-shrink: 0;
  }

  &__chip--dash &__swatch {
    background: $color-accent;
  }

  &__chip--space &__swatch {
    background: transparent;
    border: 1px dashed color-mix(in srgb, $color-text-muted 70%, transparent);
    height: 5px;
  }

  // &__chip-role {
  //   font-size: 0.625rem;
  //   font-weight: 600;
  //   text-transform: uppercase;
  //   letter-spacing: 0.03em;
  //   color: $color-text-muted;
  // }

  &__chip--space {
    color: $color-text-muted;
  }

  // &__chip--selected &__chip-role {
  //   color: $color-accent;
  // }

  &__ops {
    display: flex;
    gap: $spacing-xs;
  }

  &__op-btn {
    flex-shrink: 0;
    min-width: 28px;
    height: 28px;
    padding: 0 0.5rem;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: $color-bg;
    color: $color-text;
    font-size: 0.875rem;
    line-height: 1;
    cursor: pointer;
    transition:
      border-color 0.12s,
      background 0.12s,
      color 0.12s;

    &:hover:not(:disabled) {
      border-color: $color-accent;
    }

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }

  &__parity {
    margin: 0;
    font-size: 0.75rem;
    color: $color-text-muted;

    &--reverses {
      color: $color-accent;
    }
  }

  &__empty {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
    align-items: flex-start;
  }

  &__empty-note {
    margin: 0;
    font-size: 0.75rem;
    color: $color-text-muted;
  }
}
</style>
