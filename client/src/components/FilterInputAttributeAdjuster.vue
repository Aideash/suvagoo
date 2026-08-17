<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  collectFilterInputOptions,
  suggestFilterInputs,
  type FilterInputOption,
} from '../lib/filterInputAttribute'
import type { AttributeContext } from '../lib/svgDocument'
import ValueSuggestInput from './ValueSuggestInput.vue'

const props = defineProps<{
  attribute: AttributeContext
  content: string
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const draft = ref(props.attribute.value)
const options = computed(() => collectFilterInputOptions(props.content, props.attribute.path))
const suggestions = computed(() => suggestFilterInputs(draft.value, options.value))

watch(
  () => props.attribute.value,
  (value) => {
    draft.value = value
  },
)

function commitDraft() {
  if (draft.value !== props.attribute.value) emit('update', draft.value)
}

function discardDraft() {
  draft.value = props.attribute.value
}

function applySuggestion(suggestion: FilterInputOption) {
  draft.value = suggestion.value
  emit('update', suggestion.value)
}
</script>

<template>
  <div class="filter-input-adjuster">
    <ValueSuggestInput
      v-model="draft"
      :suggestions="suggestions"
      :aria-label="`${attribute.attrName} filter input`"
      open-on-click
      @commit="commitDraft"
      @discard="discardDraft"
      @select="applySuggestion"
    >
      <template #option="{ suggestion }">
        <span class="material-icons filter-input-adjuster__icon">
          {{ suggestion.kind === 'standard' ? 'input' : 'account_tree' }}
        </span>
        <span class="filter-input-adjuster__value">{{ suggestion.value }}</span>
        <span class="filter-input-adjuster__source">
          {{ suggestion.kind === 'standard' ? 'standard' : suggestion.tag }}
        </span>
      </template>
    </ValueSuggestInput>
    <p class="filter-input-adjuster__hint">
      Standard source or an earlier <code>result</code> in this filter
    </p>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.filter-input-adjuster {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;

  &__icon {
    flex-shrink: 0;
    font-size: 13px;
    color: $color-text-muted;
  }

  &__value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__source {
    margin-left: auto;
    padding-left: $spacing-xs;
    color: $color-text-muted;
    font-size: 0.6875rem;
    white-space: nowrap;
  }

  &__hint {
    margin: 0;
    color: $color-text-muted;
    font-size: 0.6875rem;

    code {
      font-family: $font-mono;
    }
  }
}
</style>
