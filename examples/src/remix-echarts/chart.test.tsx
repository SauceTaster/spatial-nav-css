import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useEffect } from 'react'
import { SpatialNavigationProvider, useSpatialNavigation } from 'spatial-nav-css/react'
import { getFocusables, type NavRect, type SpatialNavigation } from 'spatial-nav-css'
import { rect } from '../shared/test-utils'
import { EchartsExample } from './Example'

// Controls laid out in a row; the chart surface is intentionally absent here.
const ctrlLayout: Record<string, [number, number, number, number]> = {
  'ctrl-prev': [0, 200, 100, 40],
  'ctrl-next': [110, 200, 100, 40],
  'ctrl-Builds': [220, 200, 110, 40],
  'ctrl-Deploys': [340, 200, 110, 40],
}
const options = {
  adapters: [],
  visibilityFilter: () => true,
  scrollBehavior: false as const,
  getRect: (el: HTMLElement): NavRect => {
    const r = ctrlLayout[el.id]
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

function mount(): SpatialNavigation {
  let nav!: SpatialNavigation
  render(
    <SpatialNavigationProvider {...options}>
      <NavGrabber onNav={(n) => (nav = n)} />
      <EchartsExample />
    </SpatialNavigationProvider>,
  )
  return nav
}

afterEach(cleanup)

describe('echarts example', () => {
  it('the chart surface is NOT a spatial stop (opaque canvas/svg)', () => {
    mount()
    expect(document.getElementById('chart')).not.toHaveAttribute('data-focusable')
  })

  it('the controls are the spatial stops, the chart is not', () => {
    mount()
    const stops = new Set(getFocusables(document.body, undefined, () => true))
    for (const id of ['ctrl-prev', 'ctrl-next', 'ctrl-Builds', 'ctrl-Deploys']) {
      expect(stops.has(document.getElementById(id) as HTMLElement)).toBe(true)
    }
    expect(stops.has(document.getElementById('chart') as HTMLElement)).toBe(false)
  })

  it('navigates between controls and drives the chart readout', () => {
    const nav = mount()
    act(() => void nav.focus('#ctrl-prev'))
    act(() => void nav.navigate('right'))
    expect(nav.getFocused()?.id).toBe('ctrl-next')

    // activating Next advances the highlighted bar (app state, not echarts)
    expect(document.getElementById('readout')?.textContent).toContain('Mon')
    act(() => void nav.activate())
    expect(document.getElementById('readout')?.textContent).toContain('Tue')
  })
})
