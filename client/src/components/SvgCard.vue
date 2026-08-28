<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { SvgMeta } from '../api/svgs'
import { getSvgMarkup } from '../api/svgs'
import SvgPreview from './SvgPreview.vue'

const props = withDefaults(
  defineProps<{
    svg: SvgMeta
    collectionName?: string | null
    showFolder?: boolean
  }>(),
  { collectionName: null, showFolder: true },
)

const emit = defineEmits<{
  delete: [id: string]
}>()

const cardRef = ref<HTMLElement | null>(null)
const previewContent = ref('')
const previewFailed = ref(false)

let observer: IntersectionObserver | null = null

async function loadPreview() {
  if (previewContent.value || previewFailed.value) return
  try {
    previewContent.value = await getSvgMarkup(props.svg.id)
  } catch {
    previewFailed.value = true
  }
}

onMounted(() => {
  const el = cardRef.value
  if (!el) return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadPreview()
        observer?.disconnect()
        observer = null
      }
    },
    { rootMargin: '120px' },
  )
  observer.observe(el)
})

onBeforeUnmount(() => {
  observer?.disconnect()
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const emptyMessage = computed(() => (previewFailed.value ? 'Preview unavailable' : 'Loading…'))
</script>

<template>
  <article ref="cardRef" class="svg-card">
    <div class="svg-card__preview">
      <SvgPreview :content="previewContent" :empty-message="emptyMessage" isolate />
    </div>

    <div class="svg-card__body">
      <h2 class="svg-card__title">
        <RouterLink
          :to="{ name: 'edit', params: { id: svg.id } }"
          class="svg-card__link"
          :title="`Edit ${svg.name}`"
        >
          <span class="visually-hidden">Edit </span>{{ svg.name }}
        </RouterLink>
      </h2>
      <p class="svg-card__meta">
        <span v-if="showFolder && collectionName" class="svg-card__folder">{{
          collectionName
        }}</span>
        <span class="svg-card__date">Updated {{ formatDate(svg.updatedAt) }}</span>
      </p>
    </div>

    <div class="svg-card__actions">
      <RouterLink
        :to="{ name: 'view', params: { id: svg.id } }"
        class="btn btn--secondary btn--icon"
        :title="`View ${svg.name}`"
        :aria-label="`View ${svg.name}`"
      >
        <span class="material-icons sm" aria-hidden="true">visibility</span>
      </RouterLink>
      <button
        type="button"
        class="btn btn--danger btn--icon"
        :title="`Delete ${svg.name}`"
        :aria-label="`Delete ${svg.name}`"
        @click="emit('delete', svg.id)"
      >
        <span class="material-icons sm" aria-hidden="true">delete</span>
      </button>
    </div>
  </article>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.svg-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: $color-surface;
  border: 1px solid $color-border;
  border-radius: $radius-lg;
  overflow: hidden;
  transition: border-color 0.15s;

  &:hover {
    border-color: var(--border-strong);
  }

  &:has(.svg-card__link:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  &__preview {
    height: 200px;
    pointer-events: none;
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
    padding: $spacing-md;
    padding-right: 5.5rem;
    min-width: 0;
  }

  &__title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  &__link {
    color: $color-text;
    text-decoration: none;

    &::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 1;
    }

    &:hover,
    .svg-card:hover & {
      color: $color-accent;
    }

    &:focus-visible {
      outline: none;
    }
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: $spacing-xs $spacing-sm;
    margin: 0;
    font-size: 0.8125rem;
    color: $color-text-muted;
  }

  &__folder {
    color: var(--text-faint);
  }

  &__actions {
    position: absolute;
    z-index: 2;
    right: $spacing-md;
    bottom: $spacing-md;
    display: flex;
    gap: $spacing-sm;
  }
}
</style>
