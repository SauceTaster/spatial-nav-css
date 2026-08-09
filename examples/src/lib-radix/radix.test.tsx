import { beforeAll, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createSpatialNavigation, getFocusables, type SpatialNavigation } from 'spatial-nav-css'
import { App } from './App'
import { createQueryClient } from '../shared/app'
import { applyLayout, layoutNavOptions, setRect } from '../shared/layout'

/**
 * The engine's default `visibilityFilter` is unusable under jsdom (no
 * `checkVisibility`, and every element reports zero client rects, so nothing
 * would ever be visible), while `layoutNavOptions` replaces it with a blanket
 * `() => true`. Neither is what a Radix app runs: the whole containment story
 * for a portaled modal is the `aria-hidden` / `inert` / `hidden` half of the
 * default policy. This keeps exactly that half — the same first check
 * `isElementVisible` performs — and drops only the rendered-box test.
 */
const semanticVisible = (el: HTMLElement): boolean =>
  !el.closest('[aria-hidden="true"], [inert], [hidden]')

const navOptions = { ...layoutNavOptions, visibilityFilter: semanticVisible }

beforeAll(() => {
  // Radix Select scrolls the active option into view on open. jsdom has no
  // scrollIntoView, and the throw unmounts SelectContentImpl.
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = function scrollIntoView() {}
  }
})

/** The page as the CSS lays it out; re-applied after anything new mounts. */
function layout(): void {
  applyLayout([
    { selector: '[data-testid="tab"]', flow: 'row', x: 0, y: 120, w: 120, h: 38, gap: 8 },
    { selector: '[data-testid="switch"]', flow: 'column', x: 700, y: 200, w: 44, h: 24, gap: 44 },
    { selector: '[data-testid="select-trigger"]', flow: 'column', x: 660, y: 380, w: 120, h: 34, gap: 44 },
    { selector: '[data-testid="service-menu-trigger"]', flow: 'column', x: 660, y: 200, w: 120, h: 34, gap: 40 },
    { selector: '[data-testid="reset-trigger"]', flow: 'row', x: 660, y: 460, w: 120, h: 34 },
  ])
  // The header switch sits above the tablist, not in the panel column.
  const header = document.querySelector<HTMLElement>('.rx-head [data-testid="switch"]')
  setRect(header, { x: 700, y: 40, w: 44, h: 24 })
  setRect(document.querySelector('[data-testid="tablist"]'), { x: 0, y: 120, w: 800, h: 38 })
  setRect(panel(), { x: 0, y: 180, w: 800, h: 400 })
}

/** Radix keeps the outgoing panel mounted for a commit; take the live one. */
const panel = (): HTMLElement =>
  screen.getAllByTestId('panel').find((el) => !el.hasAttribute('hidden'))!

/** Portaled overlays land under document.body, so lay them out after opening. */
function layoutOverlays(): void {
  applyLayout([
    { selector: '[data-testid="dialog-cancel"]', flow: 'row', x: 300, y: 400, w: 110, h: 36 },
    { selector: '[data-testid="dialog-confirm"]', flow: 'row', x: 420, y: 400, w: 110, h: 36 },
    { selector: '[data-testid="service-action"]', flow: 'column', x: 660, y: 240, w: 160, h: 34, gap: 2 },
    { selector: '[data-testid="select-option"]', flow: 'column', x: 660, y: 420, w: 160, h: 34, gap: 2 },
  ])
  setRect(document.querySelector('[data-testid="dialog"]'), { x: 280, y: 260, w: 420, h: 200 })
  setRect(document.querySelector('[data-testid="service-menu"]'), { x: 660, y: 240, w: 160, h: 108 })
  setRect(document.querySelector('[data-testid="select-content"]'), { x: 660, y: 420, w: 160, h: 140 })
}

function mount() {
  const client = createQueryClient()
  const nav = createSpatialNavigation(navOptions)
  const view = render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  )
  nav.start()
  return { nav, view, client }
}

