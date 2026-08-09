import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpatialEngine } from '../src/core/engine'
import { rectProvider, type LayoutMap } from './helpers'

function makeEngine(html: string, layout: LayoutMap): SpatialEngine {
  document.body.innerHTML = html
  return new SpatialEngine({
    getRect: rectProvider(layout),
    visibilityFilter: () => true,
    scrollBehavior: false,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

const GRID = `
  <button id="a"></button><button id="b"></button>
  <button id="c"></button><button id="d"></button>
`
const GRID_LAYOUT: LayoutMap = {
  a: [0, 0, 80, 80],
  b: [100, 0, 80, 80],
  c: [0, 100, 80, 80],
  d: [100, 100, 80, 80],
}

describe('SpatialEngine.navigate', () => {
  it('moves through a grid', () => {
    const engine = makeEngine(GRID, GRID_LAYOUT)
    engine.focus(document.getElementById('a')!)
    expect(engine.navigate('right')).toBe(true)
    expect(engine.getFocused()?.id).toBe('b')
    expect(engine.navigate('down')).toBe(true)
    expect(engine.getFocused()?.id).toBe('d')
    expect(engine.navigate('left')).toBe(true)
    expect(engine.getFocused()?.id).toBe('c')
    expect(engine.navigate('up')).toBe(true)
    expect(engine.getFocused()?.id).toBe('a')
  })

  it('fires spatial:nofocustarget at the edge of the UI', () => {
    const engine = makeEngine(GRID, GRID_LAYOUT)
    engine.focus(document.getElementById('b')!)
    const listener = vi.fn()
    document.addEventListener('spatial:nofocustarget', listener)
    expect(engine.navigate('right')).toBe(false)
    expect(listener).toHaveBeenCalledOnce()
    document.removeEventListener('spatial:nofocustarget', listener)
  })

  it('focuses the first focusable when nothing is focused yet', () => {
    const engine = makeEngine(GRID, GRID_LAYOUT)
    expect(engine.navigate('down')).toBe(true)
    expect(engine.getFocused()?.id).toBe('a')
  })

  it('honors explicit data-nav-* overrides', () => {
    const engine = makeEngine(
      `<button id="a" data-nav-right="#d"></button><button id="b"></button><button id="d"></button>`,
      { a: [0, 0, 80, 80], b: [100, 0, 80, 80], d: [200, 0, 80, 80] },
    )
    engine.focus(document.getElementById('a')!)
    engine.navigate('right')
    expect(engine.getFocused()?.id).toBe('d')
  })

  it('blocks a direction with data-nav-*="none"', () => {
    const engine = makeEngine(`<button id="a" data-nav-right="none"></button><button id="b"></button>`, {
      a: [0, 0, 80, 80],
      b: [100, 0, 80, 80],
    })
    engine.focus(document.getElementById('a')!)
    expect(engine.navigate('right')).toBe(false)
    expect(engine.getFocused()?.id).toBe('a')
  })
})

describe('containers', () => {
  it('traps focus inside a contain container', () => {
    const engine = makeEngine(
      `<div id="modal" data-spatial-container="contain">
         <button id="in1"></button><button id="in2"></button>
       </div>
       <button id="outside"></button>`,
      { in1: [0, 0, 80, 80], in2: [100, 0, 80, 80], outside: [300, 0, 80, 80] },
    )
    engine.focus(document.getElementById('in2')!)
    expect(engine.navigate('right')).toBe(false)
    expect(engine.getFocused()?.id).toBe('in2')
  })

  it('wraps around inside a wrap container', () => {
    const engine = makeEngine(
      `<div id="row" data-spatial-container="wrap">
         <button id="r1"></button><button id="r2"></button><button id="r3"></button>
       </div>`,
      { row: [0, 0, 320, 80], r1: [0, 0, 80, 80], r2: [110, 0, 80, 80], r3: [220, 0, 80, 80] },
    )
    engine.focus(document.getElementById('r3')!)
    expect(engine.navigate('right')).toBe(true)
    expect(engine.getFocused()?.id).toBe('r1')
  })

  it('wraps across content that overflows the container box (scrolled carousel)', () => {
    // Regression: the wrap origin must clear the candidates' extent, not the
    // container's visible box — in an overflow carousel, off-screen cards
    // sit beyond the container rect.
    const engine = makeEngine(
      `<div id="row" data-spatial-container="wrap">
         <button id="r1"></button><button id="r2"></button><button id="r3"></button>
       </div>`,
      // Container box is 300 wide; r3 is scrolled out past its right edge.
      { row: [0, 0, 300, 80], r1: [0, 0, 80, 80], r2: [110, 0, 80, 80], r3: [400, 0, 80, 80] },
    )
    engine.focus(document.getElementById('r1')!)
    expect(engine.navigate('left')).toBe(true)
    expect(engine.getFocused()?.id).toBe('r3')
  })

  it('does not wrap orthogonally to the container axis — escalates instead', () => {
    // Regression: pressing "down" from a horizontal wrap row used to wrap
    // sideways to a sibling tab instead of leaving the row.
    const engine = makeEngine(
      `<div id="row" data-spatial-container="wrap">
         <button id="r1"></button><button id="r2"></button>
       </div>
       <button id="below"></button>`,
      { row: [0, 0, 210, 80], r1: [0, 0, 80, 80], r2: [110, 0, 80, 80], below: [0, 200, 80, 80] },
    )
    engine.focus(document.getElementById('r1')!)
    expect(engine.navigate('down')).toBe(true)
    expect(engine.getFocused()?.id).toBe('below')
  })

  it('does not wrap orthogonally when wrap-row items are slightly misaligned', () => {
    // Regression: the wrap guard accepted the loose 'overlapping' direction
    // tier, so a same-row sibling sitting a few pixels off-axis (baseline
    // alignment, mixed card heights) counted as "behind us" for an
    // orthogonal press and "down" wrapped sideways instead of exiting.
    const html = `<div id="row" data-spatial-container="wrap">
        <button id="r1"></button><button id="r2"></button>
      </div>
      <button id="above"></button>
      <button id="below"></button>`
    const layout: LayoutMap = {
      row: [0, 100, 210, 90],
      r1: [0, 100, 80, 80],
      r2: [110, 105, 80, 80], // 5px lower than r1
      above: [0, 0, 80, 80],
      below: [0, 300, 80, 80],
    }

    let engine = makeEngine(html, layout)
    engine.focus(document.getElementById('r2')!)
    expect(engine.navigate('down')).toBe(true)
    expect(engine.getFocused()?.id).toBe('below')

    engine = makeEngine(html, layout)
    engine.focus(document.getElementById('r1')!)
    expect(engine.navigate('up')).toBe(true)
    expect(engine.getFocused()?.id).toBe('above')

    // The row-axis wrap itself must still engage despite the misalignment.
    engine = makeEngine(html, layout)
    engine.focus(document.getElementById('r2')!)
    expect(engine.navigate('right')).toBe(true)
    expect(engine.getFocused()?.id).toBe('r1')
  })

  it('contain wrap keeps orthogonal presses at rest instead of shuffling sideways', () => {
    const engine = makeEngine(
      `<div id="row" data-spatial-container="contain wrap">
         <button id="r1"></button><button id="r2"></button>
       </div>
       <button id="below"></button>`,
      {
        row: [0, 0, 210, 90],
        r1: [0, 0, 80, 80],
        r2: [110, 5, 80, 80],
        below: [0, 300, 80, 80],
      },
    )
    engine.focus(document.getElementById('r2')!)
    expect(engine.navigate('down')).toBe(false)
    expect(engine.getFocused()?.id).toBe('r2')
  })

  it('leaves a mixed-width grid instead of moving diagonally at the row edge', () => {
    // Regression, from an inventory UI: a 2-cell-wide item sits above a
    // 1-cell item sharing its left edge. Pressing left from the wide item
    // used to drop diagonally onto the narrow one below (its center was
    // marginally further left) instead of escaping the grid to the sidebar.
    const engine = makeEngine(
      `<nav id="menu"><button id="m1"></button></nav>
       <div id="bag" data-spatial-container>
         <button id="wide"></button><button id="right"></button>
         <button id="below"></button>
       </div>`,
      {
        menu: [40, 100, 200, 60],
        m1: [40, 100, 200, 44],
        bag: [340, 100, 400, 200],
        wide: [340, 100, 188, 60], // spans two cells
        right: [536, 100, 90, 60],
        below: [340, 168, 90, 60], // same left edge, one row down
      },
    )
    engine.focus(document.getElementById('wide')!)
    expect(engine.navigate('left')).toBe(true)
    expect(engine.getFocused()?.id).toBe('m1')
  })

  it('ignores a collapsed focusable when sizing a zone', () => {
    // Regression: one 0x0 focusable inside a container — an offscreen focus
    // guard, a chart library's tabbable <svg> before it measures — reports a
    // rect at the viewport origin, and unioning it stretched the zone all
    // the way up to (0,0). Every zone-level score then shifted: "down" from
    // the header skipped the panel entirely and landed two zones away.
    const engine = makeEngine(
      `<button id="header"></button>
       <div id="panel" data-spatial-container>
         <span id="ghost" tabindex="0"></span>
         <button id="inside"></button>
       </div>
       <button id="far"></button>`,
      {
        header: [0, 0, 400, 60],
        panel: [0, 200, 400, 120],
        ghost: [0, 0, 0, 0], // collapsed: no layout yet
        inside: [0, 200, 200, 60],
        far: [0, 600, 400, 60],
      },
    )
    engine.focus(document.getElementById('header')!)
    expect(engine.navigate('down')).toBe(true)
    expect(engine.getFocused()?.id).toBe('inside')
  })

  it('escalates out of a non-trapping container', () => {
    const engine = makeEngine(
      `<div data-spatial-container>
         <button id="in1"></button>
       </div>
       <button id="outside"></button>`,
      { in1: [0, 0, 80, 80], outside: [200, 0, 80, 80] },
    )
    engine.focus(document.getElementById('in1')!)
    expect(engine.navigate('right')).toBe(true)
    expect(engine.getFocused()?.id).toBe('outside')
  })

  it('restores focus memory when re-entering a remember container', () => {
    const engine = makeEngine(
      `<div id="sidebar">
         <button id="s1"></button>
       </div>
       <div id="content" data-spatial-container="remember">
         <button id="c1"></button><button id="c2"></button>
       </div>`,
      {
        s1: [0, 0, 80, 80],
        c1: [200, 0, 80, 80],
        c2: [200, 100, 80, 80],
      },
    )
    // Visit c2 so the container remembers it, then leave to the sidebar.
    engine.focus(document.getElementById('c2')!)
    engine.focus(document.getElementById('s1')!)
    // Re-enter: geometry would pick c1 (same row), memory says c2.
    expect(engine.navigate('right')).toBe(true)
    expect(engine.getFocused()?.id).toBe('c2')
  })

  it('a wide scrolled band is not penalized for its breadth', () => {
    // Regression: the nearest row below had wide scrolled content (band
    // extends far right), dragging its *center* off-axis; center-offset
    // scoring made a farther, narrower row win. Drift must be measured to
    // the zone's span, not its center.
    const engine = makeEngine(
      `<button id="from"></button>
       <div id="wide" data-spatial-container>
         <button id="w1"></button>
       </div>
       <div id="narrow" data-spatial-container>
         <button id="n1"></button>
       </div>`,
      {
        from: [248, 200, 260, 130],
        wide: [244, 571, 974, 222], // nearer, but band sprawls to x=1218
        w1: [248, 581, 150, 200],
        narrow: [244, 984, 646, 222], // farther, narrower (center more in line)
        n1: [248, 994, 150, 200],
      },
    )
    engine.focus(document.getElementById('from')!)
    expect(engine.navigate('down')).toBe(true)
    expect(engine.getFocused()?.id).toBe('w1')
  })

  it('a near wide band beats a far narrow zone whose center is more in line', () => {
    // Regression (inverse of the previous): going up from a row, the
    // adjacent wide band must win over a distant narrow header even though
    // the header's center is almost exactly in line with the origin.
    const engine = makeEngine(
      `<div id="header" data-spatial-container>
         <button id="tab"></button>
       </div>
       <div id="band" data-spatial-container>
         <button id="b1"></button>
       </div>
       <button id="from"></button>`,
      {
        header: [0, 0, 548, 64],
        tab: [240, 10, 80, 44], // center ≈ origin center
        band: [244, 190, 974, 154], // adjacent, sprawls right (center far off)
        b1: [248, 200, 260, 130],
        from: [248, 581, 150, 200],
      },
    )
    engine.focus(document.getElementById('from')!)
    expect(engine.navigate('up')).toBe(true)
    expect(engine.getFocused()?.id).toBe('b1')
  })

  it('routes to the aligned zone, not a diagonally nearer element in another zone', () => {
    // Layout echoing a console UI: header tabs up top, sidebar on the left,
    // content cards beside it. From the sidebar's top item, "right" must
    // land in the content zone even though a header tab is geometrically
    // nearer — sibling containers compete as whole zones first.
    const engine = makeEngine(
      `<div id="header" data-spatial-container>
         <button id="tab1"></button><button id="tab2"></button>
       </div>
       <div id="sidebar" data-spatial-container>
         <button id="side1"></button>
       </div>
       <div id="content" data-spatial-container>
         <button id="card1"></button>
       </div>`,
      {
        header: [0, 0, 800, 60],
        tab1: [100, 10, 60, 40],
        tab2: [220, 10, 60, 40],
        sidebar: [0, 80, 200, 400],
        side1: [10, 90, 180, 36],
        content: [220, 80, 580, 400],
        card1: [240, 160, 200, 120],
      },
    )
    engine.focus(document.getElementById('side1')!)
    expect(engine.navigate('right')).toBe(true)
    expect(engine.getFocused()?.id).toBe('card1')
  })

  it('memory beats default focus, even when memory equals the geometric target', () => {
    // Regression: when the geometric pick already WAS the remembered child,
    // entry used to fall through to the autofocus child instead.
    const engine = makeEngine(
      `<button id="top"></button>
       <div id="row" data-spatial-container="remember">
         <button id="r1"></button>
         <button id="r2" data-spatial-autofocus></button>
       </div>`,
      { top: [0, 0, 80, 80], r1: [0, 200, 80, 80], r2: [100, 200, 80, 80] },
    )
    engine.focus(document.getElementById('r1')!)
    engine.focus(document.getElementById('top')!)
    // Geometry picks r1 (directly below) and memory is also r1 — autofocus r2
    // must not hijack the entry.
    expect(engine.navigate('down')).toBe(true)
    expect(engine.getFocused()?.id).toBe('r1')
  })

  it('enters at the declared default focus', () => {
    const engine = makeEngine(
      `<button id="s1"></button>
       <div id="menu" data-spatial-container>
         <button id="m1"></button>
         <button id="m2" data-spatial-autofocus></button>
       </div>`,
      { s1: [0, 0, 80, 80], m1: [200, 0, 80, 80], m2: [200, 100, 80, 80] },
    )
    engine.focus(document.getElementById('s1')!)
    engine.navigate('right')
    expect(engine.getFocused()?.id).toBe('m2')
  })
})

describe('focus lifecycle', () => {
  it('applies and moves the focus class', () => {
    const engine = makeEngine(GRID, GRID_LAYOUT)
    engine.focus(document.getElementById('a')!)
    expect(document.getElementById('a')!.classList.contains('spatial-focused')).toBe(true)
    engine.navigate('right')
    expect(document.getElementById('a')!.classList.contains('spatial-focused')).toBe(false)
    expect(document.getElementById('b')!.classList.contains('spatial-focused')).toBe(true)
  })

  it('mirrors the focus decoration in an attribute frameworks do not manage', () => {
    // Regression: a framework rendering className rewrites the class
    // attribute on its next render and silently erased the focus ring. The
    // attribute survives that, so the shipped stylesheet still matches.
    const engine = makeEngine(GRID, GRID_LAYOUT)
    const a = document.getElementById('a')!
    const b = document.getElementById('b')!
    engine.focus(a)
    expect(a.hasAttribute('data-spatial-focused')).toBe(true)

    // Simulate React/Vue/Svelte reconciling `class` from their own state.
    a.className = 'card is-focused'
    expect(a.hasAttribute('data-spatial-focused')).toBe(true)

    engine.navigate('right')
    expect(a.hasAttribute('data-spatial-focused')).toBe(false)
    expect(b.hasAttribute('data-spatial-focused')).toBe(true)

    engine.destroy()
    expect(b.hasAttribute('data-spatial-focused')).toBe(false)
  })

  it('gives data-focusable elements a tabindex so they hold real focus', () => {
    const engine = makeEngine(`<div id="card" data-focusable></div>`, { card: [0, 0, 80, 80] })
    engine.focus(document.getElementById('card')!)
    expect(document.getElementById('card')!.getAttribute('tabindex')).toBe('-1')
    expect(document.activeElement?.id).toBe('card')
  })

  it('vetoes moves via cancelable spatial:beforefocus', () => {
    const engine = makeEngine(GRID, GRID_LAYOUT)
    engine.focus(document.getElementById('a')!)
    const veto = (e: Event) => e.preventDefault()
    document.getElementById('b')!.addEventListener('spatial:beforefocus', veto)
    expect(engine.navigate('right')).toBe(false)
    expect(engine.getFocused()?.id).toBe('a')
  })

  it('activate() clicks the focused element unless prevented', () => {
    const engine = makeEngine(GRID, GRID_LAYOUT)
    const a = document.getElementById('a')!
    engine.focus(a)
    const clicked = vi.fn()
    a.addEventListener('click', clicked)
    engine.activate()
    expect(clicked).toHaveBeenCalledOnce()

    a.addEventListener('spatial:activate', (e) => e.preventDefault())
    engine.activate()
    expect(clicked).toHaveBeenCalledOnce()
  })

  it('adopts focus that arrives natively (mouse, Tab key)', () => {
    const engine = makeEngine(GRID, GRID_LAYOUT)
    engine.start()
    document.getElementById('c')!.focus()
    expect(engine.getFocused()?.id).toBe('c')
    expect(engine.navigate('right')).toBe(true)
    expect(engine.getFocused()?.id).toBe('d')
    engine.destroy()
  })
})
