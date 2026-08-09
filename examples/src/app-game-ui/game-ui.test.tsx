import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { SpatialNavigation } from 'spatial-nav-css'
import { useSpatialNavigation } from 'spatial-nav-css/react'
import { App } from './App'
import { AppShell } from '../shared/app'
import { applyLayout, layoutNavOptions, setRect } from '../shared/layout'
import { SKILLS } from './state'

/**
 * The pause screen's real geometry. The inventory is the interesting part:
 * weapons are two cells wide, so rows do not line up and a straight "down"
 * from a 1×1 cell can land under a 2×1 one.
 *
 * Inventory flow (cells are 90 wide, 60 tall, gap 8, 4 columns of capacity):
 *   row 0: Ashwood Bow (2w) | Iron Greaves | Salve
 *   row 1: Ember Blade (2w) | Cinder       | Warding Charm
 *   row 2: Tonic            | Glass Shard
 */
const CELL = 90
const GAP = 8
const INV_X = 340
const INV_Y = 120
const ROW_H = 60

const INVENTORY_PLACEMENT: Record<string, [col: number, row: number, span: number]> = {
  i1: [0, 0, 2],
  i2: [2, 0, 1],
  i3: [3, 0, 1],
  i4: [0, 1, 2],
  i5: [2, 1, 1],
  i6: [3, 1, 1],
  i7: [0, 2, 1],
  i8: [1, 2, 1],
}

function layout(): void {
  applyLayout([
    { selector: '[data-testid="menu-item"]', flow: 'column', x: 40, y: 120, w: 200, h: 44, gap: 8 },
    { selector: '[data-testid="slot"]', flow: 'column', x: 900, y: 120, w: 160, h: 60, gap: 10 },
  ])
  setRect(document.querySelector('[data-testid="menu"]'), { x: 40, y: 120, w: 200, h: 260 })
  setRect(document.querySelector('[data-testid="abilities"]'), { x: 900, y: 120, w: 160, h: 280 })

  // Irregular inventory: width follows each item's span.
  for (const el of screen.queryAllByTestId('item')) {
    const place = INVENTORY_PLACEMENT[el.dataset.itemId!]
    if (!place) continue
    const [col, row, span] = place
    setRect(el, {
      x: INV_X + col * (CELL + GAP),
      y: INV_Y + row * (ROW_H + GAP),
      w: span * CELL + (span - 1) * GAP,
      h: ROW_H,
    })
  }
  setRect(document.querySelector('[data-testid="inventory"]'), { x: INV_X, y: INV_Y, w: 400, h: 220 })

  // Staggered skill tree: each tier is a row, nodes offset horizontally.
  for (const el of screen.queryAllByTestId('skill')) {
    const skill = SKILLS.find((entry) => entry.id === el.dataset.skillId)!
    setRect(el, {
      x: INV_X + skill.offset * 240,
      y: INV_Y + skill.tier * 90,
      w: 120,
      h: 56,
    })
  }
  setRect(document.querySelector('[data-testid="tree"]'), { x: INV_X, y: INV_Y, w: 400, h: 300 })
}

function mount() {
  let nav!: SpatialNavigation
  function Probe() {
    nav = useSpatialNavigation()
    return null
  }
  render(
    <AppShell nav={layoutNavOptions}>
      <Probe />
      <App />
    </AppShell>,
  )
  layout()
  return { nav }
}

const itemAt = (id: string) => document.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!
const skillAt = (id: string) => document.querySelector<HTMLElement>(`[data-skill-id="${id}"]`)!
const focusedItem = (nav: SpatialNavigation) => nav.getFocused()?.dataset.itemId
const focusedSkill = (nav: SpatialNavigation) => nav.getFocused()?.dataset.skillId

