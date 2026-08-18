<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getAttributeSchema } from '../lib/attributeSchema'
import { resolveAnimationTarget } from '../lib/animationAttribute'
import type { AttributeContext } from '../lib/svgDocument'
import ValueSuggestInput from './ValueSuggestInput.vue'

const props = defineProps<{
  attribute: AttributeContext
  content: string
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

interface TargetSuggestion {
  key: string
  name: string
  kind: string
}

const draft = ref(props.attribute.value)
const input = ref<{ setCaret: (offset: number) => void }>()

watch(
  () => props.attribute.value,
  (value) => {
    draft.value = value
  },
)

const target = computed(() => resolveAnimationTarget(props.content, props.attribute.path))

const suggestions = computed<TargetSuggestion[]>(() => {
  const resolved = target.value
  if (!resolved) return []

  // A settled value would otherwise narrow the list to itself, leaving nothing
  // to switch to when the input is clicked open.
  const needle = draft.value.trim()
  const filtering = needle && !resolved.attributes.includes(needle)

  return resolved.attributes
    .filter((name) => !filtering || name.toLowerCase().includes(needle.toLowerCase()))
    .map((name) => ({
      key: name,
      name,
      kind: getAttributeSchema(name, resolved.tagName).kind,
    }))
})

/** The name is spelled out on the parent but is not something SMIL can drive. */
const unknownTarget = computed(() => {
  const resolved = target.value
  const value = props.attribute.value.trim()
  if (!resolved || !value) return false
  return !resolved.attributes.includes(value)
})

function applySuggestion(suggestion: TargetSuggestion) {
  draft.value = suggestion.name
  emit('update', suggestion.name)
  input.value?.setCaret(suggestion.name.length)
}

function commitDraft() {
  if (draft.value !== props.attribute.value) emit('update', draft.value)
}

function discardDraft() {
  draft.value = props.attribute.value
}
</script>

<template>
  <div class="animation-target">
    <p v-if="target" class="animation-target__parent">
      Animating <code>&lt;{{ target.tagName }}&gt;</code>
    </p>

    <ValueSuggestInput
      ref="input"
      v-model="draft"
      :suggestions="suggestions"
      open-on-click
      :aria-label="`${attribute.attrName} value`"
      @commit="commitDraft"
      @discard="discardDraft"
      @select="applySuggestion"
    >
      <template #option="{ suggestion }">
        <span class="animation-target__name">{{ suggestion.name }}</span>
        <span class="animation-target__kind">{{ suggestion.kind }}</span>
      </template>
    </ValueSuggestInput>

    <p v-if="unknownTarget" class="animation-target__warn" role="status">
      Not an attribute of <code>&lt;{{ target?.tagName }}&gt;</code>
    </p>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.animation-target {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;

  &__parent {
    margin: 0;
    font-size: 0.75rem;
    color: $color-text-muted;

    code {
      font-family: $font-mono;
      color: $color-text;
    }
  }

  &__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__kind {
    color: var(--text-faint);
    font-size: 0.6875rem;
  }

  &__warn {
    margin: 0;
    font-size: 0.75rem;
    color: var(--amber);

    code {
      font-family: $font-mono;
    }
  }
}
</style>
