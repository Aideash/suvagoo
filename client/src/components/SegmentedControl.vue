<script setup lang="ts" generic="T extends string">
export interface SegmentOption<V extends string> {
  value: V
  label: string
  /** Offered but not selectable; the title should say why. */
  disabled?: boolean
  title?: string
}

defineProps<{
  modelValue: T
  options: readonly SegmentOption<T>[]
  label?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: T]
}>()
</script>

<template>
  <div class="segmented" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="segmented__option"
      :class="{ 'segmented__option--selected': modelValue === option.value }"
      :aria-pressed="modelValue === option.value"
      :disabled="option.disabled"
      :title="option.title"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.segmented {
  display: flex;
  gap: $spacing-xs;

  &__option {
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
      color 0.12s;

    &:hover:not(:disabled) {
      border-color: $color-accent;
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    &--selected {
      border-color: $color-accent;
      background: color-mix(in srgb, $color-accent 12%, $color-bg);
      color: $color-accent;
    }
  }
}
</style>
