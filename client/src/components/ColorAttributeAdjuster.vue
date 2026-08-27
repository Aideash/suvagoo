<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { formatColor, parseColor, parseColorAlpha, parseColorToHex } from '../lib/attributeSchema'
import { COLOR_KEYWORDS, suggestColorValues } from '../lib/cssColorNames'
import { suggestIdReferences, type DocumentId } from '../lib/idReferences'
import type { AttributeContext } from '../lib/svgDocument'
import IdReferenceOption from './IdReferenceOption.vue'
import ValueSuggestInput from './ValueSuggestInput.vue'

const props = defineProps<{
  attribute: AttributeContext
  /** Ids defined in the document, offered while typing `url(#…)`. */
  documentIds: readonly DocumentId[]
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const SUGGESTION_LIMIT = 5

interface ColorSuggestion {
  key: string
  label: string
  value: string
  swatch: string | null
  /** Set when the entry completes an id reference rather than a colour. */
  tag: string | null
  caret: number | null
}

const draft = ref(props.attribute.value)
const caret = ref(props.attribute.value.length)
const textInput = ref<{ setCaret: (offset: number) => void }>()

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

/** Id references win while the caret sits in a `url(#…)` token. */
const suggestions = computed<ColorSuggestion[]>(() => {
  const references = suggestIdReferences(
    draft.value,
    caret.value,
    props.documentIds,
    props.attribute.attrName,
    SUGGESTION_LIMIT,
  )
  if (references.length) {
    return references.map((reference) => ({
      key: reference.key,
      label: reference.id,
      value: reference.value,
      swatch: null,
      tag: reference.tag,
      caret: reference.caret,
    }))
  }

  return suggestColorValues(draft.value, SUGGESTION_LIMIT).map((value) => ({
    key: value,
    label: value,
    value,
    swatch: parseColorToHex(value),
    tag: null,
    caret: null,
  }))
})

function isKeywordActive(keyword: string): boolean {
  return draft.value.trim().toLowerCase() === keyword.toLowerCase()
}

function commit(value: string) {
  draft.value = value
  caret.value = value.length
  emit('update', value)
}

function commitDraft() {
  if (draft.value !== props.attribute.value) {
    emit('update', draft.value)
  }
}

function discardDraft() {
  draft.value = props.attribute.value
  caret.value = props.attribute.value.length
}

function applySuggestion(suggestion: ColorSuggestion) {
  draft.value = suggestion.value
  emit('update', suggestion.value)
  if (suggestion.caret == null) {
    caret.value = suggestion.value.length
    return
  }
  caret.value = suggestion.caret
  textInput.value?.setCaret(suggestion.caret)
}
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
        @click="commit(keyword)"
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
        :aria-label="`Pick color for ${attribute.attrName}`"
      />
      <ValueSuggestInput
        ref="textInput"
        v-model="draft"
        :suggestions="suggestions"
        :aria-label="`${attribute.attrName} value`"
        @update:caret="caret = $event"
        @commit="commitDraft"
        @discard="discardDraft"
        @select="applySuggestion"
      >
        <template #option="{ suggestion }">
          <IdReferenceOption v-if="suggestion.tag" :id="suggestion.label" :tag="suggestion.tag" />
          <template v-else>
            <span
              class="color-adjuster__swatch"
              :class="{ 'color-adjuster__swatch--empty': !suggestion.swatch }"
              :style="suggestion.swatch ? { background: suggestion.swatch } : undefined"
            />
            <span class="color-adjuster__suggestion-name">{{ suggestion.label }}</span>
          </template>
        </template>
      </ValueSuggestInput>
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
