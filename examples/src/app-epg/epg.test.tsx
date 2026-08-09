import { describe, expect, it } from 'vitest'
import { useEffect } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { Rect, VirtualizerOptions } from '@tanstack/react-virtual'
import { SpatialNavigationProvider, useSpatialNavigation } from 'spatial-nav-css/react'
import type { SpatialNavigation } from 'spatial-nav-css'
import { App } from './App'
import { createQueryClient } from '../shared/app'
import { applyLayout, layoutNavOptions, setRect } from '../shared/layout'
import { CHANNEL_W, DAY_MIN, ROW_H, ROW_PAD, blockBox, laneWidth } from './guide'

const WINDOW = { from: 0, to: DAY_MIN }
const LANE_W = laneWidth(WINDOW)
const CHANNELS = 15
/** Wall-clock minute the "now" marker is pinned to. 09:20. */
const NOW_MIN = 9 * 60 + 20

/** Page frame: a side rail to the right of a fully unrolled 24-hour guide. */
const TOOLBAR_Y = 40
const GRID_Y = 140
const SIDE_X = CHANNEL_W + LANE_W + 40

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * TanStack Virtual's headless hooks. jsdom performs no layout and has no
 * Element.scrollTo, so the scroll offset lives here and the test can re-window
 * the list by pushing a new one — the same injection the library's own
 * `tests/virtual-tanstack.test.ts` uses.
 */
function virtualScene(viewport = 260) {
  const listeners = new Set<(offset: number, isScrolling: boolean) => void>()
  let offset = 0
  const setOffset = (next: number): void => {
    offset = next
    for (const listener of listeners) listener(next, false)
  }
  const rect: Rect = { width: 900, height: viewport }
  const virtual: Partial<VirtualizerOptions<HTMLDivElement, Element>> = {
    initialRect: rect,
    observeElementRect: (_instance, cb) => {
      cb(rect)
    },
    observeElementOffset: (_instance, cb) => {
      listeners.add(cb)
      cb(offset, false)
      return () => listeners.delete(cb)
    },
    scrollToFn: (next) => setOffset(next),
    measureElement: () => ROW_H,
  }
  return { virtual, setOffset }
}

/**
 * TanStack clamps scroll targets against the scroller's real
 * scrollHeight/clientHeight, which jsdom reports as 0 — give the grid its
 * would-be metrics so `scrollToIndex` can move at all.
 */
function defineScrollMetrics(): void {
  const grid = screen.getByTestId('epg-grid')
  Object.defineProperty(grid, 'scrollHeight', { value: CHANNELS * ROW_H, configurable: true })
  Object.defineProperty(grid, 'clientHeight', { value: 260, configurable: true })
}

function Capture({ into }: { into: { nav: SpatialNavigation | null } }) {
  const nav = useSpatialNavigation()
  useEffect(() => {
    into.nav = nav
  }, [into, nav])
  return null
}

function mount() {
  const client = createQueryClient()
  const scene = virtualScene()
  const holder: { nav: SpatialNavigation | null } = { nav: null }
  const view = render(
    <QueryClientProvider client={client}>
      <SpatialNavigationProvider {...layoutNavOptions}>
        <Capture into={holder} />
        <App nowMin={NOW_MIN} virtual={scene.virtual} />
      </SpatialNavigationProvider>
    </QueryClientProvider>,
  )
  defineScrollMetrics()
  return { nav: holder.nav!, view, client, setOffset: scene.setOffset }
}

const ready = () =>
  waitFor(() => expect(screen.getAllByTestId('epg-row').length).toBeGreaterThan(3))

/**
 * The guide, laid out the way the CSS lays it out — and the reason this test
 * cannot lean on `applyLayout` alone: a programme's WIDTH comes from its
 * duration, so no uniform row/column flow can express it. Each block gets its
 * own rect from the very same `blockBox()` the component styles itself with.
 *
 * Rows are placed at their absolute index offset (an "unrolled" scroller). The
 * engine only ever compares rects, so a consistent absolute frame behaves
 * exactly like a clipped, scrolled one.
 */
