<script setup lang="ts">
import { ref } from 'vue'
import type { SvgMeta } from '../api/svgs'
import { getSvg } from '../api/svgs'
import SvgPreview from './SvgPreview.vue'

defineProps<{
  svg: SvgMeta
  collectionName?: string | null
}>()

const emit = defineEmits<{
  delete: [id: string]
}>()

const previewContent = ref('')

async function loadPreview(id: string) {
  try {
    const record = await getSvg(id)
    previewContent.value = record.content
  } catch {
    previewContent.value = ''
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
</script>

<template>
  <article class="svg-card">
    <RouterLink
      :to="{ name: 'view', params: { id: svg.id } }"
      class="svg-card__preview-link"
      :aria-label="`Preview of ${svg.name}`"
      @mouseenter="loadPreview(svg.id)"
      @focusin="loadPreview(svg.id)"
    >
      <SvgPreview :content="previewContent" empty-message="Hover to preview" isolate />
    </RouterLink>

    <div class="svg-card__body">
      <h2 class="svg-card__title">
        <RouterLink :to="{ name: 'view', params: { id: svg.id } }">
          {{ svg.name }}
        </RouterLink>
        <span v-if="collectionName" class="svg-card__folder"> — {{ collectionName }}</span>
      </h2>
      <p class="svg-card__date">Updated {{ formatDate(svg.updatedAt) }}</p>

      <div class="svg-card__actions">
        <RouterLink :to="{ name: 'view', params: { id: svg.id } }" class="btn btn--secondary">
          View
        </RouterLink>
        <RouterLink :to="{ name: 'edit', params: { id: svg.id } }" class="btn btn--secondary">
          Edit
        </RouterLink>
        <button type="button" class="btn btn--danger" @click="emit('delete', svg.id)">
          Delete
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.svg-card {
  background: $color-surface;
  border: 1px solid $color-border;
  border-radius: $radius-lg;
  overflow: hidden;
  transition: border-color 0.15s;

  &:hover {
    border-color: var(--border-strong);
  }

  &__preview-link {
    display: block;
    height: 160px;
    color: inherit;
    text-decoration: none;
    border-radius: 14px 14px 0 0;

    &:focus-visible {
      outline-offset: -2px;
    }
  }

  &__body {
    padding: $spacing-md;
  }

  &__title {
    margin: 0 0 $spacing-xs;
    font-size: 1rem;
    font-weight: 600;

    a {
      color: $color-text;
      text-decoration: none;

      &:hover {
        color: $color-accent;
      }
    }
  }

  &__folder {
    font-weight: 400;
    color: var(--text-faint);
  }

  &__date {
    margin: 0 0 $spacing-md;
    font-size: 0.8125rem;
    color: $color-text-muted;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-sm;
  }
}
</style>
