import { afterEach, describe, expect, it } from 'vitest'
import { SpatialEngine } from '../src/core/engine'
import { rectProvider, type LayoutMap } from './helpers'

function makeEngine(
  html: string,
  layout: LayoutMap,
  visible?: (el: HTMLElement) => boolean,
): SpatialEngine {
  document.body.innerHTML = html
  return new SpatialEngine({
    getRect: rectProvider(layout),
    visibilityFilter: visible ?? (() => true),
    scrollBehavior: false,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('edge cases', () => {
  it('skips invisible elements', () => {
    const engine = makeEngine(
      `<button id="a"></button><button id="hidden" class="hide"></button><button id="c"></button>`,
      { a: [0, 0, 80, 80], hidden: [100, 0, 80, 80], c: [200, 0, 80, 80] },
      (el) => !el.classList.contains('hide'),
    )
    engine.focus(document.getElementById('a')!)
    engine.navigate('right')
    expect(engine.getFocused()?.id).toBe('c')
  })

  it('native widgets with tabindex="-1" are not stops (slider-in-row pattern)', () => {
    // Regression: a range input with tabindex="-1" nested in a focusable row
    // used to be a candidate itself, so "right" landed on the inner slider.
    const engine = makeEngine(
      `<div id="row1" data-focusable>UI scale <input id="s1" type="range" tabindex="-1"></div>
       <div id="row2" data-focusable>Rumble <input id="s2" type="range" tabindex="-1"></div>`,
      {
        row1: [0, 0, 400, 50],
        s1: [250, 10, 140, 30],
        row2: [0, 60, 400, 50],
        s2: [250, 70, 140, 30],
      },
    )
    engine.focus(document.getElementById('row1')!)
    expect(engine.navigate('right')).toBe(false) // nothing right — sliders aren't stops
    expect(engine.navigate('down')).toBe(true)
    expect(engine.getFocused()?.id).toBe('row2')
  })

  it('skips zero-size elements', () => {
    const engine = makeEngine(
      `<button id="a"></button><button id="ghost"></button><button id="c"></button>`,
      { a: [0, 0, 80, 80], ghost: [100, 0, 0, 0], c: [200, 0, 80, 80] },
    )
    engine.focus(document.getElementById('a')!)
    engine.navigate('right')
    expect(engine.getFocused()?.id).toBe('c')
  })

  it('resyncs from real DOM focus when focusin was missed (unfocused window)', () => {
    // Browsers do not fire focus events while the window lacks OS focus,
    // but document.activeElement still updates. getFocused() must trust the
    // real focus and adopt it.
    const engine = makeEngine(`<button id="a"></button><button id="b"></button>`, {
      a: [0, 0, 80, 80],
      b: [100, 0, 80, 80],
    })
    engine.focus(document.getElementById('a')!)
    // No focusin listener is attached (engine not started) — simulates the
    // missed event.
    document.getElementById('b')!.focus()
    expect(engine.getFocused()?.id).toBe('b')
    expect(document.getElementById('b')!.classList.contains('spatial-focused')).toBe(true)
    expect(engine.navigate('left')).toBe(true)
    expect(engine.getFocused()?.id).toBe('a')
  })

  it('reports nothing focused while focus lives outside the engine root', () => {
    document.body.innerHTML = `<button id="outside"></button><div id="region"><button id="in"></button></div>`
    const engine = new SpatialEngine({
      root: document.getElementById('region')!,
      getRect: rectProvider({ in: [0, 0, 80, 80], outside: [200, 0, 80, 80] }),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    engine.focus(document.getElementById('in')!)
    expect(engine.getFocused()?.id).toBe('in')
    // Another region takes real focus: this engine no longer owns it…
    document.getElementById('outside')!.focus()
    expect(engine.getFocused()).toBe(null)
    // …and when focus returns to <body>, the spatial position persists.
    document.getElementById('outside')!.blur()
    expect(engine.getFocused()?.id).toBe('in')
  })

  it('recovers when the focused element is removed from the DOM', () => {
    const engine = makeEngine(`<button id="a"></button><button id="b"></button>`, {
      a: [0, 0, 80, 80],
      b: [100, 0, 80, 80],
    })
    engine.focus(document.getElementById('a')!)
    document.getElementById('a')!.remove()
    expect(engine.getFocused()).toBe(null)
    // Navigation falls back to claiming first focus rather than crashing.
    expect(engine.navigate('right')).toBe(true)
    expect(engine.getFocused()?.id).toBe('b')
  })

  it('drops stale focus memory when the remembered element is removed', () => {
    const engine = makeEngine(
      `<button id="s1"></button>
       <div id="zone" data-spatial-container="remember">
         <button id="c1"></button><button id="c2"></button>
       </div>`,
      { s1: [0, 0, 80, 80], c1: [200, 0, 80, 80], c2: [200, 100, 80, 80] },
    )
    engine.focus(document.getElementById('c2')!)
    engine.focus(document.getElementById('s1')!)
    document.getElementById('c2')!.remove()
    engine.navigate('right')
    expect(engine.getFocused()?.id).toBe('c1')
  })

  it('restores the innermost position through nested remember containers', () => {
    const engine = makeEngine(
      `<button id="s1"></button>
       <div id="outer" data-spatial-container="remember">
         <div id="inner" data-spatial-container="remember">
           <button id="i1"></button><button id="i2"></button>
         </div>
         <button id="o1"></button>
       </div>`,
      {
        s1: [0, 0, 80, 80],
        i1: [200, 0, 80, 80],
        i2: [200, 100, 80, 80],
        o1: [200, 200, 80, 80],
      },
    )
    engine.focus(document.getElementById('i2')!)
    engine.focus(document.getElementById('s1')!)
    engine.navigate('right')
    // The outer container's memory points at the leaf that actually had focus.
    expect(engine.getFocused()?.id).toBe('i2')
  })

  it('does not wrap a single-item container', () => {
    const engine = makeEngine(
      `<div id="row" data-spatial-container="wrap"><button id="only"></button></div>`,
      { row: [0, 0, 100, 80], only: [0, 0, 80, 80] },
    )
    engine.focus(document.getElementById('only')!)
    expect(engine.navigate('right')).toBe(false)
    expect(engine.getFocused()?.id).toBe('only')
  })

  it('explicit overrides bypass container entry redirection', () => {
    const engine = makeEngine(
      `<button id="a" data-nav-right="#c2"></button>
       <div data-spatial-container="remember">
         <button id="c1" data-spatial-autofocus></button><button id="c2"></button>
       </div>`,
      { a: [0, 0, 80, 80], c1: [200, 0, 80, 80], c2: [200, 100, 80, 80] },
    )
    engine.focus(document.getElementById('a')!)
    engine.navigate('right')
    // The author said #c2; neither autofocus nor memory second-guesses that.
    expect(engine.getFocused()?.id).toBe('c2')
  })

  it('focus() accepts a selector and returns false for missing targets', () => {
    const engine = makeEngine(`<button id="a"></button>`, { a: [0, 0, 80, 80] })
    expect(engine.focus('#a')).toBe(true)
    expect(engine.getFocused()?.id).toBe('a')
    expect(engine.focus('#missing')).toBe(false)
  })

  it('navigating inside a trap with an explicit escape hatch works', () => {
    const engine = makeEngine(
      `<div id="modal" data-spatial-container="contain">
         <button id="in" data-nav-down="#outside"></button>
       </div>
       <button id="outside"></button>`,
      { in: [0, 0, 80, 80], outside: [0, 200, 80, 80] },
    )
    engine.focus(document.getElementById('in')!)
    // Trapped geometrically…
    expect(engine.navigate('right')).toBe(false)
    // …but explicit overrides still win (intentional escape hatch).
    expect(engine.navigate('down')).toBe(true)
    expect(engine.getFocused()?.id).toBe('outside')
  })

  it('empty containers are invisible to zone search', () => {
    const engine = makeEngine(
      `<button id="a"></button>
       <div id="empty" data-spatial-container></div>
       <button id="c"></button>`,
      { a: [0, 0, 80, 80], empty: [100, 0, 80, 80], c: [300, 0, 80, 80] },
    )
    engine.focus(document.getElementById('a')!)
    engine.navigate('right')
    expect(engine.getFocused()?.id).toBe('c')
  })
})
