import { onBeforeUnmount, ref } from 'vue'

const DRAG_THRESHOLD_PX = 4
const AXIS_LOCK_PX = 6
const SWIPE_MAX_PX = 80
const SWIPE_COMMIT_PX = 56

/**
 * Horizontal-only swipe on a track. Vertical motion cancels so the explorer
 * list can still scroll. Commits when released past the threshold.
 * `key` identifies the active row/chip for visual offset only; `commit` is a
 * closure that performs the action.
 */
export function useTreeRowSwipe() {
  const offsetX = ref(0)
  const activeKey = ref<string | null>(null)

  let pointerId: number | null = null
  let target: HTMLElement | null = null
  let startX = 0
  let startY = 0
  let axis: 'pending' | 'horizontal' | 'cancelled' = 'pending'
  let dragged = false
  let suppressClick = false
  let suppressClickTimer: number | null = null
  let pendingKey: string | null = null
  let onCommit: (() => void) | null = null

  function resetVisual() {
    offsetX.value = 0
    activeKey.value = null
  }

  function stop(commit: boolean) {
    if (target && pointerId != null && target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId)
    }
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)

    const commitFn = onCommit
    const shouldCommit =
      commit && axis === 'horizontal' && offsetX.value >= SWIPE_COMMIT_PX && commitFn

    if (dragged) {
      suppressClick = true
      if (suppressClickTimer != null) window.clearTimeout(suppressClickTimer)
      suppressClickTimer = window.setTimeout(() => {
        suppressClick = false
        suppressClickTimer = null
      }, 0)
    }

    pointerId = null
    target = null
    pendingKey = null
    onCommit = null
    axis = 'pending'
    dragged = false
    resetVisual()

    if (shouldCommit && commitFn) commitFn()
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerId !== pointerId) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY

    if (axis === 'pending') {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) >= AXIS_LOCK_PX) {
        axis = 'cancelled'
        stop(false)
        return
      }
      if (Math.abs(dx) >= AXIS_LOCK_PX) {
        axis = 'horizontal'
        dragged = true
        activeKey.value = pendingKey
      } else {
        return
      }
    }

    if (axis !== 'horizontal') return
    event.preventDefault()
    offsetX.value = Math.max(0, Math.min(SWIPE_MAX_PX, dx))
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId === pointerId) stop(true)
  }

  function onPointerCancel(event: PointerEvent) {
    if (event.pointerId === pointerId) stop(false)
  }

  function start(event: PointerEvent, key: string, commit: () => void) {
    if (event.button !== 0) return
    stop(false)
    startX = event.clientX
    startY = event.clientY
    pointerId = event.pointerId
    target = event.currentTarget as HTMLElement
    pendingKey = key
    onCommit = commit
    axis = 'pending'
    target.setPointerCapture(pointerId)
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  function rowOffset(key: string): number {
    return activeKey.value === key ? offsetX.value : 0
  }

  function consumeSuppressedClick(event: MouseEvent): boolean {
    if (!suppressClick) return false
    suppressClick = false
    if (suppressClickTimer != null) {
      window.clearTimeout(suppressClickTimer)
      suppressClickTimer = null
    }
    event.preventDefault()
    event.stopPropagation()
    return true
  }

  onBeforeUnmount(() => stop(false))

  return {
    rowOffset,
    start,
    consumeSuppressedClick,
  }
}
