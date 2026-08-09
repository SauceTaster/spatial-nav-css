import { beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { keyboardAdapter, type SpatialNavigation } from 'spatial-nav-css'
import { useSpatialNavigation } from 'spatial-nav-css/react'
import { createOsQueryClient, OsProviders } from '../../os/OsProviders'
import { device } from '../../services/device'
import { useShell } from '../../state/shell'
import { applyLayout, setRect, testNavOptions } from '../../test/layout'
import { COLUMNS, ROW_HEIGHT } from './constants'
import LibraryView from './LibraryView'

const probe: { nav: SpatialNavigation | null } = { nav: null }

function Probe() {
  probe.nav = useSpatialNavigation()
  return null
}

const nav = (): SpatialNavigation => {
  if (!probe.nav) throw new Error('nav probe not mounted')
  return probe.nav
}

const GRID = { x: 252, y: 96, w: 844, h: 620 }
const TILE = { w: 152, h: 190, gap: 12 }

/**
 * jsdom performs no layout, so the three zones are described explicitly: rail
 * on the left, grid in the middle, letters down the right edge. Re-applied
 * after every render that mounts new rows.
 */
function layout(): void {
  applyLayout([
    {
      selector: '[data-testid="lib-rail"] input, [data-testid="lib-rail"] button',
      flow: 'column',
      x: 8,
      y: GRID.y,
      w: 216,
      h: 48,
      gap: 10,
    },
    {
      selector: '[data-testid="lib-tile"]',
      flow: COLUMNS,
      x: GRID.x,
      y: GRID.y,
      ...TILE,
    },
    {
      selector: '[data-testid="lib-letter"]',
      flow: 'column',
      x: 1116,
      y: GRID.y,
      w: 52,
      h: 26,
      gap: 2,
    },
  ])
  setRect(screen.getByTestId('lib-rail'), { x: 8, y: GRID.y, w: 216, h: 340 })
  setRect(screen.getByTestId('lib-grid'), GRID)
  setRect(screen.getByTestId('lib-sections'), { x: 1116, y: GRID.y, w: 52, h: GRID.h })
  const clear = screen.queryByTestId('lib-clear')
  if (clear) setRect(clear, { x: GRID.x, y: GRID.y, w: 180, h: 44 })
}

/**
 * The scroll plumbing jsdom omits. TanStack Virtual scrolls by calling
 * `scrollTo` on the scroller and re-reads `scrollTop` from its scroll event;
 * jsdom does neither, so every `scrollToIndex` would clamp to 0 and no new row
 * would ever mount. A real browser needs none of this.
 */
function enableScrolling(): void {
  const el = screen.getByTestId('lib-grid')
  if ('__scrollable' in el) return
  Object.defineProperty(el, '__scrollable', { value: true })
  let top = 0
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = value
    },
  })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: GRID.h })
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => Math.ceil(device.games.length / COLUMNS) * ROW_HEIGHT,
  })
  el.scrollTo = ((options?: ScrollToOptions | number, y?: number) => {
    top = typeof options === 'number' ? (y ?? 0) : (options?.top ?? top)
    el.dispatchEvent(new Event('scroll'))
  }) as HTMLElement['scrollTo']
}

async function mount(options?: { keyboard?: boolean }) {
  const view = render(
    <OsProviders
      client={createOsQueryClient()}
      nav={
        options?.keyboard
          ? // `detail.repeat` — the whole basis of the hold escalation — is
            // produced by an input adapter, never by nav.navigate().
            { ...testNavOptions, adapters: [keyboardAdapter()] }
          : testNavOptions
      }
    >
      <Probe />
      <LibraryView />
    </OsProviders>,
  )
  await screen.findAllByTestId('lib-tile')
  enableScrolling()
  layout()
  return view
}

const tiles = () => screen.queryAllByTestId('lib-tile')
const focusedIndex = () => Number(nav().getFocused()?.dataset.index ?? -1)

const focusTile = (index: number) => {
  act(() => void nav().focus(`[data-index="${index}"]`))
  layout()
}

/** A held direction: `repeat: true` is what the adapter uses to mark it. */
const hold = (times: number, key = 'ArrowDown') => {
  for (let i = 0; i < times; i++) {
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key, repeat: true, bubbles: true, cancelable: true }),
      )
    })
    layout()
  }
}

const letterOf = (index: number) => device.games[index]?.sortKey[0] ?? '#'

beforeEach(() => {
  probe.nav = null
  useShell.setState({ views: [{ id: 'home' }], overlays: [], notice: null })
})

