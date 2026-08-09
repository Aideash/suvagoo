<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { deleteSvg, listSvgs, type SvgMeta } from '../api/svgs'
import SvgCard from '../components/SvgCard.vue'
import ThemePicker from '../components/ThemePicker.vue'

const svgs = ref<SvgMeta[]>([])
const loading = ref(true)
const error = ref('')

async function loadSvgs() {
  loading.value = true
  error.value = ''
  try {
    svgs.value = await listSvgs()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load SVGs'
  } finally {
    loading.value = false
  }
}

async function handleDelete(id: string) {
  const svg = svgs.value.find((s) => s.id === id)
  if (!svg) return

  const confirmed = window.confirm(`Delete "${svg.name}"?`)
  if (!confirmed) return

  try {
    await deleteSvg(id)
    svgs.value = svgs.value.filter((s) => s.id !== id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete SVG'
  }
}

onMounted(loadSvgs)
</script>

<template>
  <div class="list-view">
    <header class="page-header">
      <h1>Suvagoo</h1>
      <div class="page-header__actions">
        <RouterLink to="/edit" class="btn btn--primary">New SVG</RouterLink>
        <ThemePicker />
      </div>
    </header>

    <main class="page-content">
      <p v-if="loading" class="empty-state">Loading…</p>
      <p v-else-if="error" class="error-banner">{{ error }}</p>

      <div v-else-if="svgs.length === 0" class="empty-state">
        <p>No SVGs yet. Create your first one!</p>
        <RouterLink to="/edit" class="btn btn--primary">New SVG</RouterLink>
      </div>

      <div v-else class="svg-grid">
        <SvgCard v-for="svg in svgs" :key="svg.id" :svg="svg" @delete="handleDelete" />
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.svg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: $spacing-lg;
}
</style>
