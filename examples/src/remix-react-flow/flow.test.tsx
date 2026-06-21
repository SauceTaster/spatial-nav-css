import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { SpatialNavigationProvider, useSpatialNavigation } from 'spatial-nav-css/react'
import type { NavRect, SpatialNavigation } from 'spatial-nav-css'
import { rect } from '../shared/test-utils'
import { ReactFlowExample } from './Example'

// A clean diamond grid for deterministic nav (jsdom has no real layout, so the
// engine reads these instead of React Flow's transformed positions).
const grid: Record<string, [number, number, number, number]> = {
  'node-1': [100, 0, 96, 40],
  'node-2': [0, 100, 96, 40],
  'node-3': [200, 100, 96, 40],
  'node-4': [100, 200, 96, 40],
}
const options = {
  adapters: [],
  visibilityFilter: () => true,
  scrollBehavior: false as const,
  getRect: (el: HTMLElement): NavRect => {
    const r = grid[el.id]
    return r ? rect(...r) : rect(0, 0, 0, 0)
  },
}

function NavGrabber({ onNav }: { onNav: (n: SpatialNavigation) => void }) {
  const nav = useSpatialNavigation()
  useEffect(() => {
    onNav(nav)
  }, [nav, onNav])
  return null
}

async function mount(): Promise<SpatialNavigation> {
  let nav!: SpatialNavigation
  render(
    <SpatialNavigationProvider {...options}>
      <NavGrabber onNav={(n) => (nav = n)} />
      <ReactFlowExample />
    </SpatialNavigationProvider>,
  )
  await waitFor(() => expect(document.getElementById('node-1')).toBeTruthy())
  return nav
}

afterEach(cleanup)

describe('react-flow example', () => {
  it('renders custom nodes as single data-focusable stops', async () => {
    await mount()
    for (const id of ['node-1', 'node-2', 'node-3', 'node-4']) {
      expect(document.getElementById(id)).toHaveAttribute('data-focusable')
    }
  })

  it('navigates across transformed nodes by on-screen geometry', async () => {
    const nav = await mount()
    act(() => void nav.focus('#node-2'))
    act(() => void nav.navigate('right'))
    expect(nav.getFocused()?.id).toBe('node-3') // same row

    act(() => void nav.focus('#node-1'))
    act(() => void nav.navigate('down'))
    expect(nav.getFocused()?.id).toBe('node-4') // aligned column

    act(() => void nav.navigate('up'))
    expect(nav.getFocused()?.id).toBe('node-1')
  })
})