describe('LibraryView', () => {
  it('loads the library from the device services and virtualizes it', async () => {
    await mount()

    expect(screen.getByTestId('lib-count')).toHaveTextContent('420 games')
    // Mounted rows only: a 420-tile DOM is exactly what virtualization exists
    // to avoid, and it is also what would make the engine's per-keypress
    // measurement pass expensive.
    expect(tiles().length).toBeGreaterThan(0)
    expect(tiles().length).toBeLessThan(120)
    expect(screen.getAllByTestId('lib-letter').length).toBeGreaterThan(5)
  })

  it('moves across and down the grid', async () => {
    await mount()

    focusTile(0)
    act(() => void nav().navigate('right'))
    expect(focusedIndex()).toBe(1)

    act(() => void nav().navigate('down'))
    expect(focusedIndex()).toBe(1 + COLUMNS)

    act(() => void nav().navigate('left'))
    expect(focusedIndex()).toBe(COLUMNS)

    act(() => void nav().navigate('up'))
    expect(focusedIndex()).toBe(0)
  })

  it('holding down escalates from a step to a stride to a section jump', async () => {
    await mount({ keyboard: true })
    focusTile(0)

    // Repeats 1–3 are still single rows; the 4th crosses `strideAfter`.
    hold(3)
    expect(focusedIndex()).toBe(3 * COLUMNS)

    const beforeStride = focusedIndex()
    hold(1)
    const afterStride = focusedIndex()
    expect(afterStride - beforeStride).toBeGreaterThan(COLUMNS)
    // The stride stays in whole rows, so the column never drifts.
    expect(afterStride % COLUMNS).toBe(beforeStride % COLUMNS)

    // Held past `sectionAfter`, moves become letter jumps: the landing index
    // is the first game of a section.
    hold(8)
    const landed = focusedIndex()
    expect(landed).toBeGreaterThan(afterStride)
    expect(letterOf(landed)).not.toBe(letterOf(landed - 1))

    const before = landed
    hold(1)
    expect(letterOf(focusedIndex())).not.toBe(letterOf(before))
  })

  it('the section rail follows the focused game and the stage of the hold', async () => {
    await mount({ keyboard: true })
    focusTile(0)

    const railStage = () => screen.getByTestId('lib-sections').getAttribute('data-stage')
    const currentLetter = () =>
      screen.getByTestId('lib-sections').querySelector('[aria-current="true"]')?.textContent

    await waitFor(() => expect(currentLetter()).toBe(letterOf(0)))
    expect(railStage()).toBe('item')

    hold(4)
    expect(railStage()).toBe('stride')

    hold(8)
    expect(railStage()).toBe('section')
    await waitFor(() => expect(currentLetter()).toBe(letterOf(focusedIndex())))
  })

  it('activating a letter jumps the grid to that section', async () => {
    await mount()
    focusTile(0)

    const letters = screen.getAllByTestId('lib-letter')
    const target = letters[4]
    if (!target) throw new Error('expected at least five sections')
    const letter = target.dataset.letter

    act(() => void nav().focus(target))
    act(() => void nav().activate())
    layout()

    await waitFor(() => expect(letterOf(focusedIndex())).toBe(letter))
    // It landed on the *first* game of that letter, the way a scrollbar rail
    // does, not on whatever happened to be mounted.
    expect(letterOf(focusedIndex() - 1)).not.toBe(letter)
  })

  it('stepping past the mounted window pages the virtualizer instead of stopping', async () => {
    await mount()

    const lastMounted = tiles().at(-1)
    if (!lastMounted) throw new Error('no tiles')
    const edge = Number(lastMounted.dataset.index)
    focusTile(edge - (COLUMNS - 1)) // first column of the last mounted row

    act(() => void nav().navigate('down'))
    await waitFor(() => {
      layout()
      expect(focusedIndex()).toBeGreaterThan(edge - COLUMNS)
    })
    expect(document.activeElement).not.toBe(document.body)
  })

  it('filtering shrinks the set without stranding focus on the body', async () => {
    await mount()
    focusTile(2 * COLUMNS + 1)
    expect(focusedIndex()).toBe(2 * COLUMNS + 1)

    const installedOnly = screen.getByTestId('lib-installed')
    act(() => void nav().focus(installedOnly))
    act(() => void nav().activate())

    const total = device.games.filter((g) => g.install === 'installed').length
    await waitFor(() => expect(screen.getByTestId('lib-count')).toHaveTextContent(`${total} games`))
    layout()

    expect(total).toBeLessThan(device.games.length)
    // The engine keeps a real focus target through the swap — either the
    // toggle the user pressed or a restored tile — never the body.
    await waitFor(() => expect(document.activeElement).not.toBe(document.body))
    expect(nav().getFocused()).not.toBeNull()
  })

  it('an empty result keeps a focusable escape hatch', async () => {
    await mount()

    const search = screen.getByTestId('lib-search')
    await act(async () => {
      fireEvent.change(search, { target: { value: 'zzzzzznotagame' } })
    })

    await screen.findByTestId('lib-clear')
    layout()
    act(() => void nav().focus('[data-testid="lib-clear"]'))
    expect(nav().getFocused()).toBe(screen.getByTestId('lib-clear'))
  })

  it('crossing between the filter rail and the grid restores the remembered tile', async () => {
    await mount()

    // Second row, first column: the only tiles from which left is an exit.
    focusTile(2 * COLUMNS)
    expect(focusedIndex()).toBe(2 * COLUMNS)

    act(() => void nav().navigate('left'))
    expect(nav().getFocused()?.closest('[data-testid="lib-rail"]')).not.toBeNull()

    act(() => void nav().navigate('right'))
    // `remember` on the grid, not geometry: the tile the user left is the one
    // they come back to.
    expect(focusedIndex()).toBe(2 * COLUMNS)
  })

  it('escape leaves the search field for the grid', async () => {
    await mount({ keyboard: true })

    const search = screen.getByTestId('lib-search')
    act(() => search.focus())
    expect(document.activeElement).toBe(search)

    // A text field keeps its arrow keys by design, so this is the only way
    // back out on a device with no Tab key.
    act(() => {
      search.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
      )
    })
    expect(document.activeElement).toBe(search)

    act(() => {
      search.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      )
    })
    expect(document.activeElement).not.toBe(search)
    expect(focusedIndex()).toBeGreaterThanOrEqual(0)
  })

  it('activating a tile pushes the game view', async () => {
    await mount()

    focusTile(3)
    const gameId = nav().getFocused()?.dataset.gameId
    act(() => void nav().activate())

    const top = useShell.getState().views.at(-1)
    expect(top).toEqual({ id: 'game', gameId })
  })
})
