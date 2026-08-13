<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { formatColor, parseColor, parseColorAlpha, parseColorToHex } from '../lib/attributeSchema'
import { COLOR_KEYWORDS, suggestColorValues } from '../lib/cssColorNames'
import type { AttributeContext } from '../lib/svgDocument'

const props = defineProps<{
  attribute: AttributeContext
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const SUGGESTION_LIMIT = 5

const listboxId = useId()
const draft = ref(props.attribute.value)
const textInput = ref<HTMLInputElement>()
const listbox = ref<HTMLElement>()
const listboxOpen = ref(false)
const activeIndex = ref(-1)
const listboxStyle = ref<Record<string, string>>({})

watch(
  () => props.attribute.value,
  (value) => {
    draft.value = value
  },
)

const colorHex = computed({
  get() {
    return parseColorToHex(draft.value) ?? '#000000'
  },
  set(hex: string) {
    const parsed = parseColor(draft.value)
    const rgb = parseColor(hex)
    if (!rgb) return
    commit(
      formatColor({
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        a: parsed?.a ?? 1,
      }),
    )
  },
})

const colorAlpha = computed({
  get() {
    return parseColorAlpha(draft.value)
  },
  set(next: number) {
    const parsed = parseColor(draft.value)
    if (!parsed) return
    commit(formatColor({ ...parsed, a: next }))
  },
})

const colorAlphaPercent = computed({
  get() {
    return Math.round(colorAlpha.value * 100)
  },
  set(next: number) {
    colorAlpha.value = next / 100
  },
})

const showColorAlpha = computed(() => parseColor(draft.value) != null)

const suggestions = computed(() =>
  suggestColorValues(draft.value, SUGGESTION_LIMIT).map((value) => ({
    value,
    swatch: parseColorToHex(value),
  })),
)
const showSuggestions = computed(() => listboxOpen.value && suggestions.value.length > 0)

watch(suggestions, () => {
  activeIndex.value = -1
  if (listboxOpen.value) nextTick(positionListbox)
})

function isKeywordActive(keyword: string): boolean {
  return draft.value.trim().toLowerCase() === keyword.toLowerCase()
}

function commit(value: string) {
  draft.value = value
  emit('update', value)
}

function commitDraft() {
  if (draft.value !== props.attribute.value) {
    emit('update', draft.value)
  }
}

function applyKeyword(keyword: string) {
  closeListbox()
  commit(keyword)
}

function applySuggestion(value: string) {
  closeListbox()
  commit(value)
  textInput.value?.focus()
}

function openListbox() {
  listboxOpen.value = true
  nextTick(positionListbox)
}

function closeListbox() {
  listboxOpen.value = false
  activeIndex.value = -1
}

/**
 * Fixed positioning keeps the list clear of the sidebar's scroll clipping, at
 * the cost of having to close it whenever the anchor can have moved.
 */
function positionListbox() {
  const rect = textInput.value?.getBoundingClientRect()
  if (!rect) return

  const margin = 8
  const below = window.innerHeight - rect.bottom - margin
  const above = rect.top - margin

  listboxStyle.value = {
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    ...(below < 140 && above > below
      ? { bottom: `${window.innerHeight - rect.top + 4}px`, maxHeight: `${above}px` }
      : { top: `${rect.bottom + 4}px`, maxHeight: `${below}px` }),
  }
}

function moveActive(delta: number) {
  if (!suggestions.value.length) return
  if (!listboxOpen.value) {
    openListbox()
    activeIndex.value = delta > 0 ? 0 : suggestions.value.length - 1
    return
  }
  // Cycles through the options plus one slot for "nothing selected".
  const slots = suggestions.value.length + 1
  activeIndex.value = ((activeIndex.value + 1 + delta + slots) % slots) - 1
}

function onEnter() {
  const active = showSuggestions.value ? suggestions.value[activeIndex.value] : undefined
  if (active) {
    applySuggestion(active.value)
    return
  }
  closeListbox()
  commitDraft()
}

function onEscape(event: KeyboardEvent) {
  if (!showSuggestions.value) return
  event.stopPropagation()
  closeListbox()
}

function onPointerDown(event: MouseEvent) {
  if (!listboxOpen.value) return
  const target = event.target as Node
  if (textInput.value?.contains(target) || listbox.value?.contains(target)) return
  closeListbox()
}

function onScroll(event: Event) {
  if (!listboxOpen.value || listbox.value?.contains(event.target as Node)) return
  closeListbox()
}

onMounted(() => {
  window.addEventListener('mousedown', onPointerDown, true)
  window.addEventListener('resize', closeListbox)
  window.addEventListener('scroll', onScroll, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onPointerDown, true)
  window.removeEventListener('resize', closeListbox)
  window.removeEventListener('scroll', onScroll, true)
})
</script>

<template>
  <div class="color-adjuster">
    <div class="color-adjuster__keywords" role="group" aria-label="Color keywords">
      <button
        v-for="keyword in COLOR_KEYWORDS"
        :key="keyword"
        type="button"
        class="color-adjuster__pill"
        :class="{ 'color-adjuster__pill--selected': isKeywordActive(keyword) }"
        :aria-pressed="isKeywordActive(keyword)"
        @click="applyKeyword(keyword)"
      >
        {{ keyword }}
      </button>
    </div>

    <div class="color-adjuster__row">
      <input
        v-model="colorHex"
        type="color"
        class="color-adjuster__picker"
        :title="`Pick color for ${attribute.attrName}`"
      />
      <input
        ref="textInput"
        v-model="draft"
        type="text"
        class="input color-adjuster__text"
        spellcheck="false"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        :aria-controls="listboxId"
        :aria-expanded="showSuggestions"
        :aria-activedescendant="
          showSuggestions && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
        "
        @input="openListbox"
        @blur="closeListbox"
        @change="commitDraft"
        @keydown.down.prevent="moveActive(1)"
        @keydown.up.prevent="moveActive(-1)"
        @keydown.enter.prevent="onEnter"
        @keydown.esc="onEscape"
        @keydown.tab="closeListbox"
      />
    </div>

    <label v-if="showColorAlpha" class="color-adjuster__alpha-row">
      <span class="color-adjuster__alpha-label">Alpha</span>
      <input
        v-model.number="colorAlpha"
        type="range"
        class="color-adjuster__slider"
        min="0"
        max="1"
        step="0.01"
      />
      <input
        v-model.number="colorAlphaPercent"
        type="number"
        class="input color-adjuster__alpha-number"
        min="0"
        max="100"
        step="1"
      />
      <span class="color-adjuster__alpha-unit">%</span>
    </label>

    <Teleport to="body">
      <div
        v-if="showSuggestions"
        :id="listboxId"
        ref="listbox"
        class="color-adjuster__suggestions"
        role="listbox"
        :style="listboxStyle"
      >
        <button
          v-for="(suggestion, index) in suggestions"
          :id="`${listboxId}-${index}`"
          :key="suggestion.value"
          type="button"
          role="option"
          class="color-adjuster__suggestion"
          :class="{ 'color-adjuster__suggestion--active': index === activeIndex }"
          :aria-selected="index === activeIndex"
          @mousedown.prevent
          @click="applySuggestion(suggestion.value)"
        >
          <span
            class="color-adjuster__swatch"
            :class="{ 'color-adjuster__swatch--empty': !suggestion.swatch }"
            :style="suggestion.swatch ? { background: suggestion.swatch } : undefined"
          />
          <span class="color-adjuster__suggestion-name">{{ suggestion.value }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.color-adjuster {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__row {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
  }

  &__picker {
    flex-shrink: 0;
    width: 36px;
    height: 28px;
    padding: 2px;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: $color-bg;
    cursor: pointer;

    &::-webkit-color-swatch-wrapper {
      padding: 0;
    }

    &::-webkit-color-swatch {
      border: 0;
      border-radius: 2px;
    }
  }

  &__text {
    width: 100%;
    min-width: 0;
    font-family: $font-mono;
    font-size: 0.8125rem;
  }

  &__keywords {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-xs;
  }

  &__pill {
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.55rem;
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

  &__alpha-row {
    display: grid;
    grid-template-columns: auto 1fr 3.5rem auto;
    align-items: center;
    gap: $spacing-xs;
  }

  &__alpha-label {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $color-text-muted;
  }

  &__slider {
    min-width: 0;
    width: 100%;
    accent-color: $color-accent;
  }

  &__alpha-number {
    width: 100%;
    padding-right: 0;
    font-family: $font-mono;
    font-size: 0.75rem;
    text-align: right;
  }

  &__alpha-unit {
    font-size: 0.75rem;
    color: $color-text-muted;
  }

  &__suggestions {
    position: fixed;
    z-index: 200;
    display: flex;
    flex-direction: column;
    overflow: auto;
    padding: 4px;
    background: $color-surface;
    border: 1px solid var(--border-strong);
    border-radius: $radius-sm;
    box-shadow: 0 12px 32px var(--shadow);
  }

  &__suggestion {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    width: 100%;
    padding: 3px $spacing-xs;
    border: 0;
    border-radius: $radius-sm;
    background: transparent;
    color: $color-text;
    font-family: $font-mono;
    font-size: 0.75rem;
    text-align: left;
    cursor: pointer;

    &:hover,
    &--active {
      background: $color-surface-hover;
    }
  }

  &__swatch {
    flex-shrink: 0;
    width: 12px;
    height: 12px;
    border: 1px solid $color-border;
    border-radius: 3px;

    &--empty {
      background: linear-gradient(
        to top right,
        transparent calc(50% - 1px),
        $color-text-muted calc(50% - 1px),
        $color-text-muted calc(50% + 1px),
        transparent calc(50% + 1px)
      );
    }
  }

  &__suggestion-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
