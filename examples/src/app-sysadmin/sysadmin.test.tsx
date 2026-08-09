import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createSpatialNavigation, keyboardAdapter, type SpatialNavigation } from 'spatial-nav-css'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { createQueryClient } from '../shared/app'
import { applyLayout, layoutNavOptions, setRect } from '../shared/layout'

/**
 * The console laid out the way the CSS lays it out: a 220px category rail, the
 * field panel beside it, the save bar underneath, and a confirm dialog on top
 * when one is open. Re-applied after every render that adds nodes.
 */
function layout(): void {
  applyLayout([
    { selector: '[data-testid="category"]', flow: 'column', x: 0, y: 100, w: 220, h: 46, gap: 4 },
    { selector: '[data-testid="field-control"]', flow: 'column', x: 260, y: 120, w: 320, h: 40, gap: 30 },
    { selector: '[data-testid="log-filter"]', flow: 'row', x: 260, y: 220, w: 70, h: 28, gap: 6 },
    { selector: '[data-testid="log-row"]', flow: 'column', x: 260, y: 260, w: 520, h: 26, gap: 2 },
    { selector: '[data-testid="service-action"]', flow: 3, x: 560, y: 130, w: 70, h: 26, gap: 6 },
    { selector: '[data-testid="restore-defaults"]', flow: 'row', x: 700, y: 140, w: 110, h: 36 },
    { selector: '[data-testid="stop-all"]', flow: 'row', x: 700, y: 210, w: 110, h: 36 },
    { selector: '.sa-savebar button', flow: 'row', x: 560, y: 620, w: 130, h: 38, gap: 10 },
    { selector: '.spatial-dialog button', flow: 'row', x: 420, y: 300, w: 120, h: 40, gap: 12 },
  ])
  setRect(document.querySelector('[data-testid="cats"]'), { x: 0, y: 100, w: 220, h: 300 })
  setRect(document.querySelector('[data-testid="panel"]'), { x: 260, y: 100, w: 560, h: 460 })
  setRect(document.querySelector('[data-testid="logs"]'), { x: 260, y: 210, w: 560, h: 300 })
  setRect(document.querySelector('[data-testid="savebar"]'), { x: 260, y: 610, w: 560, h: 56 })
  setRect(document.querySelector('.spatial-dialog'), { x: 400, y: 240, w: 300, h: 160 })
}

function mount(nav: SpatialNavigation = createSpatialNavigation(layoutNavOptions)) {
  const client = createQueryClient()
  const view = render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  )
  nav.start()
  return { nav, view, client }
}

/** Wait for the console to replace the "Reading /etc…" placeholder. */
async function ready(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('panel')).toBeInTheDocument())
  layout()
}

const field = (name: string): HTMLInputElement =>
  document.getElementById(`cfg-${name}`) as HTMLInputElement

const categoryButton = (id: string): HTMLElement =>
  screen.getAllByTestId('category').find((el) => el.dataset.category === id)!

const key = (target: EventTarget, k: string): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
}

