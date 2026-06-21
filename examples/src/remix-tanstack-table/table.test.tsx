import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useEffect } from 'react'
import { SpatialNavigationProvider, useSpatialNavigation } from 'spatial-nav-css/react'
import type { NavRect, SpatialNavigation } from 'spatial-nav-css'
import { rect } from '../shared/test-utils'
import { TanstackTableExample } from './Example'

// 3 columns × 5 body rows on a 120px × 44px grid, header row above.
function gridRect(el: HTMLElement): NavRect {
  if (el.id.startsWith('th-')) {
    const cols = ['name', 'team', 'commits']
    const c = cols.indexOf(el.id.slice(3))
    return rect(c * 120, 0, 110, 36)
  }
  const m = /^cell-(\d+)-(\d+)$/.exec(el.id)
  if (m) return rect(Number(m[2]) * 120, 60 + Number(m[1]) * 44, 110, 36)
  return rect(0, 0, 0, 0)
}

const options = {
  adapters: [],
  visibilityFilter: () => true,
  scrollBehavior: false as const,
  getRect: gridRect,
}

function NavGrabber({ onNav }: { onNav: (n: SpatialNavigation) => void }) {
  const nav = useSpatialNavigation()
  useEffect(() => {
    onNav(nav)
  }, [nav, onNav])
  return null
}

function mount(): SpatialNavigation {
  let nav!: SpatialNavigation
  render(
    <SpatialNavigationProvider {...options}>
      <NavGrabber onNav={(n) => (nav = n)} />
      <TanstackTableExample />
    </SpatialNavigationProvider>,
  )
  return nav
}

afterEach(cleanup)

describe('tanstack-table example', () => {
  it('makes every body cell a stop', () => {
    mount()
    expect(document.getElementById('cell-0-0')).toHaveAttribute('data-focusable')
    expect(document.getElementById('cell-4-2')).toHaveAttribute('data-focusable')
  })

  it('walks a row with ←→ and a column with ↑↓', () => {
    const nav = mount()
    act(() => void nav.focus('#cell-0-0'))
    act(() => void nav.navigate('right'))
    expect(nav.getFocused()?.id).toBe('cell-0-1')
    act(() => void nav.navigate('down'))
    expect(nav.getFocused()?.id).toBe('cell-1-1')
    act(() => void nav.navigate('up'))
    act(() => void nav.navigate('up'))
    // up from the top body row lands on that column's header button
    expect(nav.getFocused()?.id).toBe('th-team')
  })

  it('re-renders sorted rows while keeping focus on the header', () => {
    const nav = mount()
    // source order: Ada is the first row
    expect(document.getElementById('cell-0-0')?.textContent).toContain('Ada')

    act(() => void nav.focus('#th-commits'))
    act(() => void nav.activate()) // numeric columns sort descending first → Curie (421)

    // the body genuinely re-rendered in sorted order…
    expect(document.getElementById('cell-0-0')?.textContent).toContain('Curie')
    // …yet focus stayed on the activated header across the re-render
    expect(nav.getFocused()?.id).toBe('th-commits')
  })
})
