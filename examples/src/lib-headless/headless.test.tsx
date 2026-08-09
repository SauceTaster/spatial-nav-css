import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SpatialNavigation, SpatialNavigationOptions } from 'spatial-nav-css'
import { useSpatialNavigation } from 'spatial-nav-css/react'
import { App } from './App'
import { AppShell, createQueryClient } from '../shared/app'
import { applyLayout, layoutNavOptions, setRect } from '../shared/layout'

// Two jsdom gaps these libraries hit, stubbed here rather than in
// shared/setup.ts so they stay visible to whoever reads this file:
// Zag's select scrolls its highlighted option into view through
// `contentEl.scrollTo`, and Headless UI's `anchor` positioning starts
// floating-ui's autoUpdate, which observes intersection.
if (!('scrollTo' in Element.prototype)) {
  ;(Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {}
}
if (!('IntersectionObserver' in globalThis)) {
  ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
}

/**
 * Let both libraries finish moving focus. Headless UI focuses a panel in an
 * effect and restores the trigger behind a double `requestAnimationFrame`;
 * Zag focuses a frame after opening. Draining both channels keeps the tests
 * free of arbitrary sleeps.
 */
const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await frame()
    await frame()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/**
 * The page as the CSS lays it out: Headless UI's controls on the left half,
 * Ark's on the right, tabs under each, and every popup below its trigger.
 * Portaled panels live under `document.body`, so this is re-applied after each
 * open — `applyLayout` simply skips rules that match nothing.
 *
 * Ark keeps the inactive tab panel mounted with `hidden`, so its panel rules
 * are split on that attribute: the open panel's control sits under the tabs,
 * the closed one well below, and neither inherits the other's rectangle when
 * the tab flips.
 */
function layout(): void {
  applyLayout([
    { selector: '[data-testid="hui-switch"]', flow: 'row', x: 0, y: 100, w: 150, h: 40 },
    { selector: '[data-testid="hui-listbox-trigger"]', flow: 'row', x: 160, y: 100, w: 110, h: 40 },
    { selector: '[data-testid="hui-menu-trigger"]', flow: 'row', x: 280, y: 100, w: 90, h: 40 },
    { selector: '[data-testid="hui-dialog-trigger"]', flow: 'row', x: 380, y: 100, w: 120, h: 40 },
    { selector: '[data-testid="hui-tab"]', flow: 'row', x: 0, y: 170, w: 90, h: 34, gap: 6 },
    { selector: '[data-testid="hui-panel"]:not([hidden]) button', flow: 'row', x: 0, y: 230, w: 140, h: 38 },

    { selector: '[data-testid="ark-switch-input"]', flow: 'row', x: 600, y: 100, w: 150, h: 40 },
    { selector: '[data-testid="ark-select-trigger"]', flow: 'row', x: 760, y: 100, w: 110, h: 40 },
    { selector: '[data-testid="ark-menu-trigger"]', flow: 'row', x: 880, y: 100, w: 90, h: 40 },
    { selector: '[data-testid="ark-dialog-trigger"]', flow: 'row', x: 980, y: 100, w: 120, h: 40 },
    { selector: '[data-testid="ark-tab"]', flow: 'row', x: 600, y: 170, w: 90, h: 34, gap: 6 },
    { selector: '[data-testid="ark-panel"]:not([hidden]) button', flow: 'row', x: 600, y: 230, w: 140, h: 38 },
    { selector: '[data-testid="ark-panel"][hidden] button', flow: 'row', x: 600, y: 300, w: 140, h: 38 },

    { selector: '[data-testid="hui-option"]', flow: 'column', x: 160, y: 150, w: 180, h: 32, gap: 2 },
    { selector: '[data-testid="hui-menu-item"]', flow: 'column', x: 280, y: 150, w: 180, h: 32, gap: 2 },
    { selector: '[data-testid="ark-option"]', flow: 'column', x: 760, y: 150, w: 180, h: 32, gap: 2 },
    { selector: '[data-testid="ark-menu-item"]', flow: 'column', x: 880, y: 150, w: 180, h: 32, gap: 2 },

    { selector: '[data-testid="hui-dialog-cancel"]', flow: 'row', x: 380, y: 420, w: 110, h: 40 },
    { selector: '[data-testid="hui-dialog-confirm"]', flow: 'row', x: 500, y: 420, w: 110, h: 40 },
    { selector: '[data-testid="ark-dialog-cancel"]', flow: 'row', x: 380, y: 420, w: 110, h: 40 },
    { selector: '[data-testid="ark-dialog-confirm"]', flow: 'row', x: 500, y: 420, w: 110, h: 40 },
  ])
  setRect(screen.queryByTestId('hui-listbox'), { x: 160, y: 150, w: 180, h: 120 })
  setRect(screen.queryByTestId('hui-menu'), { x: 280, y: 150, w: 180, h: 70 })
  setRect(screen.queryByTestId('ark-select'), { x: 760, y: 150, w: 180, h: 120 })
  setRect(screen.queryByTestId('ark-menu'), { x: 880, y: 150, w: 180, h: 70 })
  setRect(screen.queryByTestId('hui-dialog-panel'), { x: 380, y: 340, w: 230, h: 140 })
  setRect(screen.queryByTestId('ark-dialog'), { x: 380, y: 340, w: 230, h: 140 })
}

/**
 * Mount the way the page does. `layoutNavOptions` replaces the *rendering*
 * half of the visibility check with `() => true`, since jsdom paints nothing;
 * the engine's semantic reachability check (`aria-hidden` / `inert` /
 * `hidden`) is not replaceable and still applies, which is what makes these
 * results meaningful rather than an artefact of the harness.
 */
function mount(options: SpatialNavigationOptions = layoutNavOptions) {
  const client = createQueryClient()
  let nav!: SpatialNavigation
  function Probe() {
    nav = useSpatialNavigation()
    return null
  }
  const view = render(
    <AppShell client={client} nav={options}>
      <Probe />
      <App />
    </AppShell>,
  )
  return { nav, view }
}

/**
 * Wait for the query. Neither library keeps its options in the DOM while
 * closed — Headless UI unmounts them, Ark's `lazyMount` never mounts them —
 * so the arrival signal is the panel text, not an option count.
 */
const ready = async () => {
  await waitFor(() => expect(screen.getByTestId('hui-panel')).toHaveTextContent('·'))
  layout()
}

const labels = (testid: string): string[] =>
  screen.getAllByTestId(testid).map((el) => el.textContent!)

const tid = (nav: SpatialNavigation): string | undefined =>
  nav.getFocused()?.dataset.testid ?? undefined

describe('headless component libraries', () => {
  it('renders both halves from the same query data', async () => {
    const { nav } = mount()
    await ready()

    // Closed, neither library has any option in the document.
    expect(screen.queryAllByTestId('hui-option')).toHaveLength(0)
    expect(screen.queryAllByTestId('ark-option')).toHaveLength(0)

    const selected = screen.getByTestId('hui-listbox-trigger').textContent!
    expect(selected).not.toBe('Loading…')
    expect(screen.getByTestId('ark-select-trigger')).toHaveTextContent(selected)

    act(() => {
      nav.focus(screen.getByTestId('hui-listbox-trigger'))
      nav.activate()
    })
    await settle()
    expect(labels('hui-option').length).toBeGreaterThan(2)
    expect(labels('hui-option')[0]).toBe(selected)
    nav.destroy()
  })

  it('moves across both halves with direction keys', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getByTestId('hui-switch'))
    })
    expect(tid(nav)).toBe('hui-switch')

    for (const expected of ['hui-listbox-trigger', 'hui-menu-trigger', 'hui-dialog-trigger']) {
      act(() => {
        nav.navigate('right')
      })
      expect(tid(nav)).toBe(expected)
    }

    // Crossing into the Ark half lands on the switch's hidden input — Ark's
    // only focusable node for that control.
    act(() => {
      nav.navigate('right')
    })
    expect(tid(nav)).toBe('ark-switch-input')

    act(() => {
      nav.navigate('right')
    })
    expect(tid(nav)).toBe('ark-select-trigger')

    act(() => {
      nav.navigate('down')
    })
    expect(tid(nav)).toBe('ark-tab')
    nav.destroy()
  })

  it('Headless UI: opening the dialog puts focus inside it', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getByTestId('hui-dialog-trigger'))
      nav.activate()
    })
    await waitFor(() => expect(screen.queryByTestId('hui-dialog-panel')).not.toBeNull())
    await settle()
    layout()

    expect(screen.getByTestId('hui-dialog-panel').contains(nav.getFocused())).toBe(true)
    expect(tid(nav)).toBe('hui-dialog-confirm')
    nav.destroy()
  })

  it('Headless UI: spatial navigation cannot reach the page behind the dialog', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getByTestId('hui-dialog-trigger'))
      nav.activate()
    })
    await waitFor(() => expect(screen.queryByTestId('hui-dialog-panel')).not.toBeNull())
    await settle()
    layout()

    const dialog = screen.getByTestId('hui-dialog')
    for (const direction of ['up', 'left', 'up', 'right', 'down', 'left'] as const) {
      act(() => {
        nav.navigate(direction)
      })
      expect(dialog.contains(nav.getFocused())).toBe(true)
    }
    // Explicitly: the triggers behind the overlay never take focus, even with
    // a visibility filter that ignores the aria-hidden/inert Headless UI adds.
    expect(tid(nav)).not.toBe('hui-dialog-trigger')
    expect(tid(nav)).not.toBe('hui-switch')
    nav.destroy()
  })

  it('Headless UI: closing the dialog returns focus to the trigger', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getByTestId('hui-dialog-trigger'))
      nav.activate()
    })
    await waitFor(() => expect(screen.queryByTestId('hui-dialog-panel')).not.toBeNull())
    await settle()
    layout()

    act(() => {
      nav.focus(screen.getByTestId('hui-dialog-cancel'))
      nav.activate()
    })
    await waitFor(() => expect(screen.queryByTestId('hui-dialog-panel')).toBeNull())
    await settle()

    // Headless UI restores focus itself; the engine adopts it through focusin.
    expect(document.activeElement).toBe(screen.getByTestId('hui-dialog-trigger'))
    await waitFor(() => expect(tid(nav)).toBe('hui-dialog-trigger'))
    nav.destroy()
  })

  it('Headless UI: the menu opens, items are reachable, selecting closes and restores focus', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getByTestId('hui-menu-trigger'))
      nav.activate()
    })
    await waitFor(() => expect(screen.queryAllByTestId('hui-menu-item')).toHaveLength(2))
    await settle()
    layout()

    // App-owned entry (entry.tsx) put focus on the first item, not the panel.
    expect(tid(nav)).toBe('hui-menu-item')
    expect(nav.getFocused()?.dataset.action).toBe('pin')

    act(() => {
      nav.navigate('down')
    })
    expect(nav.getFocused()?.dataset.action).toBe('devices')

    // `contain` on the panel: left would otherwise land on the listbox trigger.
    act(() => {
      nav.navigate('left')
    })
    expect(screen.getByTestId('hui-menu').contains(nav.getFocused())).toBe(true)

    act(() => {
      nav.activate()
    })
    await waitFor(() => expect(screen.queryAllByTestId('hui-menu-item')).toHaveLength(0))
    await settle()
    expect(screen.getByTestId('log')).toHaveTextContent('Sign out devices')
    expect(document.activeElement).toBe(screen.getByTestId('hui-menu-trigger'))
    nav.destroy()
  })

  it('Headless UI: the listbox commits a profile from the query data', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getByTestId('hui-listbox-trigger'))
      nav.activate()
    })
    await settle()
    layout()
    const names = labels('hui-option')
    expect(tid(nav)).toBe('hui-option')

    act(() => {
      nav.navigate('down')
    })
    expect(nav.getFocused()?.textContent).toBe(names[1])

    // Headless UI's option `onFocus` syncs its active option to whatever the
    // engine focused — activedescendant and spatial focus stay the same row.
    // (One render behind at the moment of the move, hence waitFor.)
    await waitFor(() =>
      expect(screen.getByTestId('hui-listbox').getAttribute('aria-activedescendant')).toBe(
        nav.getFocused()!.id,
      ),
    )

    act(() => {
      nav.activate()
    })
    await waitFor(() => expect(screen.getByTestId('hui-listbox-trigger')).toHaveTextContent(names[1]!))
    await settle()
    expect(document.activeElement).toBe(screen.getByTestId('hui-listbox-trigger'))
    nav.destroy()
  })

  it('a real arrow keydown inside an open panel makes exactly one move', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getByTestId('hui-listbox-trigger'))
      nav.activate()
    })
    await settle()
    layout()
    const names = labels('hui-option')
    expect(nav.getFocused()?.textContent).toBe(names[0])

    // Headless UI owns ArrowDown inside its panel: it moves its highlight and
    // leaves DOM focus on the panel, so with every row a spatial stop the ring
    // and the highlight drift apart. `usePanelKeys` takes the key in the
    // capture phase instead — the library never sees it, and the engine makes
    // the single move.
    let notConsumed!: boolean
    act(() => {
      notConsumed = fireEvent.keyDown(nav.getFocused()!, { key: 'ArrowDown' })
    })
    expect(nav.getFocused()?.textContent).toBe(names[1])
    // preventDefault is part of the contract: the window-level keyboard
    // adapter skips consumed events, so it does not move a second time.
    expect(notConsumed).toBe(false)
    await waitFor(() =>
      expect(screen.getByTestId('hui-listbox').getAttribute('aria-activedescendant')).toBe(
        nav.getFocused()!.id,
      ),
    )

    // And the same key still cannot leave: `contain` is honoured because the
    // move goes through the engine.
    act(() => {
      fireEvent.keyDown(nav.getFocused()!, { key: 'ArrowLeft' })
    })
    expect(screen.getByTestId('hui-listbox').contains(nav.getFocused())).toBe(true)

    // Enter goes through the same arbitration and commits the focused row.
    act(() => {
      fireEvent.keyDown(nav.getFocused()!, { key: 'Enter' })
    })
    await waitFor(() => expect(screen.getByTestId('hui-listbox-trigger')).toHaveTextContent(names[1]!))
    nav.destroy()
  })

  it('Headless UI: tabs switch panels and the panel content is reachable', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getAllByTestId('hui-tab')[0]!)
    })
    expect(screen.queryByTestId('hui-panel-access')).not.toBeNull()

    act(() => {
      nav.navigate('right')
    })
    expect(nav.getFocused()).toBe(screen.getAllByTestId('hui-tab')[1])
    // Landing on the trigger is not enough — Headless UI's automatic
    // activation lives in its own arrow-key handler, so the panel only swaps
    // on activate.
    expect(screen.queryByTestId('hui-panel-activity')).toBeNull()

    act(() => {
      nav.activate()
    })
    await waitFor(() => expect(screen.queryByTestId('hui-panel-activity')).not.toBeNull())
    expect(screen.queryByTestId('hui-panel-access')).toBeNull()
    layout()

    act(() => {
      nav.navigate('down')
    })
    expect(tid(nav)).toBe('hui-panel-activity')
    nav.destroy()
  })

  it('Ark UI: opening the dialog puts focus inside it', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getByTestId('ark-dialog-trigger'))
      nav.activate()
    })
    await waitFor(() => expect(screen.queryByTestId('ark-dialog')).not.toBeNull())
    await settle()
    layout()

    // Entry must land on something the engine will accept as a stop.
    // `Dialog.Content` is `tabindex="-1"`, so a browser's first-tabbable
    // landing is fine but this DOM's fallback to the content itself is not —
    // hence the `onFocus` redirect, which puts focus on a real button here.
    expect(screen.getByTestId('ark-dialog').contains(nav.getFocused())).toBe(true)
    expect(['ark-dialog-cancel', 'ark-dialog-confirm']).toContain(tid(nav))
    nav.destroy()
  })

  it('Ark UI: spatial navigation cannot reach the page behind the dialog', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getByTestId('ark-dialog-trigger'))
      nav.activate()
    })
    await waitFor(() => expect(screen.queryByTestId('ark-dialog')).not.toBeNull())
    await settle()
    layout()

    const dialog = screen.getByTestId('ark-dialog')
    for (const direction of ['up', 'left', 'up', 'right', 'down', 'left'] as const) {
      act(() => {
        nav.navigate(direction)
      })
      expect(dialog.contains(nav.getFocused())).toBe(true)
    }
    expect(tid(nav)).not.toBe('ark-dialog-trigger')
    expect(tid(nav)).not.toBe('ark-switch-input')
    nav.destroy()
  })

  it('Ark UI: closing the dialog returns focus to the trigger', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getByTestId('ark-dialog-trigger'))
      nav.activate()
    })
    await waitFor(() => expect(screen.queryByTestId('ark-dialog')).not.toBeNull())
    await settle()
    layout()

    act(() => {
      nav.focus(screen.getByTestId('ark-dialog-cancel'))
      nav.activate()
    })
    await waitFor(() => expect(screen.queryByTestId('ark-dialog')).toBeNull())
    await settle()

    expect(document.activeElement).toBe(screen.getByTestId('ark-dialog-trigger'))
    await waitFor(() => expect(tid(nav)).toBe('ark-dialog-trigger'))
    nav.destroy()
  })

  it('Ark UI: the menu opens, items are reachable, selecting closes and restores focus', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getByTestId('ark-menu-trigger'))
      nav.activate()
    })
    await waitFor(() => expect(screen.queryAllByTestId('ark-menu-item')).toHaveLength(2))
    await settle()
    layout()

    expect(tid(nav)).toBe('ark-menu-item')
    expect(nav.getFocused()?.dataset.action).toBe('pin')

    act(() => {
      nav.navigate('down')
    })
    expect(nav.getFocused()?.dataset.action).toBe('devices')

    // Zag's menu is not modal — nothing outside it is hidden — so `contain` on
    // the positioner is the only thing stopping this from leaving.
    act(() => {
      nav.navigate('left')
    })
    expect(screen.getByTestId('ark-menu').contains(nav.getFocused())).toBe(true)

    act(() => {
      nav.activate()
    })
    await waitFor(() => expect(screen.queryAllByTestId('ark-menu-item')).toHaveLength(0))
    await settle()
    expect(screen.getByTestId('log')).toHaveTextContent('Sign out devices')
    expect(document.activeElement).toBe(screen.getByTestId('ark-menu-trigger'))
    nav.destroy()
  })

  it('Ark UI: the select commits a profile from the query data', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getByTestId('ark-select-trigger'))
      nav.activate()
    })
    await waitFor(() => expect(screen.queryAllByTestId('ark-option').length).toBeGreaterThan(1))
    await settle()
    layout()
    const names = labels('ark-option')
    expect(tid(nav)).toBe('ark-option')

    act(() => {
      nav.navigate('down')
    })
    expect(nav.getFocused()?.textContent).toBe(names[1])

    act(() => {
      nav.activate()
    })
    await waitFor(() => expect(screen.getByTestId('ark-select-trigger')).toHaveTextContent(names[1]!))
    await settle()
    expect(document.activeElement).toBe(screen.getByTestId('ark-select-trigger'))
    nav.destroy()
  })

  it('Ark UI: the same arrow arbitration applies to the Zag select', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getByTestId('ark-select-trigger'))
      nav.activate()
    })
    await waitFor(() => expect(screen.queryAllByTestId('ark-option').length).toBeGreaterThan(1))
    await settle()
    layout()
    const names = labels('ark-option')

    let notConsumed!: boolean
    act(() => {
      notConsumed = fireEvent.keyDown(nav.getFocused()!, { key: 'ArrowDown' })
    })
    expect(nav.getFocused()?.textContent).toBe(names[1])
    expect(notConsumed).toBe(false)

    act(() => {
      fireEvent.keyDown(nav.getFocused()!, { key: 'ArrowLeft' })
    })
    expect(screen.getByTestId('ark-select').contains(nav.getFocused())).toBe(true)

    // Enter matters even more than the arrows here. Zag's own Enter handler
    // commits `highlightedValue`, which spatial focus never sets — so without
    // the same capture-phase arbitration it selects the row Zag last
    // highlighted (here: none, or the previously selected one) rather than the
    // row carrying the ring.
    act(() => {
      fireEvent.keyDown(nav.getFocused()!, { key: 'Enter' })
    })
    await waitFor(() => expect(screen.getByTestId('ark-select-trigger')).toHaveTextContent(names[1]!))
    await settle()
    expect(document.activeElement).toBe(screen.getByTestId('ark-select-trigger'))
    nav.destroy()
  })

  it('Ark UI: tabs switch panels and the panel content is reachable', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getAllByTestId('ark-tab')[0]!)
    })

    act(() => {
      nav.navigate('right')
    })
    expect(nav.getFocused()).toBe(screen.getAllByTestId('ark-tab')[1])
    // Zag's `activationMode="automatic"` is only consulted inside its own
    // ARROW_PREV/ARROW_NEXT handling; a bare TAB_FOCUS sets the focused tab
    // and nothing else, so the panel swaps on activate.
    expect(screen.getByTestId('ark-panel-activity').closest('[hidden]')).not.toBeNull()

    act(() => {
      nav.activate()
    })
    await waitFor(() => expect(screen.getByTestId('ark-panel-activity').closest('[hidden]')).toBeNull())
    // Let the now-closed panel actually pick up `hidden` before measuring:
    // the layout rules key off it, and Ark keeps both panels mounted.
    await settle()
    layout()

    act(() => {
      nav.navigate('down')
    })
    expect(tid(nav)).toBe('ark-panel-activity')
    nav.destroy()
  })

  it('KNOWN GAP: Ark keeps highlight state on a channel spatial focus never touches', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getByTestId('ark-select-trigger'))
      nav.activate()
    })
    await waitFor(() => expect(screen.queryAllByTestId('ark-option').length).toBeGreaterThan(1))
    await settle()
    layout()
    act(() => {
      nav.navigate('down')
    })

    // KNOWN GAP: Zag drives `aria-activedescendant` / `data-highlighted` from
    // pointer and key events only, so the option the engine focused is never
    // the highlighted one — the highlight stays on whatever Zag put it on when
    // the list opened. Headless UI's equivalent (asserted above) syncs from
    // `focus` and stays consistent. Consequence: an Ark app must style from
    // `[data-spatial-focused]`, and anything that reads Ark's highlighted item
    // sees a stale value under controller input. The fix is the same bridge
    // the Ark menu is forced to use — controlled `highlightedValue` pushed
    // from each row's `onFocus`; left off here so the raw behavior is visible.
    const focused = nav.getFocused()!
    expect(focused.dataset.testid).toBe('ark-option')
    expect(focused.hasAttribute('data-highlighted')).toBe(false)
    expect(screen.getByTestId('ark-select').getAttribute('aria-activedescendant')).not.toBe(
      focused.id,
    )
    nav.destroy()
  })

  it("Ark's closed tab panel stays mounted but out of reach", async () => {
    const { nav } = mount()
    await ready()

    // Ark keeps both panels mounted and hides the inactive one with `hidden`;
    // `Tabs.Content` offers no lazyMount/unmountOnExit to opt out.
    const closed = screen.getByTestId('ark-panel-activity')
    expect(closed.closest('[hidden]')).not.toBeNull()

    // Even under this suite's fully permissive `visibilityFilter`, the button
    // inside the closed panel is not a candidate: `[hidden]` is excluded by
    // the engine's semantic reachability check, which `visibilityFilter` does
    // not replace. Headless UI needs no equivalent — it swaps its closed panel
    // for an empty span.
    expect(nav.engine.findTarget('down', screen.getByTestId('ark-panel-access'))).toBeNull()
    nav.destroy()
  })

  it('both dialogs also hide the page behind them from assistive tech', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getByTestId('ark-dialog-trigger'))
      nav.activate()
    })
    await waitFor(() => expect(screen.queryByTestId('ark-dialog')).not.toBeNull())
    await settle()

    // Both libraries mark the rest of the document aria-hidden/inert while a
    // modal is open, which is a second, independent reason the containment
    // above holds — the engine's semantic check drops those subtrees whatever
    // the visibility policy. `contain` covers the non-modal cases (Ark's menu)
    // and states the intent in this app's own DOM.
    expect(screen.getByTestId('ark-half').closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByTestId('ark-dialog').closest('[aria-hidden="true"]')).toBeNull()
    nav.destroy()
  })

  it('KNOWN GAP: a container marker does not contain the element carrying it', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getByTestId('hui-menu-trigger'))
      nav.activate()
    })
    await waitFor(() => expect(screen.queryAllByTestId('hui-menu-item')).toHaveLength(2))
    await settle()
    layout()

    // Headless UI focuses the panel itself on open (it carries tabIndex={0}
    // while open) and only then does app-owned entry move focus to a row.
    // KNOWN GAP: `findContainer` starts at `el.parentElement`, so the panel's
    // own `data-spatial-container="contain"` does not contain the panel — and
    // Headless UI's portal exposes no outer element to mark instead. The
    // trigger is the one thing outside the panel that Headless UI leaves out
    // of its inert set, so that is exactly where a press made while focus is
    // parked on the panel lands: the menu closes under you. This is why the
    // app-owned entry in entry.tsx is required rather than cosmetic.
    // (Asserted through findTarget: focusing the panel here would immediately
    // trigger that entry handler.)
    const panel = screen.getByTestId('hui-menu')
    const escape = nav.engine.findTarget('up', panel)
    expect(escape).not.toBeNull()
    expect(panel.contains(escape)).toBe(false)
    expect(escape!.dataset.testid).toBe('hui-menu-trigger')
    nav.destroy()
  })

  it('Ark UI: the positioner contains even the panel-focused state', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(screen.getByTestId('ark-menu-trigger'))
      nav.activate()
    })
    await waitFor(() => expect(screen.queryAllByTestId('ark-menu-item')).toHaveLength(2))
    await settle()
    layout()

    // The mirror image of the gap above: `contain` sits on `Menu.Positioner`,
    // a real ancestor of the element Zag focuses, so even the panel-focused
    // state has nowhere to escape to.
    const content = screen.getByTestId('ark-menu')
    const escape = nav.engine.findTarget('up', content)
    expect(escape === null || content.parentElement!.contains(escape)).toBe(true)
    nav.destroy()
  })
})
