import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Dialog from '@mui/material/Dialog'
import type { SpatialNavigation, SpatialNavigationOptions } from 'spatial-nav-css'
import { keyboardAdapter } from 'spatial-nav-css'
import { useSpatialNavigation } from 'spatial-nav-css/react'
import { App } from './App'
import { AppShell, createQueryClient } from '../shared/app'
import { applyLayout, layoutNavOptions, setRect } from '../shared/layout'

/**
 * The admin screen laid out the way the CSS lays it out: a header card, a
 * tablist under it, and one panel of rows below that. Portaled surfaces
 * (dialog, menu, listbox) sit under `document.body`, so they only get rects
 * once they are open — call `layout()` again after opening one.
 */
function layout(): void {
  applyLayout([
    { selector: '[data-testid="tab"]', flow: 'row', x: 0, y: 120, w: 140, h: 44, gap: 4 },
    // server panel: one control per row, right-aligned
    { selector: '[data-testid="text-input"]', flow: 'row', x: 600, y: 200, w: 180, h: 40 },
    { selector: '[data-testid="panel"] [data-testid="switch"]', flow: 'row', x: 600, y: 260, w: 60, h: 40 },
    { selector: '[data-testid="checkbox"]', flow: 'row', x: 600, y: 320, w: 60, h: 40 },
    { selector: '[data-testid="panel"] [role="combobox"]', flow: 'row', x: 600, y: 380, w: 180, h: 40 },
    // accounts panel: one row per user, three controls per row. These come
    // after the server rules on purpose — an account row's Select matches the
    // panel-wide combobox rule too, and later rules win.
    { selector: '[data-testid="account-row"]', flow: 'column', x: 0, y: 200, w: 800, h: 40, gap: 20 },
    { selector: '[data-testid="account-row"] [role="combobox"]', flow: 'column', x: 360, y: 200, w: 150, h: 40, gap: 20 },
    { selector: '[data-testid="account-active"]', flow: 'column', x: 540, y: 200, w: 60, h: 40, gap: 20 },
    { selector: '[data-testid="menu-trigger"]', flow: 'column', x: 620, y: 200, w: 40, h: 40, gap: 20 },
    // danger panel
    { selector: '[data-testid="reset-trigger"]', flow: 'row', x: 600, y: 220, w: 120, h: 40 },
    // portaled surfaces
    { selector: '[data-testid="menu-item"]', flow: 'column', x: 620, y: 260, w: 220, h: 36, gap: 4 },
    { selector: '[data-testid="option"]', flow: 'column', x: 360, y: 250, w: 150, h: 36, gap: 4 },
    { selector: '[data-testid="dialog-cancel"]', flow: 'row', x: 300, y: 500, w: 110, h: 40 },
    { selector: '[data-testid="dialog-confirm"]', flow: 'row', x: 420, y: 500, w: 110, h: 40 },
  ])
  // The header switch shares its test id with the server panel's; only ever
  // one of the two is laid out per rule, so place the header one by hand.
  const header = document.querySelector<HTMLElement>('[data-testid="header"]')
  setRect(header, { x: 0, y: 0, w: 800, h: 90 })
  setRect(header?.querySelector<HTMLElement>('[data-testid="switch"]') ?? null, {
    x: 700,
    y: 30,
    w: 60,
    h: 40,
  })
  setRect(document.querySelector('[data-testid="dialog"]'), { x: 280, y: 420, w: 280, h: 160 })
  setRect(document.querySelector('[data-testid="menu-list"]'), { x: 620, y: 250, w: 220, h: 130 })
  setRect(document.querySelector('[data-testid="listbox"]'), { x: 360, y: 240, w: 150, h: 130 })
}

/** Mount exactly the way the page does, and hand the test the same nav instance. */
function mount(nav: SpatialNavigationOptions = layoutNavOptions) {
  const client = createQueryClient()
  let handle!: SpatialNavigation
  function Probe() {
    handle = useSpatialNavigation()
    return null
  }
  const view = render(
    <AppShell client={client} nav={nav}>
      <Probe />
      <App />
    </AppShell>,
  )
  return { nav: handle, view, client }
}

const ready = () => waitFor(() => expect(screen.getAllByTestId('account-row').length).toBeGreaterThan(0))

const openTab = async (nav: SpatialNavigation, label: string) => {
  const tab = screen.getAllByTestId('tab').find((el) => el.textContent === label)!
  act(() => {
    nav.focus(tab)
    nav.activate()
  })
  await waitFor(() => expect(screen.getByTestId('panel')).toHaveAttribute('id', expect.any(String)))
  layout()
}

