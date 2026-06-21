import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useEffect } from 'react'
import { SpatialNavigationProvider, useSpatialNavigation } from 'spatial-nav-css/react-aria'
import { getFocusables, type NavRect, type SpatialNavigation } from 'spatial-nav-css'
import { rect } from '../shared/test-utils'
import { ReactAriaExample } from './Example'

// Tiles are id-addressable; the ListBox's active option is matched by role
// (RAC doesn't surface item keys as DOM ids).
const tiles: Record<string, [number, number, number, number]> = {
  'tile-0': [300, 100, 100, 84],
  'tile-1': [410, 100, 100, 84],
  'tile-2': [520, 100, 100, 84],
  'tile-3': [630, 100, 100, 84],
}
const options = {
  adapters: [],
  visibilityFilter: () => true,
  scrollBehavior: false as const,
  getRect: (el: HTMLElement): NavRect => {
    const r = tiles[el.id]
    if (r) return rect(...r)
    // The collection is one region. RAC puts tabindex=0 on the container and
    // delegates real focus inward to the active option, so the origin/target
    // for nav can be either — give the whole subtree the same rect.
    if (el.closest('[role="listbox"]')) return rect(0, 100, 180, 200)
    return rect(0, 0, 0, 0)
  },
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
      <ReactAriaExample />
    </SpatialNavigationProvider>,
  )
  return nav
}

afterEach(cleanup)

describe('react-aria example', () => {
  it('exposes the ListBox as exactly one spatial stop (roving tabindex)', () => {
    mount()
    const section = document.querySelector('[role="listbox"]')?.closest('section') as HTMLElement
    const stops = getFocusables(section, undefined, () => true)
    // The whole collection is one stop: the listbox container (tabindex=0).
    expect(stops).toHaveLength(1)
    expect(stops[0].getAttribute('role')).toBe('listbox')
    // Every option opts out of being its own stop.
    for (const opt of document.querySelectorAll('[role="option"]')) {
      expect(opt).toHaveAttribute('tabindex', '-1')
    }
  })

  it('spatialFocusable marks custom tiles', () => {
    mount()
    expect(document.getElementById('tile-0')).toHaveAttribute('data-focusable')
  })

  it('navigates out of and back into the collection', () => {
    const nav = mount()
    act(() => void nav.focus('#tile-0'))
    act(() => void nav.navigate('left'))
    // Focus entered the collection as a single stop: the engine focused the
    // listbox container and RAC delegated real focus to its current option.
    const listbox = document.querySelector('[role="listbox"]') as HTMLElement
    const landed = nav.getFocused()
    expect(landed && (landed === listbox || listbox.contains(landed))).toBeTruthy()

    act(() => void nav.navigate('right'))
    expect(nav.getFocused()?.id).toBe('tile-0')
  })
})