// The suite runs in about a second idle, but every assertion here waits on a
// TanStack Form store update *and* a jsdom getComputedStyle pass through the
// engine, so it degrades badly on a contended machine. The headroom is
// insurance: a flaky regression pin is worse than a slow one.
describe('sysadmin config console example', { timeout: 20_000 }, () => {
  it('loads settings from the mock API into the form', async () => {
    const { nav } = mount()
    expect(screen.getByTestId('booting')).toBeInTheDocument()

    await ready()
    expect(field('hostname')).toHaveValue('mediavault')
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('All changes saved')

    // The rail is the cold-start entry point via data-spatial-autofocus.
    act(() => {
      nav.focusFirst()
    })
    expect(nav.getFocused()?.dataset.category).toBe('general')
    nav.destroy()
  })

  it('crosses between the category rail and the field panel, remembering both', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(categoryButton('general'))
    })
    act(() => {
      nav.navigate('right')
    })
    expect(screen.getByTestId('panel').contains(nav.getFocused())).toBe(true)

    // Step down inside the panel, then leave and come back: `remember` has to
    // return focus to the control we left, not to the top of the panel.
    act(() => {
      nav.navigate('down')
    })
    const insidePanel = nav.getFocused()
    expect(insidePanel?.dataset.field).toBe('timezone')

    act(() => {
      nav.navigate('left')
    })
    expect(nav.getFocused()?.dataset.testid).toBe('category')

    act(() => {
      nav.navigate('right')
    })
    expect(nav.getFocused()).toBe(insidePanel)
    nav.destroy()
  })

  it('swaps the panel when the category changes without losing focus', async () => {
    const { nav } = mount()
    await ready()

    // Stand *inside* the panel, then switch category without moving focus
    // first: the focused control is about to be unmounted underneath us.
    act(() => {
      nav.focus(field('hostname'))
    })
    expect(nav.getFocused()).toBe(field('hostname'))

    act(() => {
      categoryButton('network').click()
    })
    await waitFor(() => expect(field('sshPort')).toBeTruthy())
    layout()
    expect(document.getElementById('cfg-hostname')).toBeNull()

    // autoRestoreFocus has to land somewhere real — never on the body.
    await waitFor(() => {
      const focused = nav.getFocused()
      expect(focused).not.toBeNull()
      expect(focused).not.toBe(document.body)
      expect(document.body.contains(focused!)).toBe(true)
    })

    // …and navigation still works from wherever it landed.
    act(() => {
      nav.focus(categoryButton('network'))
      nav.navigate('right')
    })
    expect(screen.getByTestId('panel').contains(nav.getFocused())).toBe(true)
    nav.destroy()
  })

  it('leaves arrow keys to a focused text input but not to a button', async () => {
    // This test needs the real keyboard adapter: the contract under test lives
    // in the adapter's isEditable check, not in the engine.
    const nav = createSpatialNavigation({ ...layoutNavOptions, adapters: [keyboardAdapter()] })
    mount(nav)
    await ready()

    const hostname = field('hostname')
    act(() => {
      nav.focus(hostname)
    })
    expect(nav.getFocused()).toBe(hostname)

    act(() => {
      key(hostname, 'ArrowDown')
      key(hostname, 'ArrowRight')
    })
    // Native editing wins: the caret moved, spatial focus did not.
    expect(nav.getFocused()).toBe(hostname)

    // A range input is half-editable — left/right belong to the slider, but
    // up/down still navigate.
    const threads = field('transcodeThreads')
    act(() => {
      nav.focus(threads)
      key(threads, 'ArrowRight')
    })
    expect(nav.getFocused()).toBe(threads)

    // The same key on a plain button does move.
    const general = categoryButton('general')
    act(() => {
      nav.focus(general)
      key(general, 'ArrowDown')
    })
    expect(nav.getFocused()).toBe(categoryButton('network'))
    nav.destroy()
  })

  it('surfaces the server 422 as a field error and puts focus on the field', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(categoryButton('network'))
      nav.activate()
    })
    await waitFor(() => expect(field('sshPort')).toBeTruthy())
    layout()

    const port = field('sshPort')
    act(() => {
      nav.focus(port)
      // A whole number, so the client validator passes it through — the range
      // is the server's business, which is what makes the 422 reachable.
      fireEvent.change(port, { target: { value: '99999' } })
    })
    await waitFor(() => expect(screen.getByTestId('dirty-state')).toHaveTextContent('Unsaved'))

    act(() => {
      screen.getByTestId('save').click()
    })

    const error = await screen.findByTestId('field-error')
    expect(error.dataset.field).toBe('sshPort')
    expect(error).toHaveTextContent('sshPort out of range')
    expect(screen.getByTestId('form-error')).toHaveTextContent('sshPort out of range')

    // The console does not just paint the field red — it stands the user on it.
    await waitFor(() => expect(nav.getFocused()).toBe(field('sshPort')))
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('Unsaved changes')
    nav.destroy()
  })

  it('saves a valid change and clears the dirty flag', async () => {
    const { nav } = mount()
    await ready()

    const hostname = field('hostname')
    act(() => {
      nav.focus(hostname)
      fireEvent.change(hostname, { target: { value: 'vault-2' } })
    })
    await waitFor(() => expect(screen.getByTestId('dirty-state')).toHaveTextContent('Unsaved'))

    act(() => {
      screen.getByTestId('save').click()
    })
    await waitFor(() =>
      expect(screen.getByTestId('dirty-state')).toHaveTextContent('All changes saved'),
    )
    expect(screen.queryByTestId('field-error')).toBeNull()
    nav.destroy()
  })

  it('re-renders a service row on a mutation without dropping focus', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(categoryButton('services'))
      nav.activate()
    })
    await waitFor(() => expect(screen.getAllByTestId('service-row').length).toBeGreaterThan(0))
    layout()

    const row = screen.getAllByTestId('service-row')[0]!
    const id = row.dataset.service
    expect(row.querySelector('[data-testid="service-state"]')).toHaveTextContent('running')

    const stop = screen
      .getAllByTestId('service-action')
      .find((el) => el.dataset.service === id && el.dataset.action === 'stop')!
    act(() => {
      nav.focus(stop)
      nav.activate()
    })

    await waitFor(() => {
      const current = screen.getAllByTestId('service-row').find((el) => el.dataset.service === id)!
      expect(current.querySelector('[data-testid="service-state"]')).toHaveTextContent('stopped')
    })
    // The action buttons are never disabled by state, so the pressed control
    // is still there and still focused.
    expect(nav.getFocused()).toBe(stop)
    expect(nav.getFocused()?.dataset.action).toBe('stop')
    nav.destroy()
  })

  it('filters the log viewer and keeps focus inside the log zone', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(categoryButton('logging'))
      nav.activate()
    })
    await waitFor(() => expect(screen.getAllByTestId('log-row').length).toBeGreaterThan(0))
    layout()

    const errorFilter = screen
      .getAllByTestId('log-filter')
      .find((el) => el.dataset.level === 'error')!
    act(() => {
      nav.focus(errorFilter)
      nav.activate()
    })

    await waitFor(() => {
      const rows = screen.getAllByTestId('log-row')
      expect(rows.every((row) => row.className.includes('is-error'))).toBe(true)
    })
    layout()
    expect(nav.getFocused()).toBe(errorFilter)

    act(() => {
      nav.navigate('down')
    })
    expect(nav.getFocused()?.dataset.testid).toBe('log-row')
    nav.destroy()
  })

  it('opens the danger-zone confirm, takes focus into it, and restores on cancel', async () => {
    const { nav } = mount()
    await ready()

    act(() => {
      nav.focus(categoryButton('danger'))
      nav.activate()
    })
    await waitFor(() => expect(screen.getByTestId('restore-defaults')).toBeInTheDocument())
    layout()

    const restore = screen.getByTestId('restore-defaults')
    act(() => {
      nav.focus(restore)
      nav.activate()
    })

    const dialog = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('.spatial-dialog')
      expect(found).not.toBeNull()
      return found!
    })
    layout()

    // jsdom has no showModal(), so the library's fallback marks the dialog
    // `contain` — the only correct use of containment in this screen.
    expect(dialog.dataset.spatialContainer).toBe('contain')
    expect(dialog.contains(document.activeElement)).toBe(true)

    const cancel = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!
    act(() => {
      nav.focus(cancel)
      nav.activate()
    })

    await waitFor(() => expect(document.querySelector('.spatial-dialog')).toBeNull())
    // The dialog restores the element that had focus when it opened.
    expect(document.activeElement).toBe(restore)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('Restore cancelled'))
    nav.destroy()
  })
})
