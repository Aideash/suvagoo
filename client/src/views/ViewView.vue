<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { getSvg, type SvgRecord } from "../api/svgs";
import SvgPreview from "../components/SvgPreview.vue";
import ThemePicker from "../components/ThemePicker.vue";

const route = useRoute();
const svg = ref<SvgRecord | null>(null);
const loading = ref(true);
const error = ref("");

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

onMounted(async () => {
  loading.value = true;
  error.value = "";
  try {
    svg.value = await getSvg(route.params.id as string);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load SVG";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="view-view">
    <header class="page-header">
      <div class="view-view__header-left">
        <RouterLink to="/" class="btn btn--secondary">← All SVGs</RouterLink>
        <h1 v-if="svg">{{ svg.name }}</h1>
        <h1 v-else>SVG</h1>
      </div>
      <div class="page-header__actions">
        <RouterLink
          v-if="svg"
          :to="{ name: 'edit', params: { id: svg.id } }"
          class="btn btn--primary"
        >
          Edit
        </RouterLink>
        <ThemePicker />
      </div>
    </header>

    <main class="view-view__content">
      <p v-if="loading" class="empty-state">Loading…</p>
      <p v-else-if="error" class="error-banner">{{ error }}</p>

      <template v-else-if="svg">
        <p class="view-view__meta">
          Updated {{ formatDate(svg.updatedAt) }}
        </p>
        <div class="view-view__preview">
          <SvgPreview :content="svg.content" />
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped lang="scss">
@use "../styles/variables" as *;

.view-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;

  &__header-left {
    display: flex;
    align-items: center;
    gap: $spacing-md;

    h1 {
      margin: 0;
      font-size: 1.25rem;
    }
  }

  &__content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: $spacing-xl;
    max-width: 900px;
    margin: 0 auto;
    width: 100%;
  }

  &__meta {
    margin: 0 0 $spacing-md;
    font-size: 0.875rem;
    color: $color-text-muted;
  }

  &__preview {
    flex: 1;
    min-height: 400px;

    :deep(.svg-preview) {
      min-height: 400px;
      border: 1px solid $color-border;
    }
  }
}
</style>
