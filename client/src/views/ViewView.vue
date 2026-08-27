<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getSvg, type SvgRecord } from '../api/svgs'
import SegmentedControl from '../components/SegmentedControl.vue'
import SvgPreview from '../components/SvgPreview.vue'
import ThemePicker from '../components/ThemePicker.vue'
import { useTheme } from '../composables/useTheme'
import { parseColorToHex } from '../lib/attributeSchema'
import { getThemeToken } from '../themes/definitions'

const ICON_SIZE = 24
const SIZE_SLIDER_MIN = 8
const SIZE_SLIDER_MAX = 256
const SIZE_INPUT_MAX = 1024

type BackdropMode = 'checkered' | 'white' | 'black' | 'custom'
type SizePreset = 'full' | 'icon' | 'custom'

const SIZE_PRESET_OPTIONS = [
  { value: 'full' as const, label: 'Full' },
  { value: 'icon' as const, label: '24×24' },
  { value: 'custom' as const, label: 'Custom' },
]

const route = useRoute()
const svg = ref<SvgRecord | null>(null)
const loading = ref(true)
const error = ref('')

const { resolvedThemeId } = useTheme()
const themeText = computed(() => getThemeToken(resolvedThemeId.value, 'text'))

const backdropMode = ref<BackdropMode>('checkered')
const customBackdrop = ref('#808080')

const colorTouched = ref(false)
const customColor = ref('#000000')

const sizePreset = ref<SizePreset>('full')
const separateDimensions = ref(false)
const size = ref(ICON_SIZE)
const width = ref(ICON_SIZE)
const height = ref(ICON_SIZE)

const showSampleText = ref(false)
const sampleText = ref('Button')

const previewColor = computed(() => (colorTouched.value ? customColor.value : themeText.value))

const previewBackdrop = computed(() => {
  switch (backdropMode.value) {
    case 'white':
      return '#ffffff'
    case 'black':
      return '#000000'
    case 'custom':
      return customBackdrop.value
    case 'checkered':
    default:
      return 'checkered'
  }
})

const previewWidth = computed(() => {
  if (sizePreset.value === 'full') return undefined
  return separateDimensions.value ? width.value : size.value
})

const previewHeight = computed(() => {
  if (sizePreset.value === 'full') return undefined
  return separateDimensions.value ? height.value : size.value
})

watch(
  themeText,
  (value) => {
    if (!colorTouched.value) customColor.value = parseColorToHex(value) ?? value
  },
  { immediate: true },
)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function clampSize(n: number): number {
  if (!Number.isFinite(n)) return ICON_SIZE
  return Math.min(SIZE_INPUT_MAX, Math.max(1, Math.round(n)))
}

function setSizePreset(preset: SizePreset) {
  if (preset === 'icon') {
    separateDimensions.value = false
    size.value = ICON_SIZE
    width.value = ICON_SIZE
    height.value = ICON_SIZE
  }
  sizePreset.value = preset
}

function markCustomIfNeeded() {
  if (sizePreset.value === 'icon') sizePreset.value = 'custom'
}

function setUniformSize(n: number) {
  const next = clampSize(n)
  size.value = next
  width.value = next
  height.value = next
  if (next !== ICON_SIZE) markCustomIfNeeded()
}

function setWidth(n: number) {
  width.value = clampSize(n)
  markCustomIfNeeded()
}

function setHeight(n: number) {
  height.value = clampSize(n)
  markCustomIfNeeded()
}

function onSeparateChange(event: Event) {
  const enabled = (event.target as HTMLInputElement).checked
  separateDimensions.value = enabled
  if (enabled) {
    width.value = size.value
    height.value = size.value
    markCustomIfNeeded()
  } else {
    size.value = width.value
    height.value = width.value
  }
}

function onCustomBackdrop(event: Event) {
  customBackdrop.value = (event.target as HTMLInputElement).value
  backdropMode.value = 'custom'
}

function onColorInput(event: Event) {
  customColor.value = (event.target as HTMLInputElement).value
  colorTouched.value = true
}

function resetColor() {
  colorTouched.value = false
  customColor.value = parseColorToHex(themeText.value) ?? themeText.value
}

function numberFromEvent(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}

onMounted(async () => {
  loading.value = true
  error.value = ''
  try {
    svg.value = await getSvg(route.params.id as string)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load SVG'
  } finally {
    loading.value = false
  }
})

