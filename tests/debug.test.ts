import { afterEach, describe, expect, it } from 'vitest'
import { attachDebugOverlay, type DebugOverlayHandle } from '../src/debug/index'
import { SpatialEngine } from '../src/core/engine'
import { rectProvider } from './helpers'

let handle: DebugOverlayHandle | null = null
let engine: SpatialEngine | null = null

const layer = () => document.querySelector<HTMLElement>('[data-spatial-debug-overlay]')

afterEach(() => {
  handle?.detach()
  handle = null
  engine?.destroy()
  engine = null
  document.body.innerHTML = ''
})

describe('debug overlay', () => {
  it('draws one box per container and per focusable, labeled', () => {
    document.body.innerHTML = `
      <div data-spatial-container="wrap remember">
        <button id="a"></button><button id="b"></button>
      </div>
      <button id="c"></button>`
    engine = new SpatialEngine({
      getRect: rectProvider({ a: [0, 0, 80, 80], b: [100, 0, 80, 80], c: [300, 0, 80, 80] }),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    handle = attachDebugOverlay(engine, { assumeVisible: true })

    expect(layer()).not.toBeNull()
    expect(layer()!.children).toHaveLength(4) // 1 container + 3 focusables
    expect(layer()!.textContent).toContain('wrap remember')
  })

  it('marks the focused element and repaints on spatial:focus', () => {
    document.body.innerHTML = `<button id="a"></button><button id="b"></button>`
    engine = new SpatialEngine({
      getRect: rectProvider({ a: [0, 0, 80, 80], b: [100, 0, 80, 80] }),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    handle = attachDebugOverlay(engine, { assumeVisible: true })
    const focusedBoxes = () =>
      [...layer()!.children].filter((el) => (el as HTMLElement).style.cssText.includes('248, 113, 113'))
    expect(focusedBoxes()).toHaveLength(0)

    engine.focus(document.getElementById('a')!)
    expect(focusedBoxes()).toHaveLength(1)
  })

  it('detach removes the layer and stops listening', () => {
    document.body.innerHTML = `<button id="a"></button>`
    engine = new SpatialEngine({
      getRect: rectProvider({ a: [0, 0, 80, 80] }),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    handle = attachDebugOverlay(engine, { assumeVisible: true })
    handle.detach()
    handle = null
    expect(layer()).toBeNull()
    engine.focus(document.getElementById('a')!) // no resurrection
    expect(layer()).toBeNull()
  })

  it('works against a SpatialNavigation-shaped host ({ engine })', () => {
    document.body.innerHTML = `<button id="a"></button>`
    engine = new SpatialEngine({
      getRect: rectProvider({ a: [0, 0, 80, 80] }),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    handle = attachDebugOverlay({ engine }, { assumeVisible: true })
    expect(layer()!.children).toHaveLength(1)
  })
})
