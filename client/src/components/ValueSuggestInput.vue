<script setup lang="ts" generic="T extends { key: string }">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  modelValue: string
  /** Completions for the current value and caret, in display order. */
  suggestions: readonly T[]
  /** Open the available choices when the existing value is clicked. */
  openOnClick?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:caret': [caret: number]
  /** The user finished editing without picking a suggestion. */
  commit: []
  /** The user abandoned the edit, so the caller should restore its own value. */
  discard: []
  select: [suggestion: T]
}>()

const listboxId = useId()
const inputEl = ref<HTMLInputElement>()
const listbox = ref<HTMLElement>()
const listboxOpen = ref(false)
const activeIndex = ref(-1)
const listboxStyle = ref<Record<string, string>>({})

const showSuggestions = computed(() => listboxOpen.value && props.suggestions.length > 0)

watch(
  () => props.suggestions,
  () => {
    activeIndex.value = -1
    if (listboxOpen.value) nextTick(positionListbox)
  },
)

function syncCaret() {
  emit('update:caret', inputEl.value?.selectionStart ?? props.modelValue.length)
}

function onClick() {
  syncCaret()
  if (props.openOnClick) openListbox()
}

function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  emit('update:caret', input.selectionStart ?? input.value.length)
  emit('update:modelValue', input.value)
  openListbox()
}

function openListbox() {
  listboxOpen.value = true
  nextTick(positionListbox)
}

function closeListbox() {
  listboxOpen.value = false
  activeIndex.value = -1
}

function onBlur() {
  closeListbox()
}

/**
 * Fixed positioning keeps the list clear of the sidebar's scroll clipping, at
 * the cost of having to close it whenever the anchor can have moved.
 */
function positionListbox() {
  const rect = inputEl.value?.getBoundingClientRect()
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
  if (!props.suggestions.length) return
  if (!listboxOpen.value) {
    openListbox()
    activeIndex.value = delta > 0 ? 0 : props.suggestions.length - 1
    return
  }
  // Cycles through the options plus one slot for "nothing selected".
  const slots = props.suggestions.length + 1
  activeIndex.value = ((activeIndex.value + 1 + delta + slots) % slots) - 1
}

function applySuggestion(suggestion: T) {
  closeListbox()
  emit('select', suggestion)
  inputEl.value?.focus()
}

function onEnter() {
  const active = showSuggestions.value ? props.suggestions[activeIndex.value] : undefined
  if (active) {
    applySuggestion(active)
    return
  }
  closeListbox()
  emit('commit')
}

/**
 * Escape dismisses the suggestions first, so a second press is what abandons
 * the edit. Either way the keystroke stays out of the editor's global
 * shortcuts.
 */
function onEscape(event: KeyboardEvent) {
  event.stopPropagation()
  if (showSuggestions.value) {
    closeListbox()
    return
  }
  emit('discard')
}

function onPointerDown(event: MouseEvent) {
  if (!listboxOpen.value) return
  const target = event.target as Node
  if (inputEl.value?.contains(target) || listbox.value?.contains(target)) return
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

defineExpose({
  /** Places the caret after a completion the caller just applied. */
  setCaret(offset: number) {
    nextTick(() => {
      inputEl.value?.setSelectionRange(offset, offset)
    })
  },
})
</script>

<template>
  <input
    ref="inputEl"
    v-bind="$attrs"
    :value="modelValue"
    type="text"
    class="input value-suggest__input"
    spellcheck="false"
    autocomplete="off"
    role="combobox"
    aria-autocomplete="list"
    :aria-controls="listboxId"
    :aria-expanded="showSuggestions"
    :aria-activedescendant="
      showSuggestions && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
    "
    @input="onInput"
    @click="onClick"
    @keyup="syncCaret"
    @blur="onBlur"
    @change="emit('commit')"
    @keydown.down.prevent="moveActive(1)"
    @keydown.up.prevent="moveActive(-1)"
    @keydown.enter.prevent="onEnter"
    @keydown.escape="onEscape"
    @keydown.tab="closeListbox"
  />

  <Teleport to="body">
    <div
      v-if="showSuggestions"
      :id="listboxId"
      ref="listbox"
      class="value-suggest__listbox"
      role="listbox"
      :style="listboxStyle"
    >
      <button
        v-for="(suggestion, index) in suggestions"
        :id="`${listboxId}-${index}`"
        :key="suggestion.key"
        type="button"
        role="option"
        class="value-suggest__option"
        :class="{ 'value-suggest__option--active': index === activeIndex }"
        :aria-selected="index === activeIndex"
        @mousedown.prevent
        @click="applySuggestion(suggestion)"
      >
        <slot name="option" :suggestion="suggestion" :index="index">{{ suggestion.key }}</slot>
      </button>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.value-suggest {
  &__input {
    width: 100%;
    min-width: 0;
    font-family: $font-mono;
    font-size: 0.8125rem;
  }

  &__listbox {
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

  &__option {
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
}
</style>
