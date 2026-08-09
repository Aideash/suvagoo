<script setup lang="ts">
import { computed } from "vue";
import DOMPurify from "dompurify";

const props = withDefaults(
  defineProps<{
    content: string;
    emptyMessage?: string;
  }>(),
  {
    emptyMessage: "Nothing to preview",
  }
);

const sanitized = computed(() => {
  if (!props.content.trim()) return "";
  return DOMPurify.sanitize(props.content, { USE_PROFILES: { svg: true } });
});
</script>

<template>
  <div class="svg-preview">
    <div v-if="sanitized" class="svg-preview__content" v-html="sanitized" />
    <p v-else class="svg-preview__empty">{{ emptyMessage }}</p>
  </div>
</template>

<style scoped lang="scss">
@use "../styles/variables" as *;

.svg-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 120px;
  background: repeating-conic-gradient(
      color-mix(in srgb, var(--bg-hover) 80%, var(--bg)) 0% 25%,
      var(--bg-hover) 0% 50%
    )
    50% / 20px 20px;
  border-radius: $radius-md;
  overflow: hidden;

  &__content {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: $spacing-md;

    :deep(svg) {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
    }
  }

  &__empty {
    margin: 0;
    color: $color-text-muted;
    font-size: 0.875rem;
  }
}
</style>
