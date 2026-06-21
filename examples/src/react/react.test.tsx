import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { StrictMode, useEffect } from 'react'
import { SpatialNavigationProvider, useSpatialNavigation } from 'spatial-nav-css/react'
import { keyboardAdapter, type SpatialNavigation } from 'spatial-nav-css'
import { press, rectProvider, testNavOptions, type LayoutMap } from '../shared/test-utils'
import { ReactExample } from './Example'

// Deterministic jsdom layout: toolbar row on top, card row below.
const layout: LayoutMap = {
  'tb-play': [0, 0, 80, 40],
  'tb-skip': [90, 0, 80, 40],
  'tb-info': [180, 0, 80, 40],
  'card-0': [0, 120, 100, 84],
  'card-1': [110, 120, 100, 84],
  'card-2': [220, 120, 100, 84],
  'card-3': [330, 120, 100, 84],
  'card-4': [440, 120, 100, 84],
  'card-5': [550, 120, 100, 84],
  decoration: [660, 120, 100, 84],
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
    <SpatialNavigationProvider {...testNavOptions(layout)}>
      <NavGrabber onNav={(n) => (nav = n)} />
      <ReactExample />
    </SpatialNavigationProvider>,
  )
  return nav
}

afterEach(cleanup)

describe('react example', () => {
  it('marks useFocusable cards as stops and skips the plain div', () => {
    mount()
    expect(document.getElementById('card-0')).toHaveAttribute('data-focusable')
    expect(document.getElementById('decoration')).not.toHaveAttribute('data-focusable')
  })

  it('directional nav skips a tabindex=-1 button', () => {
    const nav = mount()
    act(() => void nav.focus('#tb-play'))
    act(() => void nav.navigate('right'))
    expect(nav.getFocused()?.id).toBe('tb-info') // tb-skip was opted out
  })

  it('navigates between cards and wraps past the excluded decoration', () => {
    const nav = mount()
    act(() => void nav.focus('#card-0'))
    act(() => void nav.navigate('right'))
    expect(nav.getFocused()?.id).toBe('card-1')

    act(() => void nav.focus('#card-5'))
    act(() => void nav.navigate('right'))
    // wrap returns to card-0; the decoration to the right is never a candidate
    expect(nav.getFocused()?.id).toBe('card-0')
  })

  it('keeps input adapters working after a StrictMode remount', () => {
    // StrictMode runs effects mount → cleanup → mount. The provider must clean
    // up with stop() (not destroy()), or the remount loses its input adapters
    // and keyboard/gamepad input silently dies. Regression guard for that.
    let nav!: SpatialNavigation
    render(
      <StrictMode>
        <SpatialNavigationProvider
          adapters={[keyboardAdapter()]}
          visibilityFilter={() => true}
          scrollBehavior={false}
          getRect={rectProvider(layout)}
        >
          <NavGrabber onNav={(n) => (nav = n)} />
          <ReactExample />
        </SpatialNavigationProvider>
      </StrictMode>,
    )
    act(() => void nav.focus('#card-0'))
    // A real key event — only moves focus if the keyboard adapter survived the
    // StrictMode mount/unmount/remount.
    act(() => press('ArrowRight'))
    expect(nav.getFocused()?.id).toBe('card-1')
  })

  it('auto-restores focus when the focused card is removed', async () => {
    const nav = mount()
    act(() => void nav.focus('#card-2'))
    act(() => void nav.activate()) // → onActivate → React removes card-2 from state
    expect(document.getElementById('card-2')).toBeNull()
    // autoRestoreFocus is debounced ~100ms and MutationObserver-driven.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 160))
    })
    const focused = nav.getFocused()
    expect(focused).not.toBeNull()
    expect(focused?.id).not.toBe('card-2')
  })
})
