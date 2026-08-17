import { onBeforeUnmount, readonly, ref } from 'vue'

const DRAG_THRESHOLD_PX = 4
const PIXELS_PER_STEP = 4

export interface NumericScrubSession {
  key: string
  value: number
  step: number
  onUpdate: (value: number) => void
}

export function useNumericScrub() {
  const activeKey = ref<string | null>(null)
  let startX = 0
  let pointerId: number | null = null
  let target: HTMLElement | null = null
  let session: NumericScrubSession | null = null
  let pendingValue: number | null = null
  let animationFrame: number | null = null
  let dragged = false
  let suppressClick = false
  let suppressClickTimer: number | null = null

  function flushPending() {
    animationFrame = null
    if (pendingValue == null || !session) return
    const value = pendingValue
    pendingValue = null
    session.onUpdate(value)
  }

  function queueUpdate(value: number) {
    pendingValue = value
    if (animationFrame == null) animationFrame = requestAnimationFrame(flushPending)
  }

  function stopScrub() {
    if (animationFrame != null) {
      cancelAnimationFrame(animationFrame)
      flushPending()
    }
    if (target && pointerId != null && target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId)
    }
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
    if (dragged) {
      suppressClick = true
      if (suppressClickTimer != null) window.clearTimeout(suppressClickTimer)
      suppressClickTimer = window.setTimeout(() => {
        suppressClick = false
        suppressClickTimer = null
      }, 0)
    }
    activeKey.value = null
    pointerId = null
    target = null
    session = null
    pendingValue = null
    dragged = false
  }

  function onPointerMove(event: PointerEvent) {
    if (!session || event.pointerId !== pointerId) return
    const deltaX = event.clientX - startX
    if (!dragged && Math.abs(deltaX) < DRAG_THRESHOLD_PX) return
    dragged = true
    event.preventDefault()

    const multiplier = event.altKey ? 0.1 : event.shiftKey ? 10 : 1
    const steps = Math.round((deltaX / PIXELS_PER_STEP) * multiplier)
    queueUpdate(session.value + steps * session.step)
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId === pointerId) stopScrub()
  }

  function onPointerCancel(event: PointerEvent) {
    if (event.pointerId === pointerId) stopScrub()
  }

  function startScrub(event: PointerEvent, nextSession: NumericScrubSession) {
    if (event.button !== 0 || !Number.isFinite(nextSession.value) || nextSession.step <= 0) return
    stopScrub()
    event.preventDefault()
    startX = event.clientX
    pointerId = event.pointerId
    target = event.currentTarget as HTMLElement
    session = nextSession
    activeKey.value = nextSession.key
    target.setPointerCapture(pointerId)
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
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

  onBeforeUnmount(stopScrub)

  return {
    activeKey: readonly(activeKey),
    startScrub,
    consumeSuppressedClick,
  }
}
