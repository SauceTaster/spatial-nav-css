import { afterEach, describe, expect, it } from 'vitest'
import { SpatialEngine } from '../src/core/engine'
import { createSpatialNavigation, keyboardAdapter } from '../src/index'
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
    expect(document.getElementById('in')!.classList.contains('spatial-focused')).toBe(false)
    // …and when focus returns to <body>, the spatial position persists.
    document.getElementById('outside')!.blur()
    expect(engine.getFocused()?.id).toBe('in')
  })

  it('relinquishes ownership and its focus ring when an excluded control receives focus', () => {
    document.body.innerHTML = `
      <div id="region">
        <button id="owned"></button>
        <button id="excluded" tabindex="-1"></button>
      </div>`
    const engine = new SpatialEngine({
      root: document.getElementById('region')!,
      getRect: rectProvider({ owned: [0, 0, 80, 80], excluded: [100, 0, 80, 80] }),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    engine.start()
    engine.focus(document.getElementById('owned')!)

    document.getElementById('excluded')!.focus()
    const actualActive = document.activeElement
    const reportedFocused = engine.getFocused()
    const oldRing = document.getElementById('owned')!.classList.contains('spatial-focused')
    engine.destroy()

    expect((actualActive as HTMLElement | null)?.id).toBe('excluded')
    expect(reportedFocused).toBeNull()
    expect(oldRing).toBe(false)
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

describe('semantic visibility is not replaceable', () => {
  it('keeps aria-hidden content unreachable even under a custom visibilityFilter', () => {
    // Regression: every portaled overlay library (Radix, Headless UI, Ark,
    // MUI) contains focus by aria-hiding the rest of the page rather than
    // using a native <dialog>. `visibilityFilter` used to replace that
    // policy wholesale, so an app that supplied one — commonly to work
    // around a layout quirk — silently let navigation reach controls behind
    // its own open modal.
    document.body.innerHTML = `
      <div id="page" aria-hidden="true"><button id="behind"></button></div>
      <div id="overlay" role="dialog" aria-modal="true">
        <button id="ok"></button><button id="cancel"></button>
      </div>`
    const engine = new SpatialEngine({
      getRect: rectProvider({
        behind: [0, 0, 100, 40],
        ok: [0, 200, 100, 40],
        cancel: [0, 260, 100, 40],
      }),
      visibilityFilter: () => true, // the app's own rendering override
      scrollBehavior: false,
    })
    engine.focus(document.getElementById('ok')!)
    expect(engine.navigate('up')).toBe(false)
    expect(engine.getFocused()?.id).toBe('ok')
    expect(engine.findTarget('up', document.getElementById('ok')!)).toBeNull()
    engine.destroy()
  })

  it('still lets a custom filter hide elements the browser would paint', () => {
    document.body.innerHTML = `<button id="a"></button><button id="b"></button>`
    const engine = new SpatialEngine({
      getRect: rectProvider({ a: [0, 0, 80, 40], b: [100, 0, 80, 40] }),
      visibilityFilter: (el) => el.id !== 'b',
      scrollBehavior: false,
    })
    engine.focus(document.getElementById('a')!)
    expect(engine.navigate('right')).toBe(false)
    engine.destroy()
  })
})

describe('focus parked on a non-navigable wrapper', () => {
  it('claims focus from a framework modal wrapper instead of going dead', async () => {
    // Regression: MUI/Radix-style focus traps focus the dialog's own
    // tabindex="-1" surface on open. The engine had no spatial target, but
    // saw a non-body activeElement and treated focus as claimed — so
    // claimFocus() refused and, worse, the first arrow press did nothing at
    // all. From the user's side the remote was simply dead.
    document.body.innerHTML = `
      <div id="surface" tabindex="-1" role="dialog">
        <button id="ok"></button><button id="cancel"></button>
      </div>`
    const nav = createSpatialNavigation({
      adapters: [keyboardAdapter()],
      getRect: rectProvider({ ok: [0, 0, 80, 40], cancel: [100, 0, 80, 40] }),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    nav.start()
    document.getElementById('surface')!.focus() // what the focus trap does
    expect(nav.getFocused()).toBeNull()

    expect(nav.claimFocus('#ok')).toBe(true)
    expect(nav.getFocused()?.id).toBe('ok')
    nav.destroy()
  })

  it('still refuses to take focus that another region genuinely owns', () => {
    document.body.innerHTML =
      '<div id="scope"><button id="a"></button></div><button id="other"></button>'
    const nav = createSpatialNavigation({
      root: document.getElementById('scope') as HTMLElement,
      adapters: [],
      getRect: rectProvider({ a: [0, 0, 80, 40], other: [200, 0, 80, 40] }),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    nav.start()
    document.getElementById('other')!.focus()
    expect(nav.claimFocus()).toBe(false)
    expect(document.activeElement?.id).toBe('other')
    nav.destroy()
  })

  it('re-adopts the focused element when an overlay un-hides the page', async () => {
    // An exit transition removes aria-hidden after DOM focus is already back
    // on the trigger; no focus event fires, so without this the engine stayed
    // empty and auto-restore later dragged the user to the first focusable.
    document.body.innerHTML = '<div id="page"><button id="trigger"></button></div>'
    const page = document.getElementById('page')!
    const nav = createSpatialNavigation({
      adapters: [],
      getRect: rectProvider({ trigger: [0, 0, 80, 40] }),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    nav.start()
    page.setAttribute('aria-hidden', 'true')
    document.getElementById('trigger')!.focus()
    expect(nav.getFocused()).toBeNull()

    page.removeAttribute('aria-hidden')
    await new Promise((r) => setTimeout(r, 0))
    expect(nav.getFocused()?.id).toBe('trigger')
    nav.destroy()
  })
})

describe('focus redirected during focusin', () => {
  it('does not adopt a target the app has already moved focus away from', async () => {
    // Regression: a component that redirects entry (a menu sending focus to
    // its first item from its own onFocus) runs *before* this document-level
    // listener when React dispatches it. The engine then adopted the original
    // target, leaving the ring on an element without DOM focus — and the next
    // direction press started from there instead of where the user was.
    document.body.innerHTML = `
      <div id="panel" tabindex="-1"></div>
      <button id="first"></button>
      <button id="second"></button>`
    const panel = document.getElementById('panel') as HTMLElement
    const first = document.getElementById('first') as HTMLElement
    const engine = new SpatialEngine({
      getRect: rectProvider({
        panel: [0, 0, 200, 40],
        first: [0, 50, 200, 40],
        second: [0, 100, 200, 40],
      }),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    engine.start()

    // The app's own redirect, registered before the engine sees the event.
    panel.addEventListener('focusin', () => first.focus())
    panel.focus()

    expect(document.activeElement?.id).toBe('first')
    expect(engine.getFocused()?.id).toBe('first')
    expect(panel.hasAttribute('data-spatial-focused')).toBe(false)
    expect(first.hasAttribute('data-spatial-focused')).toBe(true)

    // …and navigation continues from where focus actually is.
    engine.navigate('down')
    expect(engine.getFocused()?.id).toBe('second')
    engine.destroy()
  })
})
