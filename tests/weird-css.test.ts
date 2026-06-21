import { afterEach, describe, expect, it } from 'vitest'
import { SpatialEngine } from '../src/core/engine'
import { readNavConfig } from '../src/core/config'
import { rectProvider, type LayoutMap } from './helpers'

/**
 * The "spatial CSS" surface fed through real stylesheets — jsdom resolves
 * custom properties from <style> sheets and inline styles, so the cascade
 * path through getComputedStyle is exercised for real here. What jsdom
 * cannot do (@property inherits:false, media queries, var() substitution)
 * is pinned by demo/css-conformance.html in a real browser.
 */
function setup(css: string, html: string, layout: LayoutMap): SpatialEngine {
  const style = document.createElement('style')
  style.id = 'test-css'
  style.textContent = css
  document.head.appendChild(style)
  document.body.innerHTML = html
  return new SpatialEngine({
    getRect: rectProvider(layout),
    visibilityFilter: () => true,
    scrollBehavior: false,
  })
}

afterEach(() => {
  document.getElementById('test-css')?.remove()
  document.body.innerHTML = ''
})

const PAIR: LayoutMap = { a: [0, 0, 80, 80], b: [100, 0, 80, 80], c: [200, 0, 80, 80] }

describe('CSS-declared overrides', () => {
  it.each([
    ['double-quoted', `.from { --nav-right: "#c"; }`],
    ['single-quoted', `.from { --nav-right: '#c'; }`],
    ['unquoted', `.from { --nav-right: #c; }`],
    ['extra whitespace', `.from { --nav-right:    "#c"   ; }`],
  ])('resolves a %s selector value', (_label, css) => {
    const engine = setup(
      css,
      `<button id="a" class="from"></button><button id="b"></button><button id="c"></button>`,
      PAIR,
    )
    engine.focus(document.getElementById('a')!)
    engine.navigate('right')
    expect(engine.getFocused()?.id).toBe('c')
  })

  it('blocks a direction with a CSS none', () => {
    const engine = setup(
      `.edge { --nav-right: none; }`,
      `<button id="a" class="edge"></button><button id="b"></button>`,
      PAIR,
    )
    engine.focus(document.getElementById('a')!)
    expect(engine.navigate('right')).toBe(false)
  })

  it('data attributes win over CSS values', () => {
    const engine = setup(
      `.from { --nav-right: "#b"; }`,
      `<button id="a" class="from" data-nav-right="#c"></button><button id="b"></button><button id="c"></button>`,
      PAIR,
    )
    engine.focus(document.getElementById('a')!)
    engine.navigate('right')
    expect(engine.getFocused()?.id).toBe('c')
  })

  it('later cascade layers win (specificity resolution is the browser’s)', () => {
    const engine = setup(
      `.from { --nav-right: "#b"; }
       .from.override { --nav-right: "#c"; }`,
      `<button id="a" class="from override"></button><button id="b"></button><button id="c"></button>`,
      PAIR,
    )
    engine.focus(document.getElementById('a')!)
    engine.navigate('right')
    expect(engine.getFocused()?.id).toBe('c')
  })

  it('a var() indirection never crashes navigation, resolved or not', () => {
    const engine = setup(
      `.from { --t: "#c"; --nav-right: var(--t); }`,
      `<button id="a" class="from"></button><button id="b"></button><button id="c"></button>`,
      PAIR,
    )
    engine.focus(document.getElementById('a')!)
    // Browsers substitute var() in computed custom properties; if the
    // environment returns the literal 'var(--t)' instead, the malformed-
    // selector guard turns it into a blocked direction. Either way: no throw.
    expect(() => engine.navigate('right')).not.toThrow()
    expect(['a', 'c']).toContain(engine.getFocused()?.id)
  })
})

