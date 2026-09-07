<script setup lang="ts">
import { computed } from 'vue'
import type { DefsPreviewModel } from '../lib/defsPreview'
import { sanitizeSvgMarkup } from '../lib/previewMarkup'
import SvgMarkupHost from './SvgMarkupHost.vue'

const props = defineProps<{
  preview: DefsPreviewModel
}>()

const entries = computed(() =>
  props.preview.entries.map((entry) => ({
    ...entry,
    sanitized: sanitizeSvgMarkup(entry.content),
  })),
)

const sampleCss = `
  svg { max-height: 320px; }
  .suvagoo-sample-backdrop { fill: color-mix(in srgb, var(--bg-hover) 65%, var(--bg)); }
  .suvagoo-sample-primary { fill: var(--accent); }
  .suvagoo-sample-secondary { fill: var(--text); }
  .suvagoo-sample-outline { stroke: var(--border-strong); }
  .suvagoo-sample-stroke { stroke: var(--accent); }
`
</script>

<template>
  <div class="defs-preview">
    <p v-if="entries.length === 0" class="defs-preview__empty">
      This &lt;defs&gt; element has no resources to preview.
    </p>

    <div
      v-else
      class="defs-preview__grid"
      :class="{ 'defs-preview__grid--single': preview.mode === 'resource' }"
    >
      <article v-for="entry in entries" :key="entry.key" class="defs-preview__card">
        <header class="defs-preview__label">{{ entry.label }}</header>
        <SvgMarkupHost
          v-if="entry.sanitized"
          class="defs-preview__artwork"
          :markup="entry.sanitized"
          :content-css="sampleCss"
          mode="fill"
        />
        <p v-else class="defs-preview__unsupported">
          &lt;{{ entry.tag }}&gt; does not have a standalone preview.
        </p>
      </article>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.defs-preview {
  width: 100%;
  height: 100%;
  padding: $spacing-md;
  overflow: auto;
  background: $color-bg;
  border-radius: $radius-md;

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
    gap: $spacing-md;
    min-height: 100%;

    &--single {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  &__card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 180px;
    overflow: hidden;
    border: 1px solid $color-border;
    border-radius: $radius-md;
    background: $color-surface;
    box-shadow: 0 4px 12px var(--shadow);
  }

  &__label {
    padding: $spacing-sm $spacing-md;
    overflow: hidden;
    border-bottom: 1px solid $color-border;
    color: $color-text-muted;
    font-family: $font-mono;
    font-size: 0.75rem;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__artwork {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: 140px;
    padding: $spacing-sm;
    background: repeating-conic-gradient(
        color-mix(in srgb, var(--bg-hover) 80%, var(--bg)) 0% 25%,
        var(--bg-hover) 0% 50%
      )
      50% / 16px 16px;

    :deep(svg) {
      display: block;
      width: 100%;
      height: 100%;
      max-height: 320px;
    }

    :deep(.suvagoo-sample-backdrop) {
      fill: color-mix(in srgb, var(--bg-hover) 65%, var(--bg));
    }

    :deep(.suvagoo-sample-primary) {
      fill: $color-accent;
    }

    :deep(.suvagoo-sample-secondary) {
      fill: $color-text;
    }

    :deep(.suvagoo-sample-outline) {
      stroke: var(--border-strong);
    }

    :deep(.suvagoo-sample-stroke) {
      stroke: $color-accent;
    }
  }

  &__empty,
  &__unsupported {
    display: grid;
    flex: 1;
    place-items: center;
    min-height: 140px;
    margin: 0;
    padding: $spacing-lg;
    color: $color-text-muted;
    font-size: 0.8125rem;
    text-align: center;
  }

  &__empty {
    height: 100%;
  }
}
</style>
