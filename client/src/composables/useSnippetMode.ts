import { computed, ref, watch } from 'vue'
import { DEFAULT_SNIPPET_MODE, type SnippetMode } from '../lib/svgSchema'

const STORAGE_KEY = 'suvagoo.snippet-mode'

function readCachedMode(): SnippetMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'tag-only' || stored === 'pre-filled') return stored
  } catch {
    // Private browsing and locked-down profiles can throw here.
  }
  return DEFAULT_SNIPPET_MODE
}

const snippetMode = ref<SnippetMode>(readCachedMode())

watch(snippetMode, (mode) => {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // A preference that does not survive a reload still beats a crash.
  }
})

/** Shared across the editor so the toggle and the insert both read one value. */
export function useSnippetMode() {
  return {
    snippetMode,
    isPreFilled: computed(() => snippetMode.value === 'pre-filled'),
    setSnippetMode(mode: SnippetMode) {
      snippetMode.value = mode
    },
    toggleSnippetMode() {
      snippetMode.value = snippetMode.value === 'pre-filled' ? 'tag-only' : 'pre-filled'
    },
  }
}
