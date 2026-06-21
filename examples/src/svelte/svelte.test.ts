import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/svelte'
import type { SpatialNavigation } from 'spatial-nav-css'
import { testNavOptions, type LayoutMap } from '../shared/test-utils'
import App from './App.svelte'

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

function mount() {
  let nav!: SpatialNavigation
  render(App, { props: { options: testNavOptions(layout), onReady: (n: SpatialNavigation) => (nav = n) } })
  return nav
}

afterEach(cleanup)

describe('svelte example', () => {
  it('marks focusables and skips the plain decoration', () => {
    mount()
    expect(document.getElementById('card-0')).toHaveAttribute('data-focusable')
    expect(document.getElementById('decoration')).not.toHaveAttribute('data-focusable')
  })

  it('directional nav skips the tabindex=-1 button', () => {
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
    nav.activate()
    await new Promise((r) => setTimeout(r, 30))
    expect(document.getElementById('card-2')).toBeNull()
    await new Promise((r) => setTimeout(r, 160))
    const focused = nav.getFocused()
    expect(focused).not.toBeNull()
    expect(focused?.id).not.toBe('card-2')
  })
})
