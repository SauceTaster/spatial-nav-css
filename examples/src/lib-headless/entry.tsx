/**
 * Entry into a headless popup.
 *
 * Both libraries move DOM focus to the *panel* when it opens — Headless UI
 * focuses `MenuItems`/`ListboxOptions` (they carry `tabIndex={0}` while open),
 * Ark focuses `Menu.Content`/`Select.Content` (`tabindex="0"`) — and both track
 * the highlighted row with `aria-activedescendant` instead of real focus. The
 * engine adopts that move through `focusin`, so spatial focus ends up on the
 * panel, not on a row, and a direction press from a container onto its own
 * descendants is not a move the geometry can make.
 *
 * So the app owns entry. It has to be driven by the panel's own focus event
 * rather than by a timer: Headless UI focuses the panel in an effect and Ark
 * does it a frame later, so any fixed delay races one library or the other.
 *
 * The move is queued as a microtask rather than made inline. React's handler
 * runs while the panel's `focusin` is still bubbling toward the engine's
 * document-level listener, so a synchronous `nav.focus(row)` is immediately
 * overwritten when that listener finally adopts the panel: DOM focus ends up
 * on the row while the engine's own focus — the ring, and the origin of the
 * next direction press — stays on the panel. Deferring past the end of the
 * dispatch makes the two agree.
 */
import { useCallback } from 'react'
import { useSpatialNavigation } from 'spatial-nav-css/react'
import type { Direction } from 'spatial-nav-css'
import type { FocusEvent, KeyboardEvent } from 'react'

export function usePanelEntry(rowSelector: string) {
  const nav = useSpatialNavigation()
  return useCallback(
    (event: FocusEvent<HTMLElement>) => {
      // Only the panel taking focus itself; rows bubbling their own focus here
      // must be left alone.
      if (event.target !== event.currentTarget) return
      const panel = event.currentTarget
      queueMicrotask(() => {
        if (!panel.isConnected || panel.ownerDocument.activeElement !== panel) return
        const row = panel.querySelector<HTMLElement>(rowSelector)
        if (row) nav.focus(row)
      })
    },
    [nav, rowSelector],
  )
}

const ARROWS: Record<string, Direction | undefined> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

/**
 * Arbitrate DOM movement and activation keys inside an open panel.
 *
 * Both libraries own ArrowUp/ArrowDown/Enter while their popup is open: they
 * `preventDefault` and act on an internal highlight expressed as
 * `aria-activedescendant`, never on DOM focus. The keyboard adapter correctly
 * stands down on a consumed event — so with every row also a spatial stop, a
 * keyboard press drives the library's highlight while the engine's ring stays
 * put. The two then disagree about which row is current, and on Ark that is
 * not just cosmetic: Enter commits Zag's highlight, so it selects the wrong
 * row (or none). A controller press has the opposite problem — it never
 * reaches the library's handler at all, so only the engine moves.
 *
 * Spread this in the panel's *capture* phase to settle it. React's capture
 * handler runs before the library's own bubble handler, `stopPropagation`
 * keeps the synthetic event out of it, and `preventDefault` marks the native
 * event consumed so the window-level keyboard adapter does not act a second
 * time. The app then makes exactly one move, through the engine — which
 * honours `contain`, and activates the row the ring is actually on.
 */
export function usePanelKeys() {
  const nav = useSpatialNavigation()
  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const direction = ARROWS[event.key]
      // Space as well as Enter: a remote's OK button reports either, and
      // Headless UI would otherwise route a bare Space into its typeahead.
      if (!direction && event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      event.stopPropagation()
      if (direction) nav.navigate(direction)
      else nav.activate()
    },
    [nav],
  )
}
