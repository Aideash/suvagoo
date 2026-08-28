<script setup lang="ts">
import { ref, watch } from 'vue'
import type { IndexedDocumentNode } from '../lib/svgDocument'

const props = defineProps<{
  node: IndexedDocumentNode
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const draft = ref(props.node.text ?? '')

watch(
  () => props.node.text,
  (text) => {
    draft.value = text ?? ''
  },
)

function commit() {
  emit('update', draft.value)
}

function discard() {
  draft.value = props.node.text ?? ''
}
</script>

<template>
  <section class="text-adjuster" aria-labelledby="text-adjuster-heading">
    <h3 id="text-adjuster-heading" class="text-adjuster__heading">Text</h3>
    <textarea
      v-model="draft"
      class="input text-adjuster__input"
      rows="3"
      aria-label="Element text"
      @keydown.escape.prevent="discard"
      @blur="commit"
    />
  </section>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.text-adjuster {
  padding-top: $spacing-sm;
  border-top: 1px solid $color-border;

  &__heading {
    margin: 0 0 $spacing-xs;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: $color-text-muted;
  }

  &__input {
    width: 100%;
    min-height: 4.5rem;
    resize: vertical;
    font-family: $font-mono;
    font-size: 0.8125rem;
    line-height: 1.4;
  }
}
</style>