function layout(scrolledPx = 0): void {
  for (const row of screen.queryAllByTestId('epg-row')) {
    const y = GRID_Y + Number(row.dataset.row) * ROW_H
    setRect(row, { x: -scrolledPx, y, w: CHANNEL_W + LANE_W, h: ROW_H })
    // The channel cell is `position: sticky`, so horizontal scrolling never
    // moves it — and its box matches a block's exactly, because the engine's
    // "overlapping" tier asks whether a candidate reaches further down
    // (candidate.bottom > origin.bottom). A taller cell would count as being
    // below every block in its own row.
    setRect(row.querySelector<HTMLElement>('[data-testid="epg-channel"]'), {
      x: 0,
      y: y + ROW_PAD,
      w: CHANNEL_W - 8,
      h: ROW_H - ROW_PAD * 2,
    })
    for (const block of row.querySelectorAll<HTMLElement>('[data-testid="epg-programme"]')) {
      const box = blockBox(
        {
          startMin: Number(block.dataset.startMin),
          durationMin: Number(block.dataset.durationMin),
        },
        WINDOW,
      )
      setRect(block, {
        x: CHANNEL_W + box.left - scrolledPx,
        y: y + ROW_PAD,
        w: box.width,
        h: ROW_H - ROW_PAD * 2,
      })
    }
  }
  applyLayout([
    { selector: '[data-testid="epg-range"]', flow: 'row', x: SIDE_X, y: TOOLBAR_Y, w: 80, h: 36, gap: 8 },
    {
      selector: '[data-testid="epg-detail"] button',
      flow: 'column',
      x: SIDE_X,
      y: GRID_Y + 120,
      w: 240,
      h: 40,
      gap: 8,
    },
  ])
  setRect(document.querySelector('[data-testid="epg-grid"]'), {
    x: 0,
    y: GRID_Y,
    w: CHANNEL_W + LANE_W,
    h: CHANNELS * ROW_H,
  })
  setRect(document.querySelector('[data-testid="epg-ranges"]'), {
    x: SIDE_X,
    y: TOOLBAR_Y,
    w: 264,
    h: 36,
  })
  setRect(document.querySelector('[data-testid="epg-detail"]'), {
    x: SIDE_X,
    y: GRID_Y,
    w: 264,
    h: 260,
  })
}

const mountedRows = (): number[] =>
  screen.getAllByTestId('epg-row').map((row) => Number(row.dataset.row))

const rowEl = (index: number): HTMLElement =>
  screen.getAllByTestId('epg-row').find((row) => row.dataset.row === String(index))!

const blocksIn = (index: number): HTMLElement[] => [
  ...rowEl(index).querySelectorAll<HTMLElement>('[data-testid="epg-programme"]'),
]

const channelCell = (index: number): HTMLElement =>
  rowEl(index).querySelector<HTMLElement>('[data-testid="epg-channel"]')!

const block = (id: string): HTMLElement =>
  document.querySelector<HTMLElement>(`[data-programme-id="${id}"]`)!

const focusedProgramme = (nav: SpatialNavigation): string | undefined =>
  nav.getFocused()?.dataset.programmeId

