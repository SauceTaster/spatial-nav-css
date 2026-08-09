/**
 * Radix DropdownMenu — a portaled popper with its own roving tabindex.
 *
 * INTEGRATION REQUIREMENTS
 *
 * 1. `nav.activate()` does not open it. Radix's trigger opens on `pointerdown`
 *    (mouse) or `keydown` (Enter / Space / ArrowDown); the engine's activate
 *    path only synthesizes `.click()`, which matches neither. A controller
 *    press therefore does nothing at all. Fix: control `open` yourself and
 *    open it from `spatial:activate`, calling `preventDefault()` so the
 *    synthetic click cannot then toggle it back shut.
 *
 * 2. Menu items are not spatial stops. Radix drives them with a roving
 *    tabindex: every `role="menuitem"` is `tabindex="-1"` except the current
 *    one, and the engine's default policy reads a negative tabindex as an
 *    explicit opt-out. Without help the open menu offers at most one stop and
 *    `navigate('down')` reports `spatial:nofocustarget`. `data-focusable` is
 *    the documented opt-back-in and makes every item a stop; Radix's own
 *    `onFocus` bookkeeping still runs, so the two systems agree on which item
 *    is current.
 *
 * 3. Entry has to land on an item. Radix only auto-focuses the first item when
 *    it believes the user is on a keyboard; opened any other way it focuses
 *    the menu *container*. That container is an ancestor of every item, and
 *    the engine excludes candidates that contain the origin — so directional
 *    navigation from there finds nothing at all. Radix's own hook for this,
 *    `onOpenAutoFocus`, still reaches its FocusScope at runtime but is stripped
 *    from the public `DropdownMenuContentProps` type, so it has to be spread in
 *    (below). Doing it in an effect instead does not work: Radix's FocusScope
 *    focuses from a later commit than the parent's effect.
 *
 * 4. `modal={false}` is deliberate: a 10-foot UI keeps the page behind
 *    readable and must not lock scroll. It also means Radix does NOT
 *    `aria-hidden` the rest of the app, so the engine would happily walk out
 *    of the menu — `data-spatial-container="contain"` is load-bearing here,
 *    not decoration.
 */
import { useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useFocusable } from 'spatial-nav-css/react'
import type { ServiceStatus } from '../shared/api/db'

export type ServiceAction = 'start' | 'stop' | 'restart'

const ACTIONS: Array<{ id: ServiceAction; label: string }> = [
  { id: 'start', label: 'Start' },
  { id: 'restart', label: 'Restart' },
  { id: 'stop', label: 'Stop' },
]

export function ServiceMenu({
  service,
  onAction,
}: {
  service: ServiceStatus
  onAction: (action: ServiceAction) => void
}) {
  const [open, setOpen] = useState(false)
  const content = useRef<HTMLDivElement>(null)
  const { ref } = useFocusable<HTMLButtonElement>({
    onActivate: (event) => {
      event.preventDefault()
      setOpen(true)
    },
  })

  // Radix forwards `onOpenAutoFocus` to its FocusScope but omits it from the
  // public `DropdownMenuContentProps` type, so it can only arrive by spread.
  const entry = {
    onOpenAutoFocus: (event: Event) => {
      event.preventDefault()
      content.current?.querySelector<HTMLElement>('[data-testid="service-action"]')?.focus()
    },
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          ref={ref}
          type="button"
          className="rx-btn"
          data-testid="service-menu-trigger"
          data-service={service.id}
        >
          Actions
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          {...entry}
          ref={content}
          className="rx-menu"
          sideOffset={6}
          data-testid="service-menu"
          data-spatial-container="contain"
        >
          {ACTIONS.map((action) => (
            <DropdownMenu.Item
              key={action.id}
              className="rx-menu-item"
              data-testid="service-action"
              data-action={action.id}
              data-focusable
              onSelect={() => onAction(action.id)}
            >
              {action.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
