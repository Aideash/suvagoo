import { nextTick } from 'vue'

/** One tab stop on the active option; arrows move selection. */
export function optionTabIndex(index: number, selectedIndex: number | null): number {
  return (selectedIndex ?? 0) === index ? 0 : -1
}

export function handleListboxKeydown(
  event: KeyboardEvent,
  count: number,
  selectedIndex: number | null,
  select: (index: number) => void,
): void {
  if (!count) return

  const current = selectedIndex ?? 0
  let next: number | undefined

  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    event.preventDefault()
    next = (current + 1) % count
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    event.preventDefault()
    next = (current - 1 + count) % count
  } else if (event.key === 'Home') {
    event.preventDefault()
    next = 0
  } else if (event.key === 'End') {
    event.preventDefault()
    next = count - 1
  }

  if (next === undefined) return

  const root = event.currentTarget
  select(next)
  if (!(root instanceof HTMLElement)) return
  void nextTick(() => {
    root.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')?.focus()
  })
}
