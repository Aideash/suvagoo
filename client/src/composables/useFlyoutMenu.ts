import { nextTick, onBeforeUnmount, onMounted, ref, useId, type Ref } from 'vue'
import {
  eventWithin,
  handleOpenMenuKeys,
  moveFocusAroundTrigger,
  queryMenuItems,
} from './menuNavigation'

/** Keyboard-operated menu anchored to a local trigger (add-command flyouts). */
export function useFlyoutMenu(
  trigger: Ref<HTMLButtonElement | undefined>,
  panel: Ref<HTMLElement | undefined>,
) {
  const open = ref(false)
  const menuId = useId()

  function close(restoreFocus = false) {
    if (!open.value) return
    open.value = false
    if (restoreFocus) trigger.value?.focus()
  }

  function openMenu(focus: 'first' | 'last' = 'first') {
    open.value = true
    void nextTick(() => {
      const items = panel.value ? queryMenuItems(panel.value) : []
      if (!items.length) return
      ;(focus === 'last' ? items[items.length - 1] : items[0])?.focus()
    })
  }

  function toggle() {
    if (open.value) close(true)
    else openMenu('first')
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

  function onPointerDown(event: MouseEvent) {
    if (!open.value) return
    if (eventWithin(event, trigger.value, panel.value)) return
    close(false)
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('mousedown', onPointerDown, true)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('mousedown', onPointerDown, true)
  })

  return { open, menuId, toggle, close }
}
