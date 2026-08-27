<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import {
  eventWithin,
  handleOpenMenuKeys,
  moveFocusAroundTrigger,
  queryMenuItems,
} from '../composables/menuNavigation'

const props = withDefaults(
  defineProps<{
    label?: string
    /** Material icon ligature name, rendered before the label. */
    icon?: string
    title?: string
    width?: number
    align?: 'left' | 'right'
  }>(),
  { label: '', icon: '', title: '', width: 320, align: 'right' },
)

const open = ref(false)
const trigger = ref<HTMLButtonElement>()
const panel = ref<HTMLDivElement>()
const style = ref<Record<string, string>>({})
const menuId = useId()

function position() {
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect) return

  const margin = 8
  const left =
    props.align === 'right'
      ? Math.min(rect.right - props.width, window.innerWidth - props.width - margin)
      : rect.left
  const maxHeight = window.innerHeight - rect.bottom - margin * 2

  style.value = {
    top: `${rect.bottom + 4}px`,
    left: `${Math.max(margin, left)}px`,
    width: `${props.width}px`,
    maxHeight: `${Math.max(160, maxHeight)}px`,
  }
}

function close(restoreFocus = false) {
  if (!open.value) return
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}

function openMenu(focus: 'first' | 'last' = 'first') {
  open.value = true
  void nextTick(() => {
    position()
    const items = panel.value ? queryMenuItems(panel.value) : []
    if (!items.length) return
    ;(focus === 'last' ? items[items.length - 1] : items[0])?.focus()
  })
}

function toggle() {
  if (open.value) close(true)
  else openMenu('first')
}

function onPointerDown(event: MouseEvent) {
  if (!open.value) return
  if (eventWithin(event, trigger.value, panel.value)) return
  close()
}

function onKeydown(event: KeyboardEvent) {
  handleOpenMenuKeys(event, {
    open: open.value,
    inWidget: eventWithin(event, trigger.value, panel.value),
    panel: panel.value,
    onOpen: openMenu,
    onClose: close,
    onTabOut: (direction) => {
      const btn = trigger.value
      if (btn) moveFocusAroundTrigger(btn, panel.value, direction)
      close(false)
    },
  })
}

function onScroll(event: Event) {
  if (!open.value) return
  const target = event.target as Node
  if (panel.value?.contains(target)) return
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

defineExpose({ close })
</script>

<template>
  <button
    ref="trigger"
    type="button"
    class="ghost"
    :class="{ 'icon-only': icon && !label }"
    :title="title || undefined"
    :aria-label="label ? undefined : title || undefined"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="open ? menuId : undefined"
    @click="toggle"
  >
    <span v-if="icon" class="material-icons sm" aria-hidden="true">{{ icon }}</span>
    <span v-if="label">{{ label }}</span>
    <span v-if="label" class="material-icons sm caret" aria-hidden="true">expand_more</span>
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      :id="menuId"
      ref="panel"
      class="pop-menu"
      role="menu"
      :aria-label="title || label || undefined"
      :style="style"
    >
      <slot :close="() => close(true)" />
    </div>
  </Teleport>
</template>

<style scoped>
button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

button .material-icons {
  vertical-align: 0;
}

button.icon-only {
  padding: 5px;
}

.caret {
  margin-left: -2px;
  opacity: 0.7;
}

.pop-menu {
  position: fixed;
  z-index: 200;
  overflow: auto;
  background: var(--bg-raised);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: 0 12px 32px var(--shadow);
  padding: 4px;
}
</style>
