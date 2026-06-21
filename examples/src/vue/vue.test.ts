import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/vue'
import { createSpatialNavigation } from 'spatial-nav-css'
import { SPATIAL_NAV_KEY, vFocusable, vSpatialContainer } from 'spatial-nav-css/vue'
import { testNavOptions, type LayoutMap } from '../shared/test-utils'
import App from './App.vue'

const layout: LayoutMap = {
  'tb-play': [0, 0, 80, 40],
  'tb-search': [90, 0, 120, 40],
  'tb-info': [220, 0, 80, 40],
  'card-0': [0, 120, 100, 84],
  'card-1': [110, 120, 100, 84],
  'card-2': [220, 120, 100, 84],
  'card-3': [330, 120, 100, 84],
  'card-4': [440, 120, 100, 84],
  'card-5': [550, 120, 100, 84],
  decoration: [660, 120, 100, 84],
}

// The engine reads data-* attributes off the live document, so a nav created
// over `document` sees the directive/composable-marked elements regardless of
// how they were registered. We provide it for useSpatialNavigation and supply
// the directives the plugin would normally register.
const navs: ReturnType<typeof createSpatialNavigation>[] = []

function mount() {
  const nav = createSpatialNavigation(testNavOptions(layout))
  nav.start()
  navs.push(nav)
  render(App, {
    global: {
      provide: { [SPATIAL_NAV_KEY]: nav },
      directives: { focusable: vFocusable, 'spatial-container': vSpatialContainer },
    },
  })
  return nav
}

afterEach(() => {
  cleanup()
  // Destroy manually-created engines so their auto-restore observers/timers
  // don't fire after the jsdom environment is torn down.
  for (const nav of navs) nav.destroy()
  navs.length = 0
})

describe('vue example', () => {
  it('marks focusables and skips the plain decoration', () => {
    mount()
    expect(document.getElementById('card-0')).toHaveAttribute('data-focusable')
    expect(document.getElementById('decoration')).not.toHaveAttribute('data-focusable')
  })

  it('directional nav skips the tabindex=-1 input', () => {
    const nav = mount()
    nav.focus('#tb-play')
    nav.navigate('right')
    expect(nav.getFocused()?.id).toBe('tb-info')
  })

  it('navigates cards and wraps past the excluded decoration', () => {
    const nav = mount()
    nav.focus('#card-0')
    nav.navigate('right')
    expect(nav.getFocused()?.id).toBe('card-1')

    nav.focus('#card-5')
    nav.navigate('right')
    expect(nav.getFocused()?.id).toBe('card-0')
  })

  it('auto-restores focus when the focused card is removed', async () => {
    const nav = mount()
    nav.focus('#card-2')
    nav.activate() // → emit('remove') → v-for drops card-2
    await new Promise((r) => setTimeout(r, 30)) // let Vue re-render
    expect(document.getElementById('card-2')).toBeNull()
    await new Promise((r) => setTimeout(r, 160)) // auto-restore debounce
    const focused = nav.getFocused()
    expect(focused).not.toBeNull()
    expect(focused?.id).not.toBe('card-2')
  })
})
