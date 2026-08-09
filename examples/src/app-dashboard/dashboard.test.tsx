import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SpatialNavigation } from 'spatial-nav-css'
import { useSpatialNavigation } from 'spatial-nav-css/react'
import { App } from './App'
import { AppShell, createQueryClient } from '../shared/app'
import { applyLayout, layoutNavOptions, setRect } from '../shared/layout'

const LOG_ROW = 34
const LOG_TOP = 1030

/**
 * The dashboard, laid out the way the CSS lays it out: a tile strip, a chart
 * panel with a service strip beside it, the grid below, and the virtualized
 * event stream last. Re-apply after any render that adds nodes.
 */
function layout(): void {
  applyLayout([
    { selector: '[data-testid="tile-skeleton"]', flow: 'row', x: 40, y: 100, w: 200, h: 88, gap: 16 },
    { selector: '[data-testid="stat-tile"]', flow: 'row', x: 40, y: 100, w: 200, h: 88, gap: 16 },
    { selector: '[data-testid="chart-control"]', flow: 'row', x: 40, y: 230, w: 110, h: 34, gap: 10 },
    { selector: '[data-testid="service"]', flow: 'column', x: 820, y: 230, w: 260, h: 32, gap: 6 },
    // Header and body are two 6-wide fields on the same column grid. Document
    // order is already row-major — the select control comes first in every
    // row — so one rule places each.
    {
      selector: '[data-testid="grid-select-all"], [data-testid="grid-sort"]',
      flow: 6,
      x: 40,
      y: 620,
      w: 130,
      h: 34,
      gap: 6,
    },
    {
      selector: '[data-testid="row-select"], [data-testid="grid-cell"]',
      flow: 6,
      x: 40,
      y: 664,
      w: 130,
      h: 34,
      gap: 6,
    },
  ])
  setRect(screen.queryByTestId('grid-filter'), { x: 40, y: 560, w: 260, h: 36 })
  setRect(screen.queryByTestId('page-prev'), { x: 320, y: 560, w: 80, h: 36 })
  setRect(screen.queryByTestId('page-next'), { x: 410, y: 560, w: 80, h: 36 })
  // Virtual rows are placed by their index, not by DOM order: the mounted
  // window starts wherever the scroller happens to be.
  for (const row of document.querySelectorAll<HTMLElement>('[data-testid="log-row"]')) {
    setRect(row, { x: 40, y: LOG_TOP + Number(row.dataset.index) * LOG_ROW, w: 800, h: 30 })
  }
  setRect(screen.queryByTestId('tiles'), { x: 30, y: 90, w: 870, h: 108 })
  setRect(screen.queryByTestId('chart-panel'), { x: 30, y: 210, w: 760, h: 280 })
  setRect(screen.queryByTestId('services-panel'), { x: 810, y: 210, w: 280, h: 280 })
  setRect(screen.queryByTestId('grid-panel'), { x: 30, y: 540, w: 870, h: 460 })
  setRect(screen.queryByTestId('log-scroller'), { x: 30, y: 1020, w: 870, h: 238 })
}

/**
 * jsdom performs no layout, so the scroller reports scrollHeight/clientHeight
 * of 0 — which clamps every scroll target to 0 — and Element.scrollTo does not
 * exist at all. Give it the metrics a browser would report and a scrollTo that
 * writes scrollTop and fires 'scroll': the two hooks TanStack Virtual reads.
 * Same technique as the library's own tests/virtual-tanstack.test.ts.
 */
function makeScrollable(el: HTMLElement, viewport: number, total: number): void {
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: viewport })
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: total })
  Object.defineProperty(el, 'scrollTo', {
    configurable: true,
    value: (options: ScrollToOptions) => {
      el.scrollTop = options.top ?? 0
      el.dispatchEvent(new Event('scroll'))
    },
  })
}

/** Mount exactly the way the page does, and hand the test the same nav instance. */
function mount() {
  const client = createQueryClient()
  let nav!: SpatialNavigation
  function Probe() {
    nav = useSpatialNavigation()
    return null
  }
  const view = render(
    <AppShell client={client} nav={layoutNavOptions}>
      <Probe />
      <App />
    </AppShell>,
  )
  return { nav, view, client }
}

const ready = async (): Promise<void> => {
  await waitFor(() => expect(screen.getAllByTestId('grid-row')).toHaveLength(8))
  await waitFor(() => expect(screen.getAllByTestId('log-row').length).toBeGreaterThan(0))
}

const tile = (id: string): HTMLElement =>
  screen.getAllByTestId('stat-tile').find((el) => el.dataset.stat === id)!

