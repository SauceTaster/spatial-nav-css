import { afterEach, describe, expect, it } from 'vitest'
import { createSpatialNavigation, keyboardAdapter, type SpatialNavigation } from '../src/index'
import { rectProvider, type LayoutMap } from './helpers'

let nav: SpatialNavigation | null = null

function setup(html: string, layout: LayoutMap, root?: HTMLElement): SpatialNavigation {
  document.body.innerHTML = html
  nav = createSpatialNavigation({
    root: root ?? document,
    adapters: [keyboardAdapter()],
    getRect: rectProvider(layout),
    visibilityFilter: () => true,
    scrollBehavior: false,
  })
  nav.start()
  return nav
}

const press = (key: string) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true }))

afterEach(() => {
  nav?.destroy()
  nav = null
  document.body.innerHTML = ''
})

describe('keyboard → engine integration', () => {
  it('arrow keys drive spatial focus end to end', () => {
    const n = setup(`<button id="a"></button><button id="b"></button>`, {
      a: [0, 0, 80, 80],
      b: [100, 0, 80, 80],
    })
    n.focus('#a')
    press('ArrowRight')
    expect(document.activeElement?.id).toBe('b')
    press('ArrowLeft')
    expect(document.activeElement?.id).toBe('a')
  })

  it('first arrow press claims focus when nothing is focused', () => {
    setup(`<button id="a"></button><button id="b"></button>`, {
      a: [0, 0, 80, 80],
      b: [100, 0, 80, 80],
    })
    expect(document.activeElement?.tagName).toBe('BODY')
    press('ArrowDown')
    expect(document.activeElement?.id).toBe('a')
  })

  it('does not steal focus held by elements outside the nav root', () => {
    document.body.innerHTML = `<button id="outside"></button><div id="region"><button id="inside"></button></div>`
    const region = document.getElementById('region')!
    nav = createSpatialNavigation({
      root: region,
      adapters: [keyboardAdapter()],
      getRect: rectProvider({ inside: [0, 0, 80, 80], outside: [200, 0, 80, 80] }),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    nav.start()
    document.getElementById('outside')!.focus()
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true })
    window.dispatchEvent(event)
    expect(document.activeElement?.id).toBe('outside')
    expect(event.defaultPrevented).toBe(false)
  })

  it('Enter release surfaces hold duration via spatial:activaterelease', () => {
    const n = setup(`<button id="a"></button>`, { a: [0, 0, 80, 80] })
    n.focus('#a')
    let detail: { durationMs?: number; source?: string } | null = null
    document.addEventListener(
      'spatial:activaterelease',
      (e) => {
        detail = (e as CustomEvent).detail
      },
      { once: true },
    )
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }))
    expect(detail).not.toBeNull()
    expect(detail!.source).toBe('keyboard')
    expect(detail!.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('Enter activates the focused element', () => {
    const n = setup(`<button id="a"></button>`, { a: [0, 0, 80, 80] })
    let clicks = 0
    document.getElementById('a')!.addEventListener('click', () => clicks++)
    n.focus('#a')
    press('Enter')
    expect(clicks).toBe(1)
  })

  it('Escape dispatches spatial:back and is consumed only when handled', () => {
    const n = setup(`<button id="a"></button>`, { a: [0, 0, 80, 80] })
    n.focus('#a')

    const unhandled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    window.dispatchEvent(unhandled)
    expect(unhandled.defaultPrevented).toBe(false)

    document.addEventListener('spatial:back', (e) => e.preventDefault(), { once: true })
    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    window.dispatchEvent(handled)
    expect(handled.defaultPrevented).toBe(true)
  })

  it('adapters added while running start immediately; removed ones stop', () => {
    const n = setup(`<button id="a"></button><button id="b"></button>`, {
      a: [0, 0, 80, 80],
      b: [100, 0, 80, 80],
    })
    n.focus('#a')
    const late = keyboardAdapter({ keymap: { l: 'right' } })
    n.addAdapter(late)
    press('l')
    expect(document.activeElement?.id).toBe('b')
    n.removeAdapter(late)
    press('l')
    expect(document.activeElement?.id).toBe('b') // no further effect
  })

  it('keyboard adapter respects events already consumed by other handlers', () => {
    const n = setup(`<button id="a"></button><button id="b"></button>`, {
      a: [0, 0, 80, 80],
      b: [100, 0, 80, 80],
    })
    n.focus('#a')
    const swallow = (e: KeyboardEvent) => e.preventDefault()
    window.addEventListener('keydown', swallow, { capture: true })
    press('ArrowRight')
    expect(document.activeElement?.id).toBe('a') // someone else owned that key
    window.removeEventListener('keydown', swallow, { capture: true })
  })

  it('stop() detaches input, start() reattaches', () => {
    const n = setup(`<button id="a"></button><button id="b"></button>`, {
      a: [0, 0, 80, 80],
      b: [100, 0, 80, 80],
    })
    n.focus('#a')
    n.stop()
    press('ArrowRight')
    expect(document.activeElement?.id).toBe('a')
    n.start()
    press('ArrowRight')
    expect(document.activeElement?.id).toBe('b')
  })
})
