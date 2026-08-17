import { ref, watch } from 'vue'

const STORAGE_KEY = 'suvagoo.autosave'

function readCached(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    // Private browsing and locked-down profiles can throw here.
  }
  return false
}

const autosaveEnabled = ref(readCached())

watch(autosaveEnabled, (enabled) => {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // A preference that does not survive a reload still beats a crash.
  }
})

/** Shared so the editor toggle preference survives navigation within the app. */
export function useAutosavePreference() {
  return {
    autosaveEnabled,
    setAutosaveEnabled(enabled: boolean) {
      autosaveEnabled.value = enabled
    },
    toggleAutosave() {
      autosaveEnabled.value = !autosaveEnabled.value
    },
  }
}