describe('EPG example', () => {
  it('renders skeleton rows, then a virtualized guide from the mock API', async () => {
    mount()
    expect(screen.getAllByTestId('epg-row-skeleton').length).toBeGreaterThan(0)

    await ready()
    expect(screen.getByTestId('count')).toHaveTextContent('15 channels')
    expect(screen.getByTestId('count')).toHaveTextContent('344 programmes')
    // Windowed: the grid never mounts all 15 channels at once.
    expect(mountedRows().length).toBeLessThan(CHANNELS)
    expect(mountedRows()[0]).toBe(0)
    expect(channelCell(0)).toHaveTextContent('Aurora One')
    // Variable-width blocks: the second Aurora One programme is a 2-hour film.
    expect(block('channel-1-p1').dataset.durationMin).toBe('120')
  })

  it('moves along a channel row in time order', async () => {
    const { nav } = mount()
    await ready()
    layout()

    act(() => {
      nav.focus(block('channel-1-p0'))
    })
    const walked: string[] = []
    const starts: number[] = []
    for (let press = 0; press < 4; press++) {
      act(() => {
        nav.navigate('right')
      })
      walked.push(focusedProgramme(nav)!)
      starts.push(Number(nav.getFocused()!.dataset.startMin))
    }

    expect(walked).toEqual(['channel-1-p1', 'channel-1-p2', 'channel-1-p3', 'channel-1-p4'])
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
    // Never drifts off the channel, however wide the blocks are.
    expect(nav.getFocused()?.dataset.channelId).toBe('channel-1')
  })

  it('moves down from a 2-hour block onto the programme under the cursor, not the first of the row', async () => {
    const { nav } = mount()
    await ready()
    layout()
    expect(mountedRows()).toEqual(expect.arrayContaining([2, 3]))

    // Meridian 06:30–08:30 "Market Watch" — two hours, so it spans four of
    // Cinema Prime's slots and its centre lands at 07:30.
    const origin = block('channel-3-p8')
    expect(origin.dataset.durationMin).toBe('120')
    act(() => {
      nav.focus(origin)
    })
    act(() => {
      nav.navigate('down')
    })

    // 07:30 falls inside Cinema Prime's 07:00–08:30 "Replay".
    expect(focusedProgramme(nav)).toBe('channel-4-p7')
    expect(nav.getFocused()).toHaveTextContent('Replay')
    // …and never the channel cell, which is the other thing sitting in the
    // next row's band.
    expect(nav.getFocused()?.dataset.testid).toBe('epg-programme')

    const next = blocksIn(3)
    // The two answers a naive implementation gives: the row's first block,
    // and the first block that merely overlaps the origin's span.
    expect(next[0]!.dataset.programmeId).toBe('channel-4-p0')
    expect(next[6]!.dataset.programmeId).toBe('channel-4-p6')
    expect(next.findIndex((el) => el.dataset.programmeId === 'channel-4-p7')).toBe(7)

    // And back up again: 07:45 is still inside the two-hour block.
    act(() => {
      nav.navigate('up')
    })
    expect(focusedProgramme(nav)).toBe('channel-3-p8')
  })

  it('does not lose focus at the ends of a row', async () => {
    const { nav } = mount()
    await ready()
    layout()

    // Left edge: the channel cell is the leftmost thing on the page.
    act(() => {
      nav.focus(channelCell(1))
    })
    act(() => {
      nav.navigate('left')
    })
    expect(nav.getFocused()).toBe(channelCell(1))
    await waitFor(() => expect(screen.getByTestId('edge')).toHaveTextContent('Edge: left'))

    // Right edge: 23:xx is the end of the guide, so the move leaves for the
    // side rail — but it must never wrap onto another channel's programme.
    const row = blocksIn(0)
    const last = row[row.length - 1]!
    act(() => {
      nav.focus(last)
    })
    act(() => {
      nav.navigate('right')
    })
    expect(nav.getFocused()).not.toBeNull()
    expect(focusedProgramme(nav)).toBeUndefined()
    expect(nav.getFocused()?.dataset.testid).toBe('epg-record')

    // `remember` on the grid brings the viewer back to the same block.
    act(() => {
      nav.navigate('left')
    })
    expect(nav.getFocused()).toBe(last)
  })

  it('holds the left edge once the guide is scrolled and programmes hide under the sticky column', async () => {
    const { nav } = mount()
    await ready()
    // Five hours in: everything before 05:00 now sits *behind* the sticky
    // channel column, at rects further left than the column itself.
    layout(600)

    const cell = channelCell(1)
    act(() => {
      nav.focus(cell)
    })
    act(() => {
      nav.navigate('left')
    })
    // The engine has no occlusion model — geometry alone would happily move
    // focus onto a programme the viewer cannot see. The column declares its
    // own edge with data-nav-left="none" instead.
    expect(nav.getFocused()).toBe(cell)
    await waitFor(() => expect(screen.getByTestId('edge')).toHaveTextContent('Edge: left'))

    // Vertical moves still keep the time column while scrolled.
    act(() => {
      nav.focus(block('channel-3-p8'))
    })
    act(() => {
      nav.navigate('down')
    })
    expect(focusedProgramme(nav)).toBe('channel-4-p7')
  })

  it('crosses between the channel list and the grid', async () => {
    const { nav } = mount()
    await ready()
    layout()

    act(() => {
      nav.focus(channelCell(2))
    })
    act(() => {
      nav.navigate('right')
    })
    expect(focusedProgramme(nav)).toBe('channel-3-p0')

    act(() => {
      nav.navigate('left')
    })
    expect(nav.getFocused()).toBe(channelCell(2))

    // Down inside the channel list stays in the channel list.
    act(() => {
      nav.navigate('down')
    })
    expect(nav.getFocused()).toBe(channelCell(3))
    expect(focusedProgramme(nav)).toBeUndefined()
  })

  it('drives the details panel from the spatial:focus event', async () => {
    const { nav } = mount()
    await ready()
    layout()

    act(() => {
      nav.focus(block('channel-3-p8'))
    })
    await waitFor(() =>
      expect(screen.getByTestId('epg-detail-title')).toHaveTextContent('Market Watch'),
    )
    expect(screen.getByTestId('epg-detail-channel')).toHaveTextContent('102 · Meridian')
    expect(screen.getByTestId('epg-detail-time')).toHaveTextContent('06:30–08:30')

    act(() => {
      nav.navigate('right')
    })
    await waitFor(() =>
      expect(screen.getByTestId('epg-detail-title')).toHaveTextContent('Feature Presentation'),
    )
    expect(screen.getByTestId('epg-detail-time')).toHaveTextContent('08:30–09:30')
  })

  it('continues past the mounted window and keeps the time column', async () => {
    const { nav } = mount()
    await ready()
    layout()

    const last = Math.max(...mountedRows())
    // Below row ~2 the side rail no longer classifies as "down", so the engine
    // really does report an edge rather than escaping sideways.
    expect(last).toBeGreaterThan(2)
    const origin = blocksIn(last)[8]!
    const start = Number(origin.dataset.startMin)
    const minute = start + Number(origin.dataset.durationMin) / 2
    expect(start).toBeGreaterThan(0)

    act(() => {
      nav.focus(origin)
    })
    // Nothing is mounted below: attachVirtualEdges scrolls the virtualizer,
    // waits for the row to mount, and focuses it. Two acts, not one — React
    // flushes an async act's updates when its callback resolves, so sleeping
    // inside the same act would keep the new row from ever mounting.
    await act(async () => {
      nav.navigate('down')
    })
    await act(async () => {
      await sleep(60)
    })

    const landed = nav.getFocused()!
    expect(landed.dataset.index).toBe(String(last + 1))
    const landedStart = Number(landed.dataset.startMin)
    expect(minute).toBeGreaterThanOrEqual(landedStart)
    expect(minute).toBeLessThan(landedStart + Number(landed.dataset.durationMin))
    // The helper's default findElement would have returned the row's midnight
    // programme and silently teleported the viewer to 00:00.
    expect(landedStart).toBeGreaterThan(0)
    expect(mountedRows()).toContain(last + 1)
  })

  it('restores focus when a scroll unmounts the focused row', async () => {
    const { nav, setOffset } = mount()
    await ready()
    layout()

    const origin = blocksIn(0)[1]!
    act(() => {
      nav.focus(origin)
    })
    expect(nav.getFocused()).toBe(origin)

    // Jump to the end of the guide: rows 0–7 unmount under the focus.
    await act(async () => {
      setOffset(11 * ROW_H)
      await sleep(0)
    })
    expect(document.body.contains(origin)).toBe(false)
    expect(mountedRows()).not.toContain(0)

    // autoRestoreFocus is debounced, so give it room — but focus must come
    // back to a real, navigable element instead of falling to <body>.
    await waitFor(
      () => {
        const focused = nav.getFocused()
        expect(focused).not.toBeNull()
        expect(document.body.contains(focused!)).toBe(true)
      },
      { timeout: 2000 },
    )
    expect(document.activeElement).not.toBe(document.body)
    expect(screen.getByTestId('epg-grid').contains(nav.getFocused())).toBe(true)

    // …and the guide is still navigable afterwards.
    layout()
    act(() => {
      nav.navigate('right')
    })
    expect(nav.getFocused()).not.toBeNull()
  })

  it('leaves the guide upward at the mounted top edge (attachVirtualEdges is not reached)', async () => {
    const { nav, setOffset } = mount()
    await ready()

    await act(async () => {
      setOffset(11 * ROW_H)
      await sleep(0)
    })
    layout()

    const top = Math.min(...mountedRows())
    expect(top).toBeGreaterThan(0)
    act(() => {
      nav.focus(blocksIn(top)[4]!)
    })
    act(() => {
      nav.navigate('up')
    })

    /*
      Pinned limitation, not a wish: attachVirtualEdges only runs on
      'spatial:nofocustarget'. Anything focusable above the virtualized zone —
      here the side rail — is a real geometric target, so the engine moves
      there and the virtual advance never fires. Downward works only because
      nothing on this page sits below the guide.
    */
    expect(nav.getFocused()).not.toBeNull()
    expect(nav.getFocused()?.dataset.index).toBeUndefined()
    expect(screen.getByTestId('epg-grid').contains(nav.getFocused())).toBe(false)
  })
})
