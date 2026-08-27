import { queryFocusable } from './useFocusTrap'

export const MENU_ITEM_SELECTOR =
  '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]'

export function queryMenuItems(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)].filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true',
  )
}

export function eventWithin(
  event: Event,
  ...nodes: Array<HTMLElement | null | undefined>
): boolean {
  const target = event.target
  return (
    target instanceof Node &&
    nodes.some((node) => node === target || Boolean(node?.contains(target)))
  )
}

export function focusMenuOffset(root: HTMLElement, delta: number): void {
  const items = queryMenuItems(root)
  if (!items.length) return
  const active = document.activeElement
  const current = active instanceof HTMLElement ? items.indexOf(active) : -1
  const start = current === -1 ? (delta > 0 ? -1 : 0) : current
  items[(start + delta + items.length) % items.length]?.focus()
}

/** Next/previous tab stop relative to a trigger, ignoring a teleported or nested panel. */
export function moveFocusAroundTrigger(
  trigger: HTMLElement,
  exclude: HTMLElement | null | undefined,
  direction: 'forward' | 'backward',
): void {
  const order = queryFocusable(document.body).filter(
    (el) => el !== exclude && !exclude?.contains(el),
  )
  const index = order.indexOf(trigger)
  if (index === -1) {
    trigger.focus()
    return
  }
  if (direction === 'forward') {
    ;(order[index + 1] ?? trigger).focus()
    return
  }
  ;(order[index - 1] ?? trigger).focus()
}

export function handleOpenMenuKeys(
  event: KeyboardEvent,
  opts: {
    open: boolean
    inWidget: boolean
    panel: HTMLElement | null | undefined
    onOpen: (focus: 'first' | 'last') => void
    onClose: (restoreFocus: boolean) => void
    onTabOut: (direction: 'forward' | 'backward') => void
  },
): boolean {
  if (!opts.open) {
    if (!opts.inWidget) return false
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return false
    event.preventDefault()
    opts.onOpen(event.key === 'ArrowUp' ? 'last' : 'first')
    return true
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    opts.onClose(true)
    return true
  }

  if (event.key === 'Tab') {
    event.preventDefault()
    opts.onTabOut(event.shiftKey ? 'backward' : 'forward')
    return true
  }

  if (!opts.inWidget || !opts.panel) return false

  const items = queryMenuItems(opts.panel)
  if (!items.length) return false

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    focusMenuOffset(opts.panel, 1)
    return true
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    focusMenuOffset(opts.panel, -1)
    return true
  }
  if (event.key === 'Home') {
    event.preventDefault()
    items[0]?.focus()
    return true
  }
  if (event.key === 'End') {
    event.preventDefault()
    items[items.length - 1]?.focus()
    return true
  }

  return false
}
