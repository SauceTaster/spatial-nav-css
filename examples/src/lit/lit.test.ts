import { afterEach, describe, expect, it } from 'vitest'
import {
  createSpatialNavigation,
  getFocusables,
  keyboardAdapter,
  type SpatialNavigation,
} from 'spatial-nav-css'
import { press, testNavOptions, type LayoutMap } from '../shared/test-utils'
// Side-effect import: registers the custom elements. The classes are used
// purely as types below, so a combined import would be elided entirely.
import './main'
import type { SnCard, SnRail, SnShadowVault, SnStatus } from './main'

// Deterministic jsdom layout for the buttons the rails render: rail A on top,
// rail B below, columns aligned.
const layout: LayoutMap = {
  'row-a-0': [0, 0, 100, 60],
  'row-a-1': [120, 0, 100, 60],
  'row-a-2': [240, 0, 100, 60],
  'row-b-0': [0, 100, 100, 60],
  'row-b-1': [120, 100, 100, 60],
}

let nav: SpatialNavigation | null = null

afterEach(() => {
  nav?.destroy()
  nav = null
  document.body.innerHTML = ''
})

async function mount(): Promise<void> {
  document.body.innerHTML = `
    <sn-rail id="row-a" heading="Rail A" items='["One","Two","Three"]'></sn-rail>
    <sn-rail id="row-b" heading="Rail B" items='["Four","Five"]'></sn-rail>
    <sn-shadow-vault></sn-shadow-vault>
    <sn-status></sn-status>`
  // Two waves: rails render first, then the cards their render created.
  await Promise.all([...document.querySelectorAll<SnRail>('sn-rail')].map((el) => el.updateComplete))
  await Promise.all([...document.querySelectorAll<SnCard>('sn-card')].map((el) => el.updateComplete))
  await (document.querySelector('sn-shadow-vault') as SnShadowVault).updateComplete
  await (document.querySelector('sn-status') as SnStatus).updateComplete
}

describe('lit example', () => {
  it('navigates onto buttons rendered by light-DOM Lit components', async () => {
    await mount()
    expect(document.getElementById('row-a')?.getAttribute('data-spatial-container')).toBe('remember')
    nav = createSpatialNavigation(testNavOptions(layout))
    nav.start()
    nav.focus('#row-a-0')
    expect(nav.getFocused()?.id).toBe('row-a-0')
    nav.navigate('right')
    expect(nav.getFocused()?.id).toBe('row-a-1')
    nav.navigate('down')
    expect(nav.getFocused()?.id).toBe('row-b-1')
  })

  it('never finds the shadow-DOM component internals as candidates', async () => {
    await mount()
    const vault = document.querySelector('sn-shadow-vault') as SnShadowVault
    const shadowButton = vault.shadowRoot?.querySelector('button')
    expect(shadowButton).toBeTruthy() // the button exists — it is just invisible to the engine
    const stops = getFocusables(document, undefined, () => true)
    expect(stops.map((el) => el.id)).toEqual(['row-a-0', 'row-a-1', 'row-a-2', 'row-b-0', 'row-b-1'])
    nav = createSpatialNavigation(testNavOptions(layout))
    nav.start()
    nav.focus('#row-a-2')
    // The vault sits to the right on the page, but navigation cannot reach it.
    expect(nav.navigate('right')).toBe(false)
    expect(nav.getFocused()?.id).toBe('row-a-2')
  })

  it('keeps focus on the same node across a Lit re-render', async () => {
    await mount()
    nav = createSpatialNavigation(testNavOptions(layout))
    nav.start()
    nav.focus('#row-a-1')
    const before = nav.getFocused()
    const rail = document.getElementById('row-a') as SnRail
    rail.items = ['Uno', 'Dos', 'Tres']
    await rail.updateComplete
    await Promise.all([...rail.querySelectorAll<SnCard>('sn-card')].map((el) => el.updateComplete))
    const button = document.getElementById('row-a-1')
    expect(button?.textContent).toBe('Dos') // re-rendered in place
    expect(button).toBe(before)
    expect(nav.getFocused()).toBe(before)
    expect(document.activeElement).toBe(before)
  })

  it('auto-restores into the rail when a re-render removes the focused card', async () => {
    await mount()
    nav = createSpatialNavigation(testNavOptions(layout))
    nav.start()
    nav.focus('#row-a-2')
    const rail = document.getElementById('row-a') as SnRail
    rail.items = ['One', 'Two'] // drops the third card, taking the focused button with it
    await rail.updateComplete
    await new Promise((r) => setTimeout(r, 180)) // > the engine's restore debounce
    expect(nav.getFocused()?.id).toBe('row-a-0')
    expect(document.activeElement?.id).toBe('row-a-0')
  })

  it('updates the sn-status reactive property on spatial:focus', async () => {
    await mount()
    nav = createSpatialNavigation({ ...testNavOptions(layout), adapters: [keyboardAdapter()] })
    nav.start()
    const status = document.querySelector('sn-status') as SnStatus
    press('ArrowRight') // claims first focus
    await status.updateComplete
    expect(status.textContent).toContain('focus → One [keyboard]')
    press('ArrowRight')
    await status.updateComplete
    expect(status.textContent).toContain('focus → Two [keyboard]')
  })
})
