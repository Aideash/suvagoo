<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  /** Selectable units in display order; '' is the unitless option. */
  options: readonly string[]
  modelValue: string
  /** Names the value being measured, for the trigger tooltip. */
  label?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [unit: string]
}>()

const MENU_WIDTH = 88

const open = ref(false)
const trigger = ref<HTMLButtonElement>()
const menu = ref<HTMLElement>()
const menuStyle = ref<Record<string, string>>({})

/** Keep an unrecognised unit listed so the user can switch away from it. */
const unitOptions = computed(() =>
  props.options.includes(props.modelValue) ? props.options : [...props.options, props.modelValue],
)

const hasChoice = computed(() => unitOptions.value.length > 1)

function position() {
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect) return

  const margin = 8
  const left = Math.max(
    margin,
    Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - margin),
  )
  const below = window.innerHeight - rect.bottom - margin * 2
  const above = rect.top - margin * 2

  menuStyle.value =
    below < 120 && above > below
      ? {
          left: `${left}px`,
          bottom: `${window.innerHeight - rect.top + 4}px`,
          maxHeight: `${Math.max(96, above)}px`,
        }
      : {
          left: `${left}px`,
          top: `${rect.bottom + 4}px`,
          maxHeight: `${Math.max(96, below)}px`,
        }
}

function toggle() {
  open.value = !open.value
  if (!open.value) return
  nextTick(() => {
    position()
    menu.value?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
  })
}

function close(restoreFocus = false) {
  if (!open.value) return
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}

function select(unit: string) {
  close(true)
  if (unit !== props.modelValue) emit('update:modelValue', unit)
}

function onPointerDown(event: MouseEvent) {
  if (!open.value) return
  const target = event.target as Node
  if (trigger.value?.contains(target) || menu.value?.contains(target)) return
  close()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close(true)
}

function onScroll(event: Event) {
  if (!open.value || menu.value?.contains(event.target as Node)) return
  close()
}

function onResize() {
  close()
}

onMounted(() => {
  window.addEventListener('mousedown', onPointerDown, true)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onScroll, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onPointerDown, true)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onScroll, true)
})
</script>

<template>
  <span v-if="!hasChoice && modelValue" class="unit-select__static">{{ modelValue }}</span>

  <template v-else-if="hasChoice">
    <button
      ref="trigger"
      type="button"
      class="unit-select__trigger"
      :title="label ? `Unit for ${label}` : 'Unit'"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="unit-select__value">{{ modelValue }}</span>
      <span class="material-icons unit-select__caret">{{
        open ? 'expand_less' : 'expand_more'
      }}</span>
    </button>

    <Teleport to="body">
      <div v-if="open" ref="menu" class="unit-select__menu" role="listbox" :style="menuStyle">
        <button
          v-for="option in unitOptions"
          :key="option"
          type="button"
          role="option"
          class="unit-select__option"
          :class="{ 'unit-select__option--active': option === modelValue }"
          :aria-selected="option === modelValue"
          @click="select(option)"
        >
          {{ option || 'none' }}
        </button>
      </div>
    </Teleport>
  </template>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.unit-select {
  &__static,
  &__value {
    font-family: $font-mono;
    font-size: 0.6875rem;
    color: $color-text-muted;
  }

  &__trigger {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    padding: 0 2px;
    border: 1px solid transparent;
    border-radius: $radius-sm;
    background: transparent;
    cursor: pointer;

    &:hover,
    &[aria-expanded='true'] {
      background: $color-surface-hover;

      .unit-select__value,
      .unit-select__caret {
        color: $color-accent;
      }
    }
  }

  &__caret {
    font-size: 14px;
    vertical-align: 0;
    color: $color-text-muted;
  }

  &__menu {
    position: fixed;
    z-index: 200;
    display: flex;
    flex-direction: column;
    width: 88px;
    overflow: auto;
    padding: 4px;
    background: $color-surface;
    border: 1px solid var(--border-strong);
    border-radius: $radius-sm;
    box-shadow: 0 12px 32px var(--shadow);
  }

  &__option {
    width: 100%;
    padding: 3px $spacing-xs;
    border: 0;
    border-radius: $radius-sm;
    background: transparent;
    color: $color-text;
    font-family: $font-mono;
    font-size: 0.75rem;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: $color-surface-hover;
    }

    &--active {
      color: $color-accent;
    }
  }
}
</style>