const text = (el: HTMLElement | null): string | undefined => el?.textContent ?? undefined

describe('material ui example', () => {
  it('renders skeletons, then accounts from the mock API', async () => {
    const { nav } = mount()
    expect(screen.getAllByTestId('account-skeleton').length).toBeGreaterThan(0)

    await ready()
    expect(screen.getAllByTestId('account-row').length).toBe(6)
    expect(text(screen.getAllByTestId('account-row')[0]!)).toContain('Ada Lovelace')
    nav.destroy()
  })

  it('claims focus for the tablist once the data arrives', async () => {
    const { nav } = mount()
    await ready()
    await waitFor(() => expect(nav.getFocused()?.dataset.testid).toBe('tab'))
    expect(text(nav.getFocused())).toBe('Accounts')
    nav.destroy()
  })

  it('navigates the page: tablist into a row, then across its controls', async () => {
    const { nav } = mount()
    await ready()
    layout()

    act(() => void nav.focus(screen.getAllByTestId('tab')[0]!))
    act(() => void nav.navigate('down'))
    // The panel is a zone: entering it lands on a control inside the first row.
    expect(screen.getByTestId('panel').contains(nav.getFocused())).toBe(true)

    const row = screen.getAllByTestId('account-row')[0]!
    act(() => void nav.focus(row.querySelector<HTMLElement>('[role="combobox"]')!))
    act(() => void nav.navigate('right'))
    expect(nav.getFocused()?.dataset.testid).toBe('account-active')
    act(() => void nav.navigate('right'))
    expect(nav.getFocused()?.dataset.testid).toBe('menu-trigger')

    // Down leaves the row for the next one; `remember` on the row is why the
    // return trip lands on the control we left rather than the first.
    act(() => void nav.navigate('down'))
    expect(screen.getAllByTestId('account-row')[1]!.contains(nav.getFocused())).toBe(true)
    act(() => void nav.navigate('up'))
    expect(nav.getFocused()?.dataset.testid).toBe('menu-trigger')
    nav.destroy()
  })

  it('marks the focused MUI control with the attribute the CSS keys off', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const control = screen.getAllByTestId('account-active')[0]!
    act(() => void nav.focus(control))
    // Both markers are written, but only the attribute survives emotion's
    // className rewrites — mui.css styles from the attribute for that reason.
    expect(control).toHaveAttribute('data-spatial-focused')
    expect(control).toHaveClass('spatial-focused')
    nav.destroy()
  })

  it('tabs: MUI owns the tablist arrows, the engine owns everything else', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const tabs = screen.getAllByTestId('tab')
    act(() => void nav.focus(tabs[0]!))

    // A real ArrowRight is MUI's roving handler: it moves focus and calls
    // preventDefault(), which is why the keyboard adapter stands down.
    act(() => {
      fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' })
    })
    expect(document.activeElement).toBe(tabs[1]!)
    // Manual activation: moving does not select.
    expect(text(screen.getByTestId('panel'))).toContain('Ada Lovelace')

    // A semantic intent (gamepad/remote) never reaches MUI's key handler, so
    // the tabs are only traversable because each one carries data-focusable.
    act(() => void nav.focus(tabs[0]!))
    act(() => void nav.navigate('right'))
    expect(text(nav.getFocused())).toBe('Server')

    act(() => void nav.activate())
    await waitFor(() => expect(screen.queryByTestId('text-input')).not.toBeNull())
    layout()

    // The switched-in panel content is reachable by geometry.
    act(() => void nav.navigate('down'))
    expect(screen.getByTestId('panel').contains(nav.getFocused())).toBe(true)
    nav.destroy()
  })

  it('dialog: entry lands inside, and nothing behind it is reachable', async () => {
    const { nav } = mount()
    await ready()
    layout()
    await openTab(nav, 'Danger zone')

    const trigger = screen.getByTestId('reset-trigger')
    act(() => {
      nav.focus(trigger)
      nav.activate()
    })
    await waitFor(() => expect(screen.queryByTestId('dialog')).not.toBeNull())
    layout()

    // Entry: MUI's FocusTrap would park DOM focus on the paper, which is
    // tabindex="-1" and not a spatial stop. `autoFocus` on the primary action
    // is what leaves the engine with something real.
    expect(nav.getFocused()?.dataset.testid).toBe('dialog-confirm')

    const dialog = screen.getByTestId('dialog')
    const confirm = screen.getByTestId('dialog-confirm')

    // THE safety property, and it has two independent guards. MUI aria-hides
    // every body child except the modal root, and the engine enforces that
    // semantic policy unconditionally (a custom `visibilityFilter` — the
    // shared test options supply one — augments it, it cannot switch it off).
    // `data-spatial-container="contain"` on the paper is the second guard,
    // the one that survives an overlay which does not aria-hide the page.
    expect(trigger.closest('[aria-hidden="true"]')).not.toBeNull()
    for (const direction of ['up', 'down', 'left', 'right'] as const) {
      const target = nav.engine.findTarget(direction, confirm)
      expect(target === null || dialog.contains(target)).toBe(true)
    }
    // Explicitly: the control that opened the dialog is NOT reachable.
    act(() => void nav.navigate('up'))
    expect(nav.getFocused()).not.toBe(trigger)
    expect(dialog.contains(nav.getFocused())).toBe(true)

    // …while the dialog's own controls still navigate normally.
    act(() => void nav.focus(screen.getByTestId('dialog-cancel')))
    act(() => void nav.navigate('right'))
    expect(nav.getFocused()?.dataset.testid).toBe('dialog-confirm')
    nav.destroy()
  })

  it('dialog: closing restores focus to the trigger', async () => {
    const { nav } = mount()
    await ready()
    layout()
    await openTab(nav, 'Danger zone')

    const trigger = screen.getByTestId('reset-trigger')
    act(() => {
      nav.focus(trigger)
      nav.activate()
    })
    await waitFor(() => expect(screen.queryByTestId('dialog')).not.toBeNull())
    layout()

    act(() => void nav.activate()) // confirm

    // MUI's FocusTrap puts DOM focus back on the trigger immediately…
    expect(document.activeElement).toBe(trigger)
    // KNOWN GAP: …but it does that while the exit transition still has the
    // page under aria-hidden="true", and the engine treats an aria-hidden
    // subtree as unnavigable. For the length of the transition the spatial
    // user has no focus at all, and if nothing intervenes the portal unmounts,
    // focus falls to <body>, and auto-restore lands on the first focusable in
    // the document rather than on the trigger. dialog.tsx restores it again
    // from the transition's onExited for exactly this reason.
    expect(nav.getFocused()).toBeNull()
    expect(trigger.closest('[aria-hidden="true"]')).not.toBeNull()

    await waitFor(() => expect(screen.queryByTestId('dialog')).toBeNull())
    await waitFor(() => expect(nav.getFocused()).toBe(trigger))
    await waitFor(() => expect(screen.getByTestId('log')).toHaveTextContent('Configuration reset'))
    nav.destroy()
  })

  it('dialog: a back intent closes it (a pad never produces Escape)', async () => {
    const { nav } = mount()
    await ready()
    layout()
    await openTab(nav, 'Danger zone')

    act(() => {
      nav.focus(screen.getByTestId('reset-trigger'))
      nav.activate()
    })
    await waitFor(() => expect(screen.queryByTestId('dialog')).not.toBeNull())

    act(() => void nav.engine.back('gamepad'))
    await waitFor(() => expect(screen.queryByTestId('dialog')).toBeNull())
    nav.destroy()
  })

  it('menu: opens on activate, items navigate, closing returns focus', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const trigger = screen.getAllByTestId('menu-trigger')[0]!
    act(() => {
      nav.focus(trigger)
      nav.activate()
    })
    await waitFor(() => expect(screen.queryAllByTestId('menu-item').length).toBe(3))
    layout()

    // MenuList focuses its first item; the engine adopts it via focusin.
    expect(text(nav.getFocused())).toBe('Send password reset')

    act(() => void nav.navigate('down'))
    expect(text(nav.getFocused())).toBe('Sign out all devices')

    // `contain` on the list slot. Beyond the page behind the popup, this is
    // what fences off MUI's two FocusTrap sentinels: they are `tabindex="0"`
    // divs inside the (not aria-hidden) modal root, so they are perfectly
    // ordinary spatial candidates with a degenerate rect.
    expect(document.querySelectorAll('[data-testid="sentinelStart"]').length).toBe(1)
    const list = screen.getByTestId('menu-list')
    for (const direction of ['up', 'down', 'left', 'right'] as const) {
      const target = nav.engine.findTarget(direction, nav.getFocused()!)
      expect(target === null || list.contains(target)).toBe(true)
    }

    act(() => void nav.activate())
    await waitFor(() => expect(screen.queryAllByTestId('menu-item').length).toBe(0))
    await waitFor(() => expect(nav.getFocused()).toBe(trigger))
    expect(screen.getByTestId('log')).toHaveTextContent('sign-out')
    nav.destroy()
  })

  it('select: KNOWN GAP — a synthesized click cannot open a MUI Select', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const combobox = screen.getAllByTestId('account-row')[0]!.querySelector<HTMLElement>('[role="combobox"]')!
    act(() => void nav.focus(combobox))

    // KNOWN GAP: MUI opens the Select from onMouseDown/onKeyDown and has no
    // click handler, while the engine's activate path is exactly one
    // `element.click()`. A raw click therefore does nothing at all — a
    // gamepad A or remote OK would be dead on this control.
    act(() => {
      combobox.click()
    })
    expect(screen.queryAllByTestId('option').length).toBe(0)

    // The wrapper's workaround (see select.tsx): own the open state and drive
    // it from the semantic intent instead.
    act(() => void nav.activate())
    await waitFor(() => expect(screen.queryAllByTestId('option').length).toBe(3))
    layout()

    expect(text(nav.getFocused())).toBe('Administrator')
    act(() => void nav.navigate('down'))
    expect(text(nav.getFocused())).toBe('Standard')
    expect(nav.engine.findTarget('left', nav.getFocused()!)).toBeNull()

    act(() => void nav.activate())
    await waitFor(() => expect(screen.queryAllByTestId('option').length).toBe(0))

    // The mutation lands, the row re-renders under the focused control, and
    // focus is still on the combobox that started it.
    await waitFor(() => expect(text(combobox)).toBe('Standard'))
    await waitFor(() => expect(nav.getFocused()).toBe(combobox))
    expect(screen.getByTestId('log')).toHaveTextContent('Ada Lovelace → user')
    nav.destroy()
  })

  it('switch: activate toggles it and focus survives the optimistic re-render', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const toggle = screen.getAllByTestId('account-active')[0]! as HTMLInputElement
    act(() => void nav.focus(toggle))
    expect(toggle.checked).toBe(true)

    act(() => void nav.activate())
    await waitFor(() =>
      expect((screen.getAllByTestId('account-active')[0] as HTMLInputElement).checked).toBe(false),
    )
    expect(nav.getFocused()).toBe(screen.getAllByTestId('account-active')[0])
    expect(screen.getByTestId('log')).toHaveTextContent('Ada Lovelace suspended')
    nav.destroy()
  })

  it('text field: arrow keys stay native and focus does not move', async () => {
    // The shared options register no adapters, so this one mounts with a real
    // keyboard adapter — the editable check lives there, not in the engine.
    const { nav } = mount({ ...layoutNavOptions, adapters: [keyboardAdapter()] })
    await ready()
    layout()
    await openTab(nav, 'Server')

    const input = screen.getByTestId('text-input')
    act(() => void nav.focus(input))
    expect(nav.getFocused()).toBe(input)

    let prevented = false
    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
      input.dispatchEvent(event)
      prevented = event.defaultPrevented
    })
    // Not consumed, not navigated: the field keeps its own arrows, so focus
    // sticks here until Tab/pointer/app handling moves it (docs/recipes.md).
    expect(prevented).toBe(false)
    expect(nav.getFocused()).toBe(input)

    // The same key on a non-editable control does navigate.
    const toggle = within(screen.getByTestId('panel')).getByTestId('switch')
    act(() => void nav.focus(toggle))
    act(() => {
      toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    })
    expect(nav.getFocused()).not.toBe(toggle)
    nav.destroy()
  })

  it('recovers a dialog that has no explicit entry point', async () => {
    // MUI's FocusTrap focuses the paper — tabindex="-1", so not a spatial
    // stop — and the engine is left with getFocused() === null. That used to
    // be terminal: DOM focus was no longer on <body>, so the engine read
    // focus as claimed, claimFocus() declined, and the first arrow press was
    // swallowed too. Focus parked on a non-navigable element inside the root
    // now counts as unclaimed, so the app (or the user's first press) can
    // still get in. Giving the primary action `autoFocus` remains better —
    // the App's dialog does — because it costs the user nothing.
    const client = createQueryClient()
    let nav!: SpatialNavigation
    function Probe() {
      nav = useSpatialNavigation()
      return null
    }
    render(
      <AppShell client={client} nav={layoutNavOptions}>
        <Probe />
        <button data-testid="behind">Behind</button>
        <Dialog open slotProps={{ paper: { 'data-testid': 'bare-dialog' } as never }}>
          <button data-testid="inside">Inside</button>
        </Dialog>
      </AppShell>,
    )
    await waitFor(() => expect(screen.queryByTestId('bare-dialog')).not.toBeNull())
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId('bare-dialog')),
    )

    expect(nav.getFocused()).toBeNull()
    act(() => {
      expect(nav.claimFocus('[data-testid="inside"]')).toBe(true)
    })
    expect(nav.getFocused()).toBe(screen.getByTestId('inside'))
    nav.destroy()
  })
})