const tid = (nav: SpatialNavigation): string | undefined =>
  nav.getFocused()?.getAttribute('data-testid') ?? undefined

/** Let Radix's FocusScope restore focus — it does so from a setTimeout(0). */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function ready() {
  await waitFor(() => expect(screen.getAllByTestId('switch').length).toBeGreaterThan(1))
  layout()
}

async function openTab(nav: SpatialNavigation, id: string) {
  const tab = screen.getAllByTestId('tab').find((el) => el.dataset.tab === id)!
  act(() => void nav.focus(tab))
  await waitFor(() => expect(panel().dataset.panel).toBe(id))
  layout()
}

describe('radix primitives example', () => {
  it('renders the settings screen from the mock API', async () => {
    const { nav } = mount()
    expect(screen.getByTestId('settings-loading')).toBeInTheDocument()

    await ready()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('mediavault')
    expect(screen.getAllByTestId('tab')).toHaveLength(3)
    nav.destroy()
  })

  it('navigates the page controls: tabs, the header switch, and the panel', async () => {
    const { nav } = mount()
    await ready()

    act(() => void nav.focus(screen.getAllByTestId('tab')[0]!))
    expect(nav.getFocused()?.dataset.tab).toBe('general')

    act(() => void nav.navigate('up'))
    // The only thing above the tablist is the header's Remote access switch —
    // a plain Radix Switch needs no integration work at all.
    expect(tid(nav)).toBe('switch')
    expect(nav.getFocused()?.getAttribute('role')).toBe('switch')

    act(() => void nav.navigate('down'))
    expect(tid(nav)).toBe('tab')

    act(() => void nav.navigate('down'))
    expect(panel().contains(nav.getFocused())).toBe(true)
    nav.destroy()
  })

  it('toggles a Switch through nav.activate() and survives the re-render', async () => {
    const { nav } = mount()
    await ready()

    const before = screen.getAllByTestId('switch').find((el) => el.dataset.switch === 'Telemetry')!
    expect(before).toHaveAttribute('data-state', 'unchecked')
    act(() => void nav.focus(before))
    act(() => void nav.activate())

    await waitFor(() => {
      const now = screen.getAllByTestId('switch').find((el) => el.dataset.switch === 'Telemetry')!
      expect(now).toHaveAttribute('data-state', 'checked')
    })
    // The optimistic patch re-renders the row; focus must still be on it.
    expect(nav.getFocused()?.dataset.switch).toBe('Telemetry')
    nav.destroy()
  })

  // --- Tabs -----------------------------------------------------------------

  it('walks the tablist by direction and swaps the panel', async () => {
    const { nav } = mount()
    await ready()

    act(() => void nav.focus(screen.getAllByTestId('tab')[0]!))
    act(() => void nav.navigate('right'))
    expect(nav.getFocused()?.dataset.tab).toBe('services')
    // Radix activates on focus, so one directional press changes the panel.
    await waitFor(() => expect(panel().dataset.panel).toBe('services'))
    layout()

    act(() => void nav.navigate('down'))
    expect(panel().contains(nav.getFocused())).toBe(true)
    expect(tid(nav)).toBe('service-menu-trigger')

    // `remember` on the tablist returns to the tab you left it from.
    act(() => void nav.navigate('up'))
    expect(nav.getFocused()?.dataset.tab).toBe('services')
    nav.destroy()
  })

  it('KNOWN GAP: without data-focusable a Radix tablist is a single stop', async () => {
    const { nav } = mount()
    await ready()

    const triggers = screen.getAllByTestId('tab')
    // Radix's roving tabindex: only the container is tabbable. The example
    // opts every trigger back in with `data-focusable`; strip it and the whole
    // list collapses to one stop, which no direction intent can move through.
    for (const trigger of triggers) trigger.removeAttribute('data-focusable')
    const stops = getFocusables(screen.getByTestId('tablist'), undefined, semanticVisible)
    expect(stops).toHaveLength(0)
    expect(triggers.every((el) => el.getAttribute('tabindex') === '-1')).toBe(true)
    nav.destroy()
  })

  // --- Dialog ---------------------------------------------------------------

  it('opens the Dialog on activate and moves focus into it', async () => {
    const { nav } = mount()
    await ready()
    await openTab(nav, 'advanced')

    act(() => void nav.focus(screen.getByTestId('reset-trigger')))
    act(() => void nav.activate())
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument())
    layoutOverlays()

    // Radix's FocusScope owns entry; the engine adopts it through focusin.
    expect(screen.getByTestId('dialog').contains(nav.getFocused())).toBe(true)
    expect(tid(nav)).toBe('dialog-cancel')
    nav.destroy()
  })

  it('cannot reach a control behind the modal overlay', async () => {
    const { nav } = mount()
    await ready()
    await openTab(nav, 'advanced')
    const behind = screen.getByTestId('reset-trigger')

    act(() => void nav.focus(behind))
    act(() => void nav.activate())
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument())
    layoutOverlays()

    // Radix aria-hides the page, so the background is not even a candidate.
    const reachable = getFocusables(document, undefined, semanticVisible)
    expect(reachable).not.toContain(behind)
    expect(reachable.every((el) => screen.getByTestId('dialog').contains(el))).toBe(true)

    // And no direction resolves to anything outside the dialog.
    const cancel = screen.getByTestId('dialog-cancel')
    for (const direction of ['up', 'down', 'left', 'right'] as const) {
      const target = nav.engine.findTarget(direction, cancel)
      expect(target === null || screen.getByTestId('dialog').contains(target)).toBe(true)
    }

    act(() => void nav.navigate('up'))
    expect(screen.getByTestId('dialog').contains(nav.getFocused())).toBe(true)
    nav.destroy()
  })

  it('keeps the page behind the modal unreachable even under a custom visibilityFilter', async () => {
    // Containment for a Radix dialog rides on the engine honoring the
    // `aria-hidden` that Radix applies to the rest of the page. That policy is
    // enforced unconditionally: a custom visibilityFilter (as any virtualized
    // or test harness supplies, including this repo's layoutNavOptions)
    // replaces only the *rendering* check, so containment survives it. This
    // used to be a real leak — arrows could reach controls behind the overlay.
    const client = createQueryClient()
    const leaky = createSpatialNavigation(layoutNavOptions)
    render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>,
    )
    leaky.start()
    await ready()
    await openTab(leaky, 'advanced')

    const behind = screen.getByTestId('reset-trigger')
    act(() => void leaky.focus(behind))
    act(() => void leaky.activate())
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument())
    layoutOverlays()

    // A raw getFocusables with a fully permissive filter still sees the
    // background — the semantic policy lives in the engine, not the selector.
    expect(getFocusables(document, undefined, () => true)).toContain(behind)

    // The engine does not: even with the container marker removed, so that
    // only the aria-hidden policy is left to do the work, nothing behind the
    // overlay is reachable.
    const dialog = screen.getByTestId('dialog')
    const cancel = screen.getByTestId('dialog-cancel')
    dialog.removeAttribute('data-spatial-container')
    expect(leaky.engine.findTarget('up', cancel)).toBeNull()

    dialog.setAttribute('data-spatial-container', 'contain remember')
    expect(leaky.engine.findTarget('up', cancel)).toBeNull()
    leaky.destroy()
  })

  it('restores focus to the trigger when the Dialog closes', async () => {
    const { nav } = mount()
    await ready()
    await openTab(nav, 'advanced')

    act(() => void nav.focus(screen.getByTestId('reset-trigger')))
    act(() => void nav.activate())
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument())
    layoutOverlays()

    act(() => void nav.focus(screen.getByTestId('dialog-cancel')))
    act(() => void nav.activate())
    await waitFor(() => expect(screen.queryByTestId('dialog')).toBeNull())
    await settle()
    layout()

    expect(tid(nav)).toBe('reset-trigger')
    nav.destroy()
  })

  it('closes the Dialog on a spatial:back intent', async () => {
    const { nav } = mount()
    await ready()
    await openTab(nav, 'advanced')

    act(() => void nav.focus(screen.getByTestId('reset-trigger')))
    act(() => void nav.activate())
    await waitFor(() => expect(screen.getByTestId('dialog')).toBeInTheDocument())

    // A controller's back button never produces the Escape keydown Radix
    // listens for, so the app has to translate the intent itself.
    // KNOWN GAP: the SpatialNavigation facade has no back() — navigate,
    // activate, focus and focusFirst are all forwarded, but a programmatic
    // back intent has to reach through `nav.engine`.
    act(() => {
      expect(nav.engine.back()).toBe(true)
    })
    await waitFor(() => expect(screen.queryByTestId('dialog')).toBeNull())
    nav.destroy()
  })

  // --- DropdownMenu ---------------------------------------------------------

  it('KNOWN GAP: nav.activate() alone does not open a Radix DropdownMenu', async () => {
    const { nav } = mount()
    await ready()
    await openTab(nav, 'services')
    await waitFor(() => expect(screen.getAllByTestId('service-menu-trigger').length).toBeGreaterThan(0))
    layout()

    // Radix's trigger opens from pointerdown or keydown only; the engine's
    // activate path synthesizes a click, which neither handler sees. The
    // example works around it by owning `open` and opening from
    // `spatial:activate` — strip that and the press is inert.
    const trigger = screen.getAllByTestId('service-menu-trigger')[0]!
    const swallow = (event: Event) => event.stopImmediatePropagation()
    trigger.addEventListener('spatial:activate', swallow, true)
    act(() => void nav.focus(trigger))
    act(() => void nav.activate())
    trigger.removeEventListener('spatial:activate', swallow, true)
    expect(screen.queryByTestId('service-menu')).toBeNull()

    // With the app's handler in place the same press opens it.
    act(() => void nav.activate())
    await waitFor(() => expect(screen.getByTestId('service-menu')).toBeInTheDocument())
    nav.destroy()
  })

  it('opens the DropdownMenu, navigates its items, and returns focus on select', async () => {
    const { nav } = mount()
    await ready()
    await openTab(nav, 'services')
    await waitFor(() => expect(screen.getAllByTestId('service-menu-trigger').length).toBeGreaterThan(0))
    layout()

    const trigger = screen.getAllByTestId('service-menu-trigger')[0]!
    act(() => void nav.focus(trigger))
    act(() => void nav.activate())
    await waitFor(() => expect(screen.getByTestId('service-menu')).toBeInTheDocument())
    await settle()
    layoutOverlays()

    // Entry lands on a real item, not the menu container.
    expect(tid(nav)).toBe('service-action')
    expect(nav.getFocused()?.dataset.action).toBe('start')

    act(() => void nav.navigate('down'))
    expect(nav.getFocused()?.dataset.action).toBe('restart')
    act(() => void nav.navigate('down'))
    expect(nav.getFocused()?.dataset.action).toBe('stop')

    // The menu is non-modal (no aria-hidden on the page), so `contain` is the
    // only thing keeping the search inside it.
    act(() => void nav.navigate('left'))
    expect(screen.getByTestId('service-menu').contains(nav.getFocused())).toBe(true)

    act(() => void nav.activate())
    await waitFor(() => expect(screen.queryByTestId('service-menu')).toBeNull())
    await settle()
    layout()
    expect(nav.getFocused()).toBe(trigger)
    await waitFor(() => expect(screen.getByTestId('log')).toHaveTextContent('stop'))
    nav.destroy()
  })

  it('KNOWN GAP: Radix focus guards are spatial candidates while a popper is open', async () => {
    const { nav } = mount()
    await ready()
    await openTab(nav, 'services')
    await waitFor(() => expect(screen.getAllByTestId('service-menu-trigger').length).toBeGreaterThan(0))
    layout()

    act(() => void nav.focus(screen.getAllByTestId('service-menu-trigger')[0]!))
    act(() => void nav.activate())
    await waitFor(() => expect(screen.getByTestId('service-menu')).toBeInTheDocument())

    // Radix inserts <span data-radix-focus-guard tabindex="0"> as the first and
    // last children of <body>. For a modal layer they get aria-hidden and drop
    // out; for a non-modal one they stay, so the FIRST focusable in the
    // document is a zero-size invisible span — which is what focusFirst(),
    // provider `autofocus`, and auto-restore fall back to.
    const guards = document.querySelectorAll('[data-radix-focus-guard]')
    expect(guards).toHaveLength(2)
    expect(guards[0]!.getAttribute('aria-hidden')).toBeNull()
    const first = getFocusables(document, undefined, semanticVisible)[0]!
    expect(first.hasAttribute('data-radix-focus-guard')).toBe(true)
    nav.destroy()
  })

  // --- Select ---------------------------------------------------------------

  it('opens the Select, navigates options, and commits a value', async () => {
    const { nav } = mount()
    await ready()

    const trigger = screen.getAllByTestId('select-trigger')[0]!
    expect(trigger).toHaveTextContent('Stable')
    act(() => void nav.focus(trigger))
    act(() => void nav.activate())
    await waitFor(() => expect(screen.getByTestId('select-content')).toBeInTheDocument())
    await settle()
    layoutOverlays()

    // Radix opens on the option matching the current value.
    expect(nav.getFocused()?.dataset.option).toBe('stable')
    act(() => void nav.navigate('down'))
    expect(nav.getFocused()?.dataset.option).toBe('beta')

    act(() => void nav.activate())
    await waitFor(() => expect(screen.queryByTestId('select-content')).toBeNull())
    await settle()
    await waitFor(() =>
      expect(screen.getAllByTestId('select-trigger')[0]!).toHaveTextContent('Beta'),
    )
    expect(nav.getFocused()?.getAttribute('data-testid')).toBe('select-trigger')
    nav.destroy()
  })

  it('keeps the page out of reach while the Select listbox is open', async () => {
    const { nav } = mount()
    await ready()

    const trigger = screen.getAllByTestId('select-trigger')[0]!
    act(() => void nav.focus(trigger))
    act(() => void nav.activate())
    await waitFor(() => expect(screen.getByTestId('select-content')).toBeInTheDocument())
    layoutOverlays()

    const reachable = getFocusables(document, undefined, semanticVisible)
    const content = screen.getByTestId('select-content')
    expect(reachable.length).toBeGreaterThan(0)
    expect(reachable.every((el) => content.contains(el))).toBe(true)
    nav.destroy()
  })

  it('KNOWN GAP: without data-focusable a Radix listbox has no spatial stops', async () => {
    const { nav } = mount()
    await ready()

    act(() => void nav.focus(screen.getAllByTestId('select-trigger')[0]!))
    act(() => void nav.activate())
    await waitFor(() => expect(screen.getByTestId('select-content')).toBeInTheDocument())

    const options = screen.getAllByTestId('select-option')
    expect(options.every((el) => el.getAttribute('tabindex') === '-1')).toBe(true)
    for (const option of options) option.removeAttribute('data-focusable')
    expect(getFocusables(screen.getByTestId('select-content'), undefined, semanticVisible)).toHaveLength(0)

    // Radix still holds real DOM focus on the option it opened on, so the
    // engine reports a focused element that it would refuse to navigate to.
    const focused = document.activeElement as HTMLElement
    expect(focused.dataset.testid).toBe('select-option')
    expect(nav.engine.findTarget('down', focused)).toBeNull()
    nav.destroy()
  })

  it('fires spatial:nofocustarget instead of silently doing nothing at the edge', async () => {
    const { nav } = mount()
    await ready()

    act(() => void nav.focus(screen.getAllByTestId('tab')[0]!))
    act(() => void nav.navigate('left'))
    await waitFor(() => expect(screen.getByTestId('log')).toHaveTextContent('No target: left'))
    nav.destroy()
  })
})
