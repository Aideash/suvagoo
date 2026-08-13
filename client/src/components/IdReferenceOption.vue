<script setup lang="ts">
defineProps<{
  id: string
  /** Element that defines the id, shown as a hint. */
  tag: string
}>()
</script>

<template>
  <span class="material-icons id-option__icon">tag</span>
  <span class="id-option__name">{{ id }}</span>
  <span class="id-option__tag">{{ tag }}</span>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.id-option {
  &__icon {
    flex-shrink: 0;
    font-size: 13px;
    color: $color-text-muted;
  }

  &__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__tag {
    margin-left: auto;
    padding-left: $spacing-xs;
    color: $color-text-muted;
    font-size: 0.6875rem;
    white-space: nowrap;
  }
}
</style>