describe('CSS-declared containers', () => {
  it('a pure-CSS contain container traps focus', () => {
    const engine = setup(
      `.modal { --spatial-container: contain; }`,
      `<div class="modal"><button id="in1"></button><button id="in2"></button></div>
       <button id="out"></button>`,
      { in1: [0, 0, 80, 80], in2: [100, 0, 80, 80], out: [300, 0, 80, 80] },
    )
    engine.focus(document.getElementById('in2')!)
    expect(engine.navigate('right')).toBe(false)
  })

  it('pure-CSS wrap + remember drive full container behavior', () => {
    const engine = setup(
      `.rail { --spatial-container: wrap remember; }`,
      `<button id="s"></button>
       <div class="rail" id="rail">
         <button id="r1"></button><button id="r2"></button><button id="r3"></button>
       </div>`,
      {
        s: [0, 200, 80, 80],
        rail: [100, 0, 330, 80],
        r1: [100, 0, 80, 80],
        r2: [210, 0, 80, 80],
        r3: [320, 0, 80, 80],
      },
    )
    // wrap
    engine.focus(document.getElementById('r3')!)
    expect(engine.navigate('right')).toBe(true)
    expect(engine.getFocused()?.id).toBe('r1')
    // remember: leave to s, re-enter restores r1
    engine.focus(document.getElementById('s')!)
    engine.navigate('up')
    expect(engine.getFocused()?.id).toBe('r1')
  })

  it.each(['none', 'normal'])('--spatial-container: %s is not a container', (value) => {
    setup(
      `.x { --spatial-container: ${value}; }`,
      `<div class="x" id="x"><button id="in"></button></div>`,
      {},
    )
    expect(readNavConfig(document.getElementById('x')!).isContainer).toBe(false)
  })

  it('unknown tokens are ignored; known ones still apply', () => {
    setup(`.x { --spatial-container: contain banana42 wrap; }`, `<div class="x" id="x"></div>`, {})
    const config = readNavConfig(document.getElementById('x')!)
    expect(config.isContainer).toBe(true)
    expect(config.trap).toBe(true)
    expect(config.wrap).toBe(true)
    expect(config.remember).toBe(false)
  })

  it('a token-less custom value is a plain group (zone only)', () => {
    setup(`.x { --spatial-container: group; }`, `<div class="x" id="x"></div>`, {})
    const config = readNavConfig(document.getElementById('x')!)
    expect(config.isContainer).toBe(true)
    expect(config.trap).toBe(false)
    expect(config.wrap).toBe(false)
  })

  it('CSS default-focus marks the page entry point', () => {
    const engine = setup(
      `.hero { --spatial-default-focus: auto; }`,
      `<button id="a"></button><button id="hero" class="hero"></button>`,
      { a: [0, 0, 80, 80], hero: [100, 0, 80, 80] },
    )
    expect(engine.focusFirst()).toBe(true)
    expect(engine.getFocused()?.id).toBe('hero')
  })
})

describe('cascade dynamics', () => {
  it('runtime CSS changes apply on the next keypress (per-pass cache only)', () => {
    const engine = setup(
      `.blocked { --nav-right: none; }`,
      `<button id="a" class="blocked"></button><button id="b"></button>`,
      PAIR,
    )
    const a = document.getElementById('a')!
    engine.focus(a)
    expect(engine.navigate('right')).toBe(false) // blocked by the class
    a.classList.remove('blocked')
    expect(engine.navigate('right')).toBe(true) // unblocked — no stale cache
    expect(engine.getFocused()?.id).toBe('b')
  })

  it('inline style custom properties work without any stylesheet', () => {
    const engine = setup(
      ``,
      `<button id="a" style="--nav-right: '#c'"></button><button id="b"></button><button id="c"></button>`,
      PAIR,
    )
    engine.focus(document.getElementById('a')!)
    engine.navigate('right')
    expect(engine.getFocused()?.id).toBe('c')
  })

  it('inherited container values (no @property) degrade without crashing', () => {
    // Without @property registration, --spatial-container inherits to every
    // descendant — the pathological case the shipped stylesheet protects
    // against in real browsers. The engine must stay coherent regardless:
    // siblings remain reachable and the trap still holds.
    const engine = setup(
      `.zone { --spatial-container: contain; }`,
      `<div class="zone">
         <div><button id="x"></button></div>
         <div><button id="y"></button></div>
       </div>
       <button id="out"></button>`,
      { x: [0, 0, 80, 80], y: [100, 0, 80, 80], out: [300, 0, 80, 80] },
    )
    engine.focus(document.getElementById('x')!)
    expect(() => engine.navigate('right')).not.toThrow()
    expect(engine.getFocused()?.id).toBe('y')
    expect(engine.navigate('right')).toBe(false) // still trapped
  })

  it('elements detached mid-read do not break config reading', () => {
    const detached = document.createElement('button')
    detached.setAttribute('data-nav-right', '#x')
    // No document view styles for detached nodes in some engines — must not throw.
    expect(() => readNavConfig(detached)).not.toThrow()
    expect(readNavConfig(detached).explicit.right).toBe('#x')
  })
})