watch(
  () => svg.value?.name,
  (svgName) => {
    document.title = svgName ? `${svgName} — Suvagoo` : 'View SVG — Suvagoo'
  },
  { immediate: true },
)
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

    <main id="main-content" class="view-view__content">
      <p v-if="loading" class="empty-state" role="status">Loading…</p>
      <p v-else-if="error" class="error-banner" role="alert">{{ error }}</p>

      <template v-else-if="svg">
        <p class="view-view__meta">Updated {{ formatDate(svg.updatedAt) }}</p>

        <div class="view-view__stage">
          <section class="view-view__controls" aria-label="Preview settings">
            <div class="view-view__field">
              <span class="view-view__label">Background</span>
              <div class="view-view__swatches" role="group" aria-label="Preview background">
                <button
                  type="button"
                  class="view-view__swatch view-view__swatch--checkered"
                  :class="{ 'view-view__swatch--selected': backdropMode === 'checkered' }"
                  title="Transparent"
                  aria-label="Transparent background"
                  :aria-pressed="backdropMode === 'checkered'"
                  @click="backdropMode = 'checkered'"
                />
                <button
                  type="button"
                  class="view-view__swatch view-view__swatch--white"
                  :class="{ 'view-view__swatch--selected': backdropMode === 'white' }"
                  title="White"
                  aria-label="White background"
                  :aria-pressed="backdropMode === 'white'"
                  @click="backdropMode = 'white'"
                />
                <button
                  type="button"
                  class="view-view__swatch view-view__swatch--black"
                  :class="{ 'view-view__swatch--selected': backdropMode === 'black' }"
                  title="Black"
                  aria-label="Black background"
                  :aria-pressed="backdropMode === 'black'"
                  @click="backdropMode = 'black'"
                />
                <label
                  class="view-view__swatch view-view__swatch--custom"
                  :class="{ 'view-view__swatch--selected': backdropMode === 'custom' }"
                  title="Custom"
                  @click="backdropMode = 'custom'"
                >
                  <input
                    type="color"
                    :value="customBackdrop"
                    aria-label="Custom background color"
                    @input="onCustomBackdrop"
                  />
                </label>
              </div>
            </div>

            <div class="view-view__field">
              <span class="view-view__label">Color</span>
              <div class="view-view__color">
                <input
                  type="color"
                  class="view-view__picker"
                  :value="parseColorToHex(previewColor) ?? customColor"
                  title="currentColor"
                  aria-label="currentColor"
                  @input="onColorInput"
                />
                <span class="view-view__hint">currentColor</span>
                <button
                  v-if="colorTouched"
                  type="button"
                  class="ghost view-view__reset"
                  @click="resetColor"
                >
                  Reset
                </button>
              </div>
            </div>

            <div class="view-view__field view-view__field--size">
              <span class="view-view__label">Size</span>
              <div class="view-view__size">
                <SegmentedControl
                  :model-value="sizePreset"
                  :options="SIZE_PRESET_OPTIONS"
                  label="Preview size"
                  @update:model-value="setSizePreset"
                />

                <template v-if="sizePreset !== 'full'">
                  <label class="view-view__toggle">
                    <input
                      type="checkbox"
                      :checked="separateDimensions"
                      @change="onSeparateChange"
                    />
                    <span>Separate width / height</span>
                  </label>

                  <label class="view-view__slider-row">
                    <span>{{ separateDimensions ? 'Width' : 'Size' }}</span>
                    <input
                      type="range"
                      :min="SIZE_SLIDER_MIN"
                      :max="SIZE_SLIDER_MAX"
                      :value="separateDimensions ? width : size"
                      @input="
                        separateDimensions
                          ? setWidth(numberFromEvent($event))
                          : setUniformSize(numberFromEvent($event))
                      "
                    />
                    <input
                      type="number"
                      class="input view-view__size-number"
                      min="1"
                      :max="SIZE_INPUT_MAX"
                      :value="separateDimensions ? width : size"
                      @change="
                        separateDimensions
                          ? setWidth(numberFromEvent($event))
                          : setUniformSize(numberFromEvent($event))
                      "
                    />
                    <span class="view-view__unit">px</span>
                  </label>

                  <label v-if="separateDimensions" class="view-view__slider-row">
                    <span>Height</span>
                    <input
                      type="range"
                      :min="SIZE_SLIDER_MIN"
                      :max="SIZE_SLIDER_MAX"
                      :value="height"
                      @input="setHeight(numberFromEvent($event))"
                    />
                    <input
                      type="number"
                      class="input view-view__size-number"
                      min="1"
                      :max="SIZE_INPUT_MAX"
                      :value="height"
                      @change="setHeight(numberFromEvent($event))"
                    />
                    <span class="view-view__unit">px</span>
                  </label>
                </template>
              </div>
            </div>

            <div class="view-view__field view-view__field--sample">
              <span class="view-view__label">Sample text</span>
              <div class="view-view__sample">
                <label class="view-view__toggle">
                  <input v-model="showSampleText" type="checkbox" />
                  <span>Show beside the SVG</span>
                </label>
                <input
                  v-if="showSampleText"
                  v-model="sampleText"
                  type="text"
                  class="input view-view__sample-input"
                  placeholder="Button"
                  spellcheck="false"
                  aria-label="Sample text"
                />
                <p class="view-view__hint">Useful at 24×24, to see how the SVG sits in a button.</p>
              </div>
            </div>
          </section>

          <div class="view-view__preview">
            <SvgPreview
              :content="svg.content"
              :color="previewColor"
              :backdrop="previewBackdrop"
              :svg-width="previewWidth"
              :svg-height="previewHeight"
              :sample-text="showSampleText ? sampleText : null"
            />
          </div>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

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
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
    min-height: 0;
  }

  &__meta {
    flex-shrink: 0;
    margin: 0 0 $spacing-md;
    font-size: 0.875rem;
    color: $color-text-muted;
  }

  &__stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  &__controls {
    display: flex;
    flex-direction: column;
    gap: $spacing-md;
    padding: $spacing-md;
    background: $color-surface;
    border: 1px solid $color-border;
    border-radius: $radius-md $radius-md 0 0;
  }

  &__field {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: $spacing-xs;
  }

  &__label {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $color-text-muted;
  }

  &__swatches {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
  }

  &__swatch {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    cursor: pointer;
    overflow: hidden;

    &--checkered {
      background: repeating-conic-gradient(
          color-mix(in srgb, var(--bg-hover) 80%, var(--bg)) 0% 25%,
          var(--bg-hover) 0% 50%
        )
        50% / 8px 8px;
    }

    &--white {
      background: #ffffff;
    }

    &--black {
      background: #000000;
    }

    &--custom {
      display: block;
      background: $color-bg;

      input {
        display: block;
        width: 100%;
        height: 100%;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;

        &::-webkit-color-swatch-wrapper {
          padding: 0;
        }

        &::-webkit-color-swatch {
          border: 0;
        }
      }
    }

    &--selected {
      border-color: $color-accent;
      box-shadow: 0 0 0 2px color-mix(in srgb, $color-accent 35%, transparent);
    }
  }

  &__color {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
  }

  &__picker {
    flex-shrink: 0;
    width: 36px;
    height: 28px;
    padding: 2px;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: $color-bg;
    cursor: pointer;

    &::-webkit-color-swatch-wrapper {
      padding: 0;
    }

    &::-webkit-color-swatch {
      border: 0;
      border-radius: 2px;
    }
  }

  &__reset {
    font-size: 0.75rem;
  }

  &__size,
  &__sample {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: $spacing-sm;
    min-width: 0;
    width: 100%;
  }

  &__toggle {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    font-size: 0.8125rem;
    color: $color-text;
    cursor: pointer;
    user-select: none;

    input {
      accent-color: $color-accent;
    }
  }

  &__slider-row {
    display: grid;
    grid-template-columns: 3.5rem 1fr 3.75rem auto;
    align-items: center;
    gap: $spacing-sm;
    width: 100%;
    font-size: 0.75rem;
    color: $color-text-muted;

    input[type='range'] {
      width: 100%;
      min-width: 0;
      accent-color: $color-accent;
    }
  }

  &__size-number {
    width: 100%;
    padding: 0.2rem $spacing-xs;
    font-family: $font-mono;
    font-size: 0.75rem;
    text-align: right;
  }

  &__unit {
    font-size: 0.75rem;
    color: $color-text-muted;
  }

  &__sample-input {
    width: 100%;
  }

  &__hint {
    margin: 0;
    font-size: 0.75rem;
    color: $color-text-muted;
  }

  &__preview {
    flex: 1;
    min-height: 400px;
    min-width: 0;

    :deep(.svg-preview) {
      min-height: 400px;
      height: 100%;
      border: 1px solid $color-border;
      border-radius: 0 0 $radius-md $radius-md;
    }
  }

  @media (min-width: 750px) {
    height: 100vh;

    &__stage {
      flex-direction: row;
      align-items: stretch;
    }

    &__controls {
      flex: 0 0 18rem;
      width: 18rem;
      overflow-y: auto;
      border-radius: $radius-md 0 0 $radius-md;
    }

    &__preview {
      min-height: 0;

      :deep(.svg-preview) {
        border-radius: 0 $radius-md $radius-md 0;
        min-height: 0;
      }
    }
  }
}
</style>
