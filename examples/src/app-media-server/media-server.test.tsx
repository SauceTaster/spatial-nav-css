import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createSpatialNavigation } from 'spatial-nav-css'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { createQueryClient } from '../shared/app'
import { applyLayout, layoutNavOptions, setRect } from '../shared/layout'

/** x of each table column, so a sort header sits above its own column. */
const COLUMN_X: Record<string, number> = {
  user: 40,
  title: 196,
  device: 352,
  quality: 508,
  bandwidthMbps: 664,
}

/**
 * The admin screen, laid out the way the CSS lays it out: a library row across
 * the top, the streams grid under it, and the user list beside the storage
 * summary. Re-apply after any render that adds nodes.
 */
function layout(): void {
  applyLayout([
    { selector: '[data-testid="lib-skeleton"]', flow: 'row', x: 40, y: 140, w: 180, h: 40, gap: 20 },
    { selector: '[data-testid="scan"]', flow: 'row', x: 40, y: 140, w: 180, h: 40, gap: 20 },
    // Five data cells plus the Stop button are one six-wide row, and they
    // appear in that order in the DOM — so a single rule places the grid.
    {
      selector: '[data-testid="stream-cell"], [data-testid="stop-stream"]',
      flow: 6,
      x: 40,
      y: 310,
      w: 150,
      h: 44,
      gap: 6,
    },
    {
      selector: '[data-testid="user-role"], [data-testid="user-toggle"]',
      flow: 2,
      x: 40,
      y: 620,
      w: 200,
      h: 40,
      gap: 10,
    },
    { selector: '[data-testid="pool"]', flow: 'column', x: 600, y: 620, w: 300, h: 90, gap: 12 },
    { selector: '.ms-dialog button', flow: 'row', x: 340, y: 420, w: 160, h: 44, gap: 20 },
  ])
  // Only three columns are sortable, so the header row is sparse: place each
  // button over the column it sorts instead of packing them left to right.
  for (const header of document.querySelectorAll<HTMLElement>('[data-testid="stream-sort"]')) {
    setRect(header, { x: COLUMN_X[header.dataset.column ?? ''] ?? 0, y: 260, w: 150, h: 32 })
  }
  const at = (selector: string) => document.querySelector<HTMLElement>(selector)
  setRect(at('[data-testid="libraries"]'), { x: 30, y: 110, w: 960, h: 100 })
  setRect(at('[data-testid="streams"]'), { x: 30, y: 230, w: 960, h: 340 })
  setRect(at('[data-testid="users"]'), { x: 30, y: 580, w: 500, h: 340 })
  setRect(at('[data-testid="storage"]'), { x: 590, y: 580, w: 330, h: 340 })
  setRect(at('.ms-dialog'), { x: 300, y: 300, w: 400, h: 200 })
}

function mount() {
  const client = createQueryClient()
  const nav = createSpatialNavigation(layoutNavOptions)
  const view = render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  )
  nav.start()
  return { nav, view, client }
}

/**
 * Four independent queries feed this screen. Wait for all of them, not just
 * the one a given test drives: a straggler resolving mid-test is a React
 * update outside act(), and layout() can only place nodes that exist.
 */
const ready = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.getAllByTestId('library')).toHaveLength(4)
    expect(screen.getAllByTestId('stream-row')).toHaveLength(5)
    expect(screen.getAllByTestId('user-row')).toHaveLength(6)
    expect(screen.getAllByTestId('pool')).toHaveLength(3)
  })
}

const rowIds = (): string[] =>
  screen.queryAllByTestId('stream-row').map((row) => row.dataset.sessionId!)

const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('dialog.spatial-dialog')

const sessionOf = (el: HTMLElement | null): string | undefined =>
  el?.closest<HTMLElement>('[data-testid="stream-row"]')?.dataset.sessionId

