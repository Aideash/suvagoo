<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useFocusTrap } from '../composables/useFocusTrap'

const props = withDefaults(
  defineProps<{
    title: string
    /** Panel width in pixels; the panel shrinks on narrow viewports. */
    width?: number
  }>(),
  { width: 420 },
)

const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLDivElement>()

function close() {
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    close()
  }
}

function onBackdropPointerDown(event: MouseEvent) {
  if (panel.value?.contains(event.target as Node)) return
  close()
}

// The dialog is only ever mounted while open, so the trap follows its lifecycle.
useFocusTrap(panel, { boundary: 'loop' })

onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <Teleport to="body">
    <div class="modal-dialog__backdrop" @mousedown="onBackdropPointerDown">
      <div
        ref="panel"
        class="modal-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="props.title"
        :style="{ width: `${props.width}px` }"
      >
        <header class="modal-dialog__header">
          <h2 class="modal-dialog__title">{{ props.title }}</h2>
          <button type="button" class="modal-dialog__close" title="Close" @click="close">
            <span class="material-icons sm">close</span>
          </button>
        </header>

        <div class="modal-dialog__body">
          <slot />
        </div>

        <footer v-if="$slots.footer" class="modal-dialog__footer">
          <slot name="footer" :close="close" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.modal-dialog {
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - #{$spacing-xl});
  max-height: calc(100vh - #{$spacing-xl});
  border: 1px solid var(--border-strong);
  border-radius: $radius-md;
  background: $color-surface;
  box-shadow: 0 16px 40px var(--shadow);

  &__backdrop {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: $spacing-md;
    background: color-mix(in srgb, #000 45%, transparent);
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-sm;
    padding: $spacing-sm $spacing-md;
    border-bottom: 1px solid $color-border;
  }

  &__title {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
  }

  &__close {
    display: inline-flex;
    padding: 2px;
    border: none;
    border-radius: $radius-sm;
    background: none;
    color: $color-text-muted;
    cursor: pointer;

    &:hover {
      background: $color-surface-hover;
      color: $color-text;
    }
  }

  &__body {
    overflow-y: auto;
    padding: $spacing-md;
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: $spacing-sm;
    padding: $spacing-sm $spacing-md;
    border-top: 1px solid $color-border;
  }
}
</style>
