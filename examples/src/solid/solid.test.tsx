/** @jsxImportSource solid-js */
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'solid-js/web'
import { keyboardAdapter } from 'spatial-nav-css'
import type { SpatialNavigation, SpatialNavigationOptions } from 'spatial-nav-css'
import { press, testNavOptions, type LayoutMap } from '../shared/test-utils'
import { SolidExample } from './Example'

// Deterministic jsdom layout matching the page: menu column on the left, a
// 4-wide card grid on the right (promo + decoration fill the second row).
const layout: LayoutMap = {
  'menu-home': [0, 0, 140, 40],
  'menu-library': [0, 50, 140, 40],
  'menu-settings': [0, 100, 140, 40],
  'card-0': [160, 0, 100, 84],
  'card-1': [270, 0, 100, 84],
  'card-2': [380, 0, 100, 84],
  'card-3': [490, 0, 100, 84],
  'card-4': [160, 100, 100, 84],
  'card-5': [270, 100, 100, 84],
  promo: [380, 100, 100, 84],
  decoration: [490, 100, 100, 84],
}

let disposeMounted: (() => void) | null = null

function mount(extra: Partial<SpatialNavigationOptions> = {}) {
  let nav!: SpatialNavigation
  const dispose = render(
    () => (
      <SolidExample
        options={{ ...testNavOptions(layout), ...extra }}
        onReady={(n) => (nav = n)}
      />
    ),
    document.body,
  )
  disposeMounted = dispose
  return { nav, dispose }
}

afterEach(() => {
  disposeMounted?.()
  disposeMounted = null
})

describe('solid example', () => {
  it('declares stops and the entry point with plain data attributes', () => {
    const { nav } = mount()
    expect(document.getElementById('promo')).toHaveAttribute('data-focusable')
    expect(document.getElementById('decoration')).not.toHaveAttribute('data-focusable')
    // data-spatial-autofocus makes Home the entry point.
    nav.focusFirst()
    expect(nav.getFocused()?.id).toBe('menu-home')
  })

  it('directional moves follow the layout', () => {
    const { nav } = mount()
    nav.focus('#card-0')
    nav.navigate('right')
    expect(nav.getFocused()?.id).toBe('card-1')
    nav.navigate('down')
    expect(nav.getFocused()?.id).toBe('card-5')
    nav.navigate('left')
    expect(nav.getFocused()?.id).toBe('card-4')
  })

  it('the data-focusable div is a stop, the plain div never is', () => {
    const { nav } = mount()
    // Down from card-3 lands on promo — decoration sits directly below but is
    // not a candidate at all.
    nav.focus('#card-3')
    nav.navigate('down')
    expect(nav.getFocused()?.id).toBe('promo')
    // Rightward the adjacent decoration is never a candidate — the diagonal
    // card-3 wins instead.
    nav.navigate('right')
    expect(nav.getFocused()?.id).toBe('card-3')
  })

  it('the menu column wraps vertically', () => {
    const { nav } = mount()
    nav.focus('#menu-settings')
    nav.navigate('down')
    expect(nav.getFocused()?.id).toBe('menu-home')
    nav.navigate('up')
    expect(nav.getFocused()?.id).toBe('menu-settings')
  })

  it('remember re-enters each zone at its last stop', () => {
    const { nav } = mount()
    // Menu: without remember this left-entry would land on menu-home
    // (geometric best AND the zone's data-spatial-autofocus preference).
    nav.focus('#menu-settings')
    nav.focus('#card-0')
    nav.navigate('left')
    expect(nav.getFocused()?.id).toBe('menu-settings')
    // Grid: geometric entry from menu-settings would be card-4's row start,
    // but the zone remembers card-0.
    nav.navigate('right')
    expect(nav.getFocused()?.id).toBe('card-0')
  })

  it('the spatial:focus signal drives the status line and tile state', () => {
    const { nav } = mount()
    const statusText = () => document.getElementById('status')!.textContent
    expect(statusText()).toBe('nothing focused yet')

    nav.focus('#card-1')
    expect(statusText()).toBe('focused #card-1 via api')
    expect(document.getElementById('card-1')).toHaveAttribute('data-focused', 'true')

    nav.navigate('right')
    expect(statusText()).toBe('focused #card-2 via api')
    expect(document.getElementById('card-1')).toHaveAttribute('data-focused', 'false')
    expect(document.getElementById('card-2')).toHaveAttribute('data-focused', 'true')
  })

  it('disposing the root destroys the nav — input listeners stop working', () => {
    const { nav, dispose } = mount({ adapters: [keyboardAdapter()] })
    nav.focus('#card-0')
    press('ArrowRight')
    expect(nav.getFocused()?.id).toBe('card-1')

    dispose() // Solid cleanup runs onCleanup → nav.destroy()
    press('ArrowRight')
    expect(nav.getFocused()).toBeNull()
    expect(nav.navigate('right')).toBe(false)
  })
})