describe('media server admin example', () => {
  it('renders placeholders, then real data from the mock API', async () => {
    const { nav } = mount()
    expect(screen.getAllByTestId('lib-skeleton')).toHaveLength(4)
    expect(screen.getByTestId('summary')).toHaveTextContent('Loading…')

    await ready()
    expect(screen.getByTestId('summary')).toHaveTextContent('5 active streams · 4 libraries')
    expect(screen.getAllByTestId('library')[0]).toHaveTextContent('Movies')
    expect(screen.getAllByTestId('user-row')).toHaveLength(6)
    expect(screen.getAllByTestId('pool')).toHaveLength(3)
    expect(rowIds()[0]).toBe('session-1')
    nav.destroy()
  })

  it('walks the streams table cell by cell on both axes', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const cells = screen.getAllByTestId('stream-cell')
    act(() => {
      nav.focus(cells[0]!)
    })
    expect(nav.getFocused()?.dataset.column).toBe('user')

    act(() => {
      nav.navigate('right')
    })
    expect(nav.getFocused()?.dataset.column).toBe('title')

    // Five data columns, so down from row 0 lands on index 5, not 1.
    act(() => {
      nav.navigate('down')
    })
    expect(nav.getFocused()).toBe(cells[6])
    expect(sessionOf(nav.getFocused())).toBe('session-2')

    // The last cell of a row is the action, whose stop is the button itself.
    act(() => {
      nav.focus(cells[4]!)
    })
    act(() => {
      nav.navigate('right')
    })
    expect(nav.getFocused()?.dataset.testid).toBe('stop-stream')
    expect(nav.getFocused()?.dataset.sessionId).toBe('session-1')
    nav.destroy()
  })

  it('crosses between the library row and the streams table, remembering both', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const scanButton = screen.getAllByTestId('scan')[1]!
    act(() => {
      nav.focus(scanButton)
    })
    act(() => {
      nav.navigate('down')
    })
    // Down picks the streams *zone* first, then the nearest stop inside it.
    const landed = nav.getFocused()!
    expect(screen.getByTestId('streams').contains(landed)).toBe(true)

    act(() => {
      nav.navigate('up')
    })
    // `remember` on the library row: re-entry returns to the card we left.
    expect(nav.getFocused()).toBe(scanButton)

    act(() => {
      nav.navigate('down')
    })
    // …and `remember` on the streams zone returns to the same cell, not to
    // whatever geometry would pick from scratch.
    expect(nav.getFocused()).toBe(landed)
    nav.destroy()
  })

  it('crosses from the user list into the read-only storage cards', async () => {
    const { nav } = mount()
    await ready()
    layout()

    act(() => {
      nav.focus(screen.getAllByTestId('user-toggle')[0]!)
    })
    act(() => {
      nav.navigate('right')
    })
    // A pool card carries no action, but data-focusable makes it a stop so the
    // highlight can rest on it and read it.
    expect(nav.getFocused()?.dataset.testid).toBe('pool')
    expect(nav.getFocused()).toHaveAttribute('tabindex', '-1')

    act(() => {
      nav.navigate('down')
    })
    expect(nav.getFocused()?.dataset.poolId).toBe('pool-2')
    nav.destroy()
  })

  it('sorts from the header row without losing focus to the body', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const header = screen
      .getAllByTestId('stream-sort')
      .find((el) => el.dataset.column === 'bandwidthMbps')!
    const before = rowIds()

    act(() => {
      nav.focus(header)
      nav.activate()
    })
    await waitFor(() => expect(rowIds()).not.toEqual(before))
    layout()
    // The header re-rendered with a new sort glyph; focus is still on it.
    expect(nav.getFocused()).toBe(header)

    // Now the harder case: the highlight is on a body cell when the rows are
    // reordered. React moves the <tr> nodes under it, so the highlight has to
    // follow the *row*, not the position it used to occupy — and where a
    // platform blurs on a DOM move, the spatial position has to survive it.
    const cell = screen.getAllByTestId('stream-cell')[0]!
    const followed = sessionOf(cell)
    act(() => {
      nav.focus(cell)
    })
    const sorted = rowIds()
    act(() => {
      fireEvent.click(header)
    })
    await waitFor(() => expect(rowIds()).not.toEqual(sorted))
    layout()

    const focused = nav.getFocused()
    expect(focused).not.toBeNull()
    expect(focused).not.toBe(document.body)
    expect(sessionOf(focused)).toBe(followed)

    // And it is still a usable origin, not just a remembered pointer.
    act(() => {
      nav.navigate('right')
    })
    expect(nav.getFocused()?.dataset.column).toBe('title')
    nav.destroy()
  })

  it('routes a stop through spatialConfirm and returns focus on cancel', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const stopButton = screen.getAllByTestId('stop-stream')[0]!
    act(() => {
      nav.focus(stopButton)
      nav.activate()
    })

    const box = dialog()
    expect(box).not.toBeNull()
    layout()
    // jsdom has no showModal(), so the library takes its documented fallback:
    // [open] plus explicit containment. A modal is the one UI where `contain`
    // is right — you must not be able to navigate out of it.
    expect(box).toHaveAttribute('data-spatial-container', 'contain')
    expect(box!.contains(nav.getFocused())).toBe(true)
    expect(nav.getFocused()).toHaveTextContent('Stop stream')

    act(() => {
      nav.navigate('left')
    })
    expect(nav.getFocused()).toHaveTextContent('Keep playing')

    await act(async () => {
      nav.activate()
    })
    expect(dialog()).toBeNull()
    expect(nav.getFocused()).toBe(stopButton)
    expect(screen.getAllByTestId('stream-row')).toHaveLength(5)
    expect(screen.getByTestId('notice')).toHaveTextContent('Left ada playing.')
    nav.destroy()
  })

  it('stops the stream when the dialog is confirmed and leaves focus in the table', async () => {
    const { nav } = mount()
    await ready()
    layout()

    act(() => {
      nav.focus(screen.getAllByTestId('stop-stream')[0]!)
      nav.activate()
    })
    expect(dialog()).not.toBeNull()
    layout()

    // The primary button already has focus — one press confirms.
    await act(async () => {
      nav.activate()
    })
    await waitFor(() => expect(screen.getAllByTestId('stream-row')).toHaveLength(4))
    layout()
    expect(rowIds()).not.toContain('session-1')

    // The button focus was restored to went away with its row; auto-restore
    // puts the highlight back inside the surviving zone rather than on <body>.
    // It is debounced (~100ms) so bulk re-renders settle first — hence the
    // explicit window rather than the 1s default.
    await waitFor(
      () => {
        const focused = nav.getFocused()
        expect(focused).not.toBeNull()
        expect(screen.getByTestId('streams').contains(focused)).toBe(true)
      },
      { timeout: 3000 },
    )
    expect(screen.getByTestId('notice')).toHaveTextContent("Stopped ada's stream.")
    nav.destroy()
  })

  it('keeps focus on the toggle that mutated its own row', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const toggle = screen.getAllByTestId('user-toggle')[0]!
    expect(toggle).toHaveTextContent('Active')
    act(() => {
      nav.focus(toggle)
    })

    await act(async () => {
      nav.activate()
    })
    await waitFor(() => expect(toggle).toHaveTextContent('Suspended'))
    expect(nav.getFocused()).toBe(toggle)
    expect(nav.getFocused()?.dataset.userId).toBe('user-1')
    nav.destroy()
  })

  it('changes a role from the select without moving the highlight', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const select = screen.getAllByTestId('user-role')[0]! as HTMLSelectElement
    expect(select.value).toBe('admin')
    act(() => {
      nav.focus(select)
    })

    await act(async () => {
      fireEvent.change(select, { target: { value: 'guest' } })
    })
    await waitFor(() => expect(select.value).toBe('guest'))
    expect(nav.getFocused()).toBe(select)
    nav.destroy()
  })

  it('hands focus back to the engine when a <select> would otherwise trap it', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const select = screen.getAllByTestId('user-role')[1]!
    act(() => {
      nav.focus(select)
    })
    expect(nav.getFocused()).toBe(select)

    // The bundled keyboard adapter treats SELECT as editable and swallows every
    // mapped key, so the row supplies its own way out on the orthogonal axis.
    // Spatial focus is DOM focus, so the engine adopts the move.
    act(() => {
      fireEvent.keyDown(select, { key: 'ArrowRight' })
    })
    expect(nav.getFocused()?.dataset.testid).toBe('user-toggle')
    expect(nav.getFocused()?.dataset.userId).toBe('user-2')
    nav.destroy()
  })

  it('reflects a library scan on the card that started it', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const button = screen.getAllByTestId('scan')[0]!
    expect(button).toHaveTextContent('Scan library')
    act(() => {
      nav.focus(button)
      nav.activate()
    })

    await waitFor(() => expect(button).toHaveTextContent('Scanning…'))
    expect(nav.getFocused()).toBe(button)
    // The library that was already scanning stays a stop: aria-disabled, not
    // disabled, so the highlight can never be stranded on a dead control.
    expect(screen.getAllByTestId('scan')[1]).toHaveAttribute('aria-disabled', 'true')
    nav.destroy()
  })
})