describe('game pause screen example', () => {
  it('moves along an inventory row and across a double-width item', () => {
    const { nav } = mount()
    act(() => {
      nav.focus(itemAt('i1'))
    })
    act(() => {
      nav.navigate('right')
    })
    expect(focusedItem(nav)).toBe('i2')
    act(() => {
      nav.navigate('right')
    })
    expect(focusedItem(nav)).toBe('i3')
    act(() => {
      nav.navigate('left')
    })
    expect(focusedItem(nav)).toBe('i2')
    // Left again crosses back onto the 2-wide bow.
    act(() => {
      nav.navigate('left')
    })
    expect(focusedItem(nav)).toBe('i1')
    nav.destroy()
  })

  it('drops onto the item actually underneath, not the row start', () => {
    // From Salve (col 3, row 0) down should reach Warding Charm (col 3,
    // row 1) — the column is preserved even though row 1 starts with a
    // double-width blade.
    const { nav } = mount()
    act(() => {
      nav.focus(itemAt('i3'))
    })
    act(() => {
      nav.navigate('down')
    })
    expect(focusedItem(nav)).toBe('i6')

    // And from the 2-wide blade, down reaches the cell under its left half.
    act(() => {
      nav.focus(itemAt('i4'))
    })
    act(() => {
      nav.navigate('down')
    })
    expect(focusedItem(nav)).toBe('i7')
    nav.destroy()
  })

  it('crosses zones: menu → inventory → ability slots', () => {
    const { nav } = mount()
    act(() => {
      nav.focus(screen.getAllByTestId('menu-item')[1]!)
    })
    act(() => {
      nav.navigate('right')
    })
    expect(nav.getFocused()?.dataset.testid).toBe('item')

    act(() => {
      nav.focus(itemAt('i3'))
    })
    act(() => {
      nav.navigate('right')
    })
    expect(nav.getFocused()?.dataset.testid).toBe('slot')
    nav.destroy()
  })

  it('remembers where it was in each zone', () => {
    const { nav } = mount()
    act(() => {
      nav.focus(itemAt('i6')) // last column, so right leaves the zone
    })
    act(() => {
      nav.navigate('right')
    })
    expect(nav.getFocused()?.dataset.testid).toBe('slot')

    act(() => {
      nav.navigate('left')
    })
    // `remember` returns to the cell we left, not the geometrically nearest.
    expect(focusedItem(nav)).toBe('i6')
    nav.destroy()
  })

  it('navigates a staggered skill tree diagonally and learns a node', () => {
    const { nav } = mount()
    act(() => {
      nav.focus(screen.getAllByTestId('menu-item')[2]!) // Skills tab
      nav.activate()
    })
    layout()

    // Footwork (tier 0, offset .5) → down reaches one of the tier-1 nodes
    // even though neither is directly beneath it.
    act(() => {
      nav.focus(skillAt('s1'))
    })
    act(() => {
      nav.navigate('down')
    })
    expect(['s2', 's3']).toContain(focusedSkill(nav))

    // Learning spends points and re-renders the node in place.
    const before = screen.getByTestId('points').textContent
    act(() => {
      nav.focus(skillAt('s2'))
      nav.activate()
    })
    expect(screen.getByTestId('points').textContent).not.toBe(before)
    expect(screen.getByTestId('log')).toHaveTextContent('Learned Riposte')
    expect(focusedSkill(nav)).toBe('s2')
    nav.destroy()
  })

  it('keeps the engine focus ring through a React re-render', () => {
    // The item cell rewrites className from its own `focused` flag on the
    // very render focus triggers; the ring must survive that.
    const { nav } = mount()
    const cell = itemAt('i5')
    act(() => {
      nav.focus(cell)
    })
    expect(cell.className).toContain('is-focused')
    expect(cell.hasAttribute('data-spatial-focused')).toBe(true)
    nav.destroy()
  })

  it('equips a carried item into an ability slot', () => {
    const { nav } = mount()
    act(() => {
      nav.focus(itemAt('i4'))
      nav.activate()
    })
    expect(screen.getByTestId('log')).toHaveTextContent('Carrying Ember Blade')

    act(() => {
      nav.focus(screen.getAllByTestId('slot')[1]!)
      nav.activate()
    })
    expect(screen.getByTestId('log')).toHaveTextContent('Ember Blade → W')
    nav.destroy()
  })
})