const control = (name: string): HTMLElement =>
  screen.getAllByTestId('chart-control').find((el) => el.dataset.control === name)!

const header = (column: string): HTMLElement =>
  screen.getAllByTestId('grid-sort').find((el) => el.dataset.column === column)!

const gridCell = (row: number, column: string): HTMLElement => {
  const id = screen.getAllByTestId('grid-row')[row]!.dataset.rowId
  return screen
    .getAllByTestId('grid-cell')
    .find((el) => el.dataset.rowId === id && el.dataset.column === column)!
}

const columnText = (column: string): string[] =>
  screen
    .getAllByTestId('grid-cell')
    .filter((el) => el.dataset.column === column)
    .map((el) => el.textContent!)

const mountedLogIndices = (): number[] =>
  screen.queryAllByTestId('log-row').map((el) => Number(el.dataset.index))

const logRow = (index: number): HTMLElement =>
  screen.getAllByTestId('log-row').find((el) => Number(el.dataset.index) === index)!

const settle = (ms = 60): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('ops dashboard example', () => {
  it('renders skeletons, then real data from the mock API', async () => {
    const { nav } = mount()
    expect(screen.getAllByTestId('tile-skeleton')).toHaveLength(4)

    await waitFor(() => expect(screen.getAllByTestId('stat-tile')).toHaveLength(4))
    await ready()
    expect(screen.getByTestId('summary')).toHaveTextContent('7 services · 3 pools · 48 titles')
    expect(tile('cpu')).toHaveTextContent('54.9%')
    expect(tile('services')).toHaveTextContent('5/7')
    expect(tile('storage')).toHaveTextContent('83%')
    expect(tile('catalog')).toHaveTextContent('30/48')
    expect(screen.getAllByTestId('service')).toHaveLength(7)
    expect(screen.getByTestId('page-status')).toHaveTextContent('Page 1 / 6')
    expect(screen.getByTestId('log-count')).toHaveTextContent('40 events')

    // Provider autofocus runs at start(), while every panel is a skeleton;
    // claimFocus hands the highlight to the first tile when the data lands.
    await waitFor(() => expect(nav.getFocused()?.dataset.testid).toBe('stat-tile'))
    expect(nav.getFocused()?.dataset.stat).toBe('cpu')
    nav.destroy()
  })

  it('walks the grid in both axes, cell by cell', async () => {
    const { nav } = mount()
    await ready()
    layout()

    act(() => {
      nav.focus(gridCell(0, 'title'))
    })
    expect(nav.getFocused()).toHaveTextContent('Aetherbound Directive')

    act(() => {
      nav.navigate('right')
    })
    expect(nav.getFocused()?.dataset.column).toBe('developer')
    expect(nav.getFocused()).toHaveTextContent('Foundry 9')

    // Six columns, so down is one row later — not one cell later.
    act(() => {
      nav.navigate('down')
    })
    expect(nav.getFocused()?.dataset.column).toBe('developer')
    expect(nav.getFocused()).toHaveTextContent('Vermilion Works')

    act(() => {
      nav.navigate('left')
    })
    expect(nav.getFocused()).toHaveTextContent('Aetherbound Protocol')

    // One more left reaches the row's checkbox: in a control cell the stop is
    // the control, never the <td> wrapped around it.
    act(() => {
      nav.navigate('left')
    })
    expect(nav.getFocused()?.dataset.testid).toBe('row-select')

    // Up out of the first body row lands on the header that sorts that column.
    act(() => {
      nav.focus(gridCell(0, 'sizeGB'))
    })
    act(() => {
      nav.navigate('up')
    })
    expect(nav.getFocused()?.dataset.testid).toBe('grid-sort')
    expect(nav.getFocused()?.dataset.column).toBe('sizeGB')
    nav.destroy()
  })

  it('sorts from a header cell without losing focus to the body', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const sizeHeader = header('sizeGB')
    const before = columnText('title')
    act(() => {
      nav.focus(sizeHeader)
      nav.activate()
    })
    await waitFor(() => expect(columnText('title')).not.toEqual(before))
    layout()

    // Numeric columns sort descending first, and the header re-rendered with a
    // new glyph — yet it still holds the highlight.
    expect(gridCell(0, 'sizeGB')).toHaveTextContent('91 GB')
    expect(nav.getFocused()).toBe(sizeHeader)
    expect(nav.getFocused()).not.toBe(document.body)

    // Harder case: the highlight sits on a body cell while every row moves
    // under it. Paging means the row can leave the page entirely, so the
    // contract is "focus stays usable", not "focus stays on that row".
    act(() => {
      nav.focus(gridCell(2, 'title'))
    })
    const sorted = columnText('title')
    act(() => {
      fireEvent.click(sizeHeader)
    })
    await waitFor(() => expect(columnText('title')).not.toEqual(sorted))
    layout()

    await waitFor(() => {
      const focused = nav.getFocused()
      expect(focused).not.toBeNull()
      expect(focused).not.toBe(document.body)
      expect(screen.getByTestId('grid-panel').contains(focused)).toBe(true)
    })
    // And it is a usable origin, not just a remembered pointer.
    act(() => {
      nav.navigate('down')
    })
    expect(screen.getByTestId('grid-panel').contains(nav.getFocused())).toBe(true)
    nav.destroy()
  })

  it('filters the row set down and keeps focus usable', async () => {
    const { nav } = mount()
    await ready()
    layout()

    act(() => {
      nav.focus(gridCell(3, 'title'))
    })
    const input = screen.getByTestId('grid-filter')
    await act(async () => {
      fireEvent.change(input, { target: { value: 'zenith' } })
    })
    await waitFor(() => expect(screen.getAllByTestId('grid-row')).toHaveLength(5))
    layout()
    expect(screen.getByTestId('selection-count')).toHaveTextContent('5 of 48 rows')

    // The cell the highlight was on is gone; it must not fall to <body>.
    await waitFor(() => {
      const focused = nav.getFocused()
      expect(focused).not.toBeNull()
      expect(document.body.contains(focused!)).toBe(true)
    })

    // The field is editable, so the keyboard adapter swallows every mapped key
    // — including the arrows that would take a d-pad user back out. The field
    // hands the vertical axis back to the engine itself.
    act(() => {
      nav.focus(input)
    })
    act(() => {
      fireEvent.keyDown(input, { key: 'ArrowDown' })
    })
    expect(nav.getFocused()).not.toBe(input)
    expect(screen.getByTestId('grid-panel').contains(nav.getFocused())).toBe(true)
    nav.destroy()
  })

  it('toggles row selection from a checkbox cell without moving the highlight', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const box = screen.getAllByTestId('row-select')[0] as HTMLInputElement
    expect(box.checked).toBe(false)

    act(() => {
      nav.focus(box)
      nav.activate()
    })
    await waitFor(() => expect(screen.getByTestId('selection-count')).toHaveTextContent('1 selected'))
    expect((screen.getAllByTestId('row-select')[0] as HTMLInputElement).checked).toBe(true)
    expect(screen.getAllByTestId('grid-row')[0]).toHaveClass('is-selected')
    expect(nav.getFocused()).toBe(box)

    // The header checkbox is the same kind of stop, one row up.
    act(() => {
      nav.navigate('up')
    })
    expect(nav.getFocused()?.dataset.testid).toBe('grid-select-all')
    nav.destroy()
  })

  it('pages the grid and leaves focus on a live control', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const first = columnText('title')[0]
    const next = screen.getByTestId('page-next')
    act(() => {
      nav.focus(next)
      nav.activate()
    })
    await waitFor(() => expect(screen.getByTestId('page-status')).toHaveTextContent('Page 2 / 6'))
    layout()

    expect(columnText('title')[0]).not.toBe(first)
    // The control that paged survived its own re-render.
    expect(nav.getFocused()).toBe(next)

    act(() => {
      nav.navigate('down')
    })
    expect(screen.getByTestId('grid-panel').contains(nav.getFocused())).toBe(true)
    nav.destroy()
  })

  it('drives the charts from controls — the chart surface is not a stop', async () => {
    const { nav } = mount()
    await ready()
    layout()

    expect(screen.getByTestId('metrics-chart')).not.toHaveAttribute('data-focusable')
    expect(screen.getByTestId('storage-chart')).not.toHaveAttribute('data-focusable')
    // Recharts' accessibility layer would render <svg tabindex="0"> and make
    // the canvas a stop with its own arrow keys. Pinned against upgrades.
    for (const id of ['metrics-chart', 'storage-chart']) {
      expect(screen.getByTestId(id).querySelector('svg')).not.toHaveAttribute('tabindex')
    }
    expect(screen.getByTestId('chart-readout')).toHaveTextContent('24h · CPU, Memory')

    const range = control('range-6h')
    act(() => {
      nav.focus(range)
      nav.activate()
    })
    expect(screen.getByTestId('chart-readout')).toHaveTextContent('6h · CPU, Memory')
    expect(nav.getFocused()).toBe(range)

    // The control row is an ordinary line of stops.
    act(() => {
      nav.navigate('right')
    })
    expect(nav.getFocused()?.dataset.control).toBe('range-24h')

    act(() => {
      nav.focus(control('series-memory'))
      nav.activate()
    })
    expect(screen.getByTestId('chart-readout')).toHaveTextContent('6h · CPU')
    expect(nav.getFocused()?.dataset.control).toBe('series-memory')
    nav.destroy()
  })

  it('crosses into the service strip and restarts one in place', async () => {
    const { nav } = mount()
    await ready()
    layout()

    act(() => {
      nav.focus(control('series-networkMbps'))
    })
    act(() => {
      nav.navigate('right')
    })
    expect(screen.getByTestId('services-panel').contains(nav.getFocused())).toBe(true)

    const degraded = screen.getAllByTestId('service').find((el) => el.dataset.state === 'degraded')!
    const id = degraded.dataset.serviceId
    act(() => {
      nav.focus(degraded)
    })
    await act(async () => {
      nav.activate()
    })

    await waitFor(() =>
      expect(
        screen.getAllByTestId('service').find((el) => el.dataset.serviceId === id),
      ).toHaveAttribute('data-state', 'running'),
    )
    // The optimistic update re-rendered the focused button in place.
    expect(nav.getFocused()?.dataset.serviceId).toBe(id)
    nav.destroy()
  })

  it('crosses tiles ↔ chart controls ↔ grid ↔ stream, remembering each zone', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const secondTile = screen.getAllByTestId('stat-tile')[1]!
    act(() => {
      nav.focus(secondTile)
    })
    act(() => {
      nav.navigate('down')
    })
    expect(screen.getByTestId('chart-panel').contains(nav.getFocused())).toBe(true)
    const landed = nav.getFocused()!

    act(() => {
      nav.navigate('up')
    })
    // `remember` on the tile strip: re-entry returns to the tile we left.
    expect(nav.getFocused()).toBe(secondTile)

    act(() => {
      nav.navigate('down')
    })
    expect(nav.getFocused()).toBe(landed)

    // The valuable one for a grid: leave from a body cell, come back to it.
    const cell = gridCell(7, 'developer')
    act(() => {
      nav.focus(cell)
    })
    act(() => {
      nav.navigate('down')
    })
    expect(screen.getByTestId('log-scroller').contains(nav.getFocused())).toBe(true)

    act(() => {
      nav.navigate('up')
    })
    expect(nav.getFocused()).toBe(cell)
    nav.destroy()
  })

  it('continues past the mounted edge of the virtualized stream', async () => {
    const { nav } = mount()
    await ready()
    const scroller = screen.getByTestId('log-scroller')
    makeScrollable(scroller, 238, 40 * LOG_ROW)
    layout()

    const before = mountedLogIndices()
    // Windowing is real: most of the 40 events are not in the DOM at all.
    expect(before.length).toBeGreaterThan(1)
    expect(before.length).toBeLessThan(40)

    const edge = before[before.length - 1]!
    act(() => {
      nav.focus(logRow(edge))
    })
    expect(nav.getFocused()?.dataset.index).toBe(String(edge))

    // Down at the mounted edge finds nothing, so the engine fires
    // spatial:nofocustarget and attachVirtualEdges takes over: scroll, wait
    // for the row to mount, focus it.
    await act(async () => {
      nav.navigate('down')
      await settle()
    })
    layout()

    expect(nav.getFocused()?.dataset.testid).toBe('log-row')
    expect(nav.getFocused()?.dataset.index).toBe(String(edge + 1))
    expect(mountedLogIndices()).not.toEqual(before)
    expect(document.body.contains(nav.getFocused())).toBe(true)
    nav.destroy()
  })

  it('restores focus inside the stream when a scroll unmounts the focused row', async () => {
    const { nav } = mount()
    await ready()
    const scroller = screen.getByTestId('log-scroller')
    makeScrollable(scroller, 238, 40 * LOG_ROW)
    layout()

    const mounted = mountedLogIndices()
    act(() => {
      nav.focus(logRow(mounted[0]!))
    })

    // Jump the window to the far end of the stream: the focused row stops
    // existing. Auto-restore walks the surviving container chain — the
    // scroller is still there, so the highlight lands back inside it.
    await act(async () => {
      scroller.scrollTo({ top: 39 * LOG_ROW })
      await settle()
    })
    layout()
    expect(mountedLogIndices()).not.toContain(mounted[0])

    await waitFor(() => {
      const focused = nav.getFocused()
      expect(focused).not.toBeNull()
      expect(scroller.contains(focused)).toBe(true)
    })
    nav.destroy()
  })
})
