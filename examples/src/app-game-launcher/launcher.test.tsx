import { describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import type { SpatialNavigation } from 'spatial-nav-css'
import { useSpatialNavigation } from 'spatial-nav-css/react'
import { App } from './App'
import { AppShell, createQueryClient } from '../shared/app'
import { applyLayout, layoutNavOptions, setRect } from '../shared/layout'

/**
 * The launcher screen, laid out the way the CSS lays it out: a filter rail on
 * the left, a four-column card grid beside it, and a detail panel to its
 * right. Re-applied after every render that adds nodes.
 */
function layout(): void {
  applyLayout([
    { selector: '[data-testid="filter"]', flow: 'column', x: 0, y: 100, w: 180, h: 44, gap: 6 },
    { selector: '[data-testid="card-skeleton"]', flow: 4, x: 220, y: 100, w: 200, h: 150, gap: 12 },
    { selector: '[data-testid="game-card"]', flow: 4, x: 220, y: 100, w: 200, h: 150, gap: 12 },
    { selector: '[data-testid="detail"] button', flow: 'column', x: 1120, y: 120, w: 200, h: 44, gap: 10 },
  ])
  setRect(document.querySelector('[data-testid="rail"]'), { x: 0, y: 100, w: 180, h: 520 })
  setRect(document.querySelector('[data-testid="grid"]'), { x: 220, y: 100, w: 860, h: 520 })
  setRect(document.querySelector('[data-testid="detail"]'), { x: 1120, y: 100, w: 260, h: 520 })
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

const cardTitles = (): string[] =>
  screen.queryAllByTestId('game-card').map((el) => el.querySelector('.gl-card-title')!.textContent!)

const focusedTitle = (nav: SpatialNavigation): string | undefined =>
  nav.getFocused()?.querySelector('.gl-card-title')?.textContent ?? undefined

describe('game launcher example', () => {
  it('renders skeletons, then real cards from the mock API', async () => {
    const { nav } = mount()
    expect(screen.getAllByTestId('card-skeleton').length).toBeGreaterThan(0)

    await waitFor(() => expect(screen.getAllByTestId('game-card').length).toBeGreaterThan(0))
    expect(screen.getByTestId('count')).toHaveTextContent('48 games')
    expect(cardTitles()[0]).toBe('Aetherbound Directive')
    nav.destroy()
  })

  it('hands focus to the first card once data arrives, not to page chrome', async () => {
    // Provider autofocus runs at start(), when the grid is still skeletons —
    // without useContentFocus, focus would stay wherever it first landed and
    // the content would never receive it.
    const { nav } = mount()
    await waitFor(() => expect(screen.getAllByTestId('game-card').length).toBeGreaterThan(0))
    await waitFor(() => expect(nav.getFocused()?.dataset.testid).toBe('game-card'))
    expect(focusedTitle(nav)).toBe(cardTitles()[0])
    nav.destroy()
  })

  it('navigates the card grid by geometry once data has loaded', async () => {
    const { nav } = mount()
    await waitFor(() => expect(screen.getAllByTestId('game-card').length).toBeGreaterThan(4))
    layout()

    const cards = screen.getAllByTestId('game-card')
    act(() => {
      nav.focus(cards[0]!)
    })
    expect(focusedTitle(nav)).toBe(cardTitles()[0])

    act(() => {
      nav.navigate('right')
    })
    expect(focusedTitle(nav)).toBe(cardTitles()[1])

    // Four columns, so down lands one row below — index 5, not 2.
    act(() => {
      nav.navigate('down')
    })
    expect(focusedTitle(nav)).toBe(cardTitles()[5])
    nav.destroy()
  })

  it('crosses from the grid into the filter rail and remembers where it was', async () => {
    const { nav } = mount()
    await waitFor(() => expect(screen.getAllByTestId('game-card').length).toBeGreaterThan(4))
    layout()

    act(() => {
      nav.focus(screen.getAllByTestId('game-card')[4]!) // second row, first column
    })
    act(() => {
      nav.navigate('left')
    })
    expect(nav.getFocused()?.dataset.testid).toBe('filter')

    const filterLanded = nav.getFocused()!.textContent
    act(() => {
      nav.navigate('right')
    })
    expect(nav.getFocused()?.dataset.testid).toBe('game-card')

    act(() => {
      nav.navigate('left')
    })
    // `remember` on the rail: re-entry returns to the same filter.
    expect(nav.getFocused()?.textContent).toBe(filterLanded)
    nav.destroy()
  })

  it('keeps focus usable when a filter change replaces the whole result set', async () => {
    const { nav } = mount()
    await waitFor(() => expect(screen.getAllByTestId('game-card').length).toBeGreaterThan(4))
    layout()

    const all = cardTitles().length
    act(() => {
      nav.focus(screen.getAllByTestId('game-card')[6]!)
    })
    const before = focusedTitle(nav)

    // Activate the "Installed" filter — the grid re-renders with fewer cards,
    // very likely destroying the focused node.
    act(() => {
      nav.focus(screen.getAllByTestId('filter')[1]!)
      nav.activate()
    })
    await waitFor(() => expect(cardTitles().length).toBeLessThan(all))
    layout()

    // Whatever happens to the removed node, focus must not be lost to the
    // body: the user has to be able to keep navigating.
    await waitFor(() => {
      const focused = nav.getFocused()
      expect(focused).not.toBeNull()
      expect(document.body.contains(focused!)).toBe(true)
    })
    expect(before).toBeTruthy()
    nav.destroy()
  })

  it('opens the detail panel on activate and enters it as a zone', async () => {
    const { nav } = mount()
    await waitFor(() => expect(screen.getAllByTestId('game-card').length).toBeGreaterThan(4))
    layout()

    act(() => {
      nav.focus(screen.getAllByTestId('game-card')[0]!)
      nav.activate()
    })
    await waitFor(() => expect(screen.getByTestId('detail')).toBeInTheDocument())
    layout()

    // From the last column of the grid, right leaves the grid for the panel.
    act(() => {
      nav.focus(screen.getAllByTestId('game-card')[3]!)
    })
    act(() => {
      nav.navigate('right')
    })
    await waitFor(() => {
      expect(screen.getByTestId('detail').contains(nav.getFocused())).toBe(true)
    })
    // The panel marks its primary action as the zone's default focus.
    expect(nav.getFocused()?.dataset.testid).toBe('install-toggle')
    nav.destroy()
  })

  it('reflects an optimistic favorite toggle without dropping focus', async () => {
    const { nav } = mount()
    await waitFor(() => expect(screen.getAllByTestId('game-card').length).toBeGreaterThan(0))
    layout()

    const card = screen.getAllByTestId('game-card')[0]!
    const id = card.dataset.gameId
    act(() => {
      nav.focus(card)
    })
    const before = card.textContent

    act(() => {
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))
    })

    await waitFor(() => {
      const current = screen.getAllByTestId('game-card').find((el) => el.dataset.gameId === id)!
      expect(current.textContent).not.toBe(before)
    })
    expect(nav.getFocused()?.dataset.gameId).toBe(id)
    nav.destroy()
  })

  it('reports the edge instead of silently doing nothing', async () => {
    const { nav } = mount()
    await waitFor(() => expect(screen.getAllByTestId('game-card').length).toBeGreaterThan(4))
    layout()

    act(() => {
      nav.focus(screen.getAllByTestId('filter')[0]!)
    })
    act(() => {
      nav.navigate('left')
    })
    await waitFor(() => expect(screen.getByTestId('edge')).toHaveTextContent('Edge: left'))
    nav.destroy()
  })
})
