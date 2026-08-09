import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpatialEngine } from '../src/core/engine'
import { isElementVisible } from '../src/core/dom'
import { createSpatialNavigation } from '../src/index'
import type { AdapterContext, InputAdapter } from '../src/input/types'
import { rect, rectProvider, type LayoutMap } from './helpers'

function makeEngine(html: string, layout: LayoutMap, root?: Document | HTMLElement): SpatialEngine {
  document.body.innerHTML = html
  return new SpatialEngine({
    root: root ?? document,
    getRect: rectProvider(layout),
    visibilityFilter: () => true,
    scrollBehavior: false,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('hostile config values', () => {
  it('a malformed data-nav-* selector blocks the direction instead of throwing', () => {
    const engine = makeEngine(
      `<button id="a" data-nav-right="##!!("></button><button id="b"></button>`,
      { a: [0, 0, 80, 80], b: [100, 0, 80, 80] },
    )
    engine.focus(document.getElementById('a')!)
    expect(() => engine.navigate('right')).not.toThrow()
    expect(engine.navigate('right')).toBe(false)
    expect(engine.getFocused()?.id).toBe('a')
  })

  it('an override resolving to the origin itself is a no-move, not a self-focus', () => {
    const engine = makeEngine(`<button id="a" data-nav-right="#a"></button>`, {
      a: [0, 0, 80, 80],
    })
    engine.focus(document.getElementById('a')!)
    const beforeFocus = vi.fn()
    document.addEventListener('spatial:beforefocus', beforeFocus)
    expect(engine.navigate('right')).toBe(false)
    expect(beforeFocus).not.toHaveBeenCalled()
    document.removeEventListener('spatial:beforefocus', beforeFocus)
  })

  it('empty data-nav values are ignored (fall through to geometry)', () => {
    const engine = makeEngine(`<button id="a" data-nav-right=""></button><button id="b"></button>`, {
      a: [0, 0, 80, 80],
      b: [100, 0, 80, 80],
    })
    engine.focus(document.getElementById('a')!)
    expect(engine.navigate('right')).toBe(true)
    expect(engine.getFocused()?.id).toBe('b')
  })

  it('container tokens are case-insensitive and order-independent', () => {
    const engine = makeEngine(
      `<div data-spatial-container="  WRAP   Contain ">
         <button id="r1"></button><button id="r2"></button>
       </div>
       <button id="outside"></button>`,
      { r1: [0, 0, 80, 80], r2: [100, 0, 80, 80], outside: [300, 0, 80, 80] },
    )
    engine.focus(document.getElementById('r2')!)
    // wrap applies…
    expect(engine.navigate('right')).toBe(true)
    expect(engine.getFocused()?.id).toBe('r1')
    // …and contain applies (no escape downward to outside via escalation).
    expect(engine.navigate('down')).toBe(false)
  })
})

describe('focus request validation', () => {
  it('rejects a target outside a scoped root', () => {
    document.body.innerHTML = `
      <div id="region"><button id="inside"></button></div>
      <button id="outside"></button>`
    const engine = new SpatialEngine({
      root: document.getElementById('region')!,
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    const inside = document.getElementById('inside')!
    const outside = document.getElementById('outside')!
    engine.focus(inside)

    expect(engine.focus(outside)).toBe(false)
    expect(document.activeElement).toBe(inside)
    expect(outside.classList.contains('spatial-focused')).toBe(false)
  })

  it('returns false for a malformed selector instead of throwing', () => {
    const engine = makeEngine(`<button id="a"></button>`, { a: [0, 0, 80, 80] })
    expect(() => engine.focus('##invalid(')).not.toThrow()
    expect(engine.focus('##invalid(')).toBe(false)
  })

  it('rejects an invalid configured focusable selector at construction', () => {
    expect(
      () =>
        new SpatialEngine({
          focusableSelector: '##invalid(',
          visibilityFilter: () => true,
          scrollBehavior: false,
        }),
    ).toThrow(/focusableSelector must be a valid CSS selector/)
  })

  it('rejects invalid engine scoring values at construction', () => {
    expect(
      () => new SpatialEngine({ scoring: { centerWeight: Number.NaN }, scrollBehavior: false }),
    ).toThrow(/centerWeight must be a finite non-negative number/)
    expect(
      () => new SpatialEngine({ scoring: { alignedOverlapRatio: 1.1 }, scrollBehavior: false }),
    ).toThrow(/alignedOverlapRatio must be between 0 and 1/)
  })

  it('rejects a disabled native control without claiming focus moved', () => {
    const engine = makeEngine(`<button id="a"></button><button id="disabled" disabled></button>`, {
      a: [0, 0, 80, 80],
      disabled: [100, 0, 80, 80],
    })
    const a = document.getElementById('a')!
    const disabled = document.getElementById('disabled')!
    engine.focus(a)
    const afterFocus = vi.fn()
    disabled.addEventListener('spatial:focus', afterFocus)

    expect(engine.focus(disabled)).toBe(false)
    expect(document.activeElement).toBe(a)
    expect(afterFocus).not.toHaveBeenCalled()
    expect(disabled.classList.contains('spatial-focused')).toBe(false)
  })

  it('relinquishes a focused control that becomes disabled', () => {
    const engine = makeEngine(`<button id="a"></button>`, { a: [0, 0, 80, 80] })
    const a = document.getElementById('a') as HTMLButtonElement
    engine.focus(a)
    a.disabled = true

    expect(engine.getFocused()).toBeNull()
    expect(engine.activate()).toBe(false)
    expect(a.classList.contains('spatial-focused')).toBe(false)
  })

  it('undoes an engine-added tabindex when the browser refuses focus', () => {
    const engine = makeEngine(`<div id="card" data-focusable></div>`, { card: [0, 0, 80, 80] })
    const card = document.getElementById('card')!
    card.focus = vi.fn()

    expect(engine.focus(card)).toBe(false)
    expect(card.hasAttribute('tabindex')).toBe(false)

    document.body.insertAdjacentHTML(
      'beforeend',
      `<div id="composite" data-focusable></div><button id="actual"></button>`,
    )
    const composite = document.getElementById('composite')!
    const actual = document.getElementById('actual')!
    const focused = vi.fn()
    composite.focus = () => actual.focus()
    actual.addEventListener('spatial:focus', focused)

    expect(engine.focus(composite)).toBe(true)
    expect(document.activeElement).toBe(actual)
    expect(engine.getFocused()).toBe(actual)
    expect(composite.hasAttribute('tabindex')).toBe(false)
    expect(focused).toHaveBeenCalledOnce()
  })

  it('does not emit spatial:focus when beforefocus removes the target', () => {
    const engine = makeEngine(`<button id="a"></button><button id="doomed"></button>`, {
      a: [0, 0, 80, 80],
      doomed: [100, 0, 80, 80],
    })
    const a = document.getElementById('a')!
    const doomed = document.getElementById('doomed')!
    engine.focus(a)
    const afterFocus = vi.fn()
    doomed.addEventListener('spatial:beforefocus', () => doomed.remove(), { once: true })
    doomed.addEventListener('spatial:focus', afterFocus)

    expect(engine.focus(doomed)).toBe(false)
    expect(document.activeElement).toBe(a)
    expect(afterFocus).not.toHaveBeenCalled()
    expect(doomed.classList.contains('spatial-focused')).toBe(false)
  })

  it('treats focusing the already-focused element as a no-op', () => {
    const engine = makeEngine(`<button id="a"></button>`, { a: [0, 0, 80, 80] })
    const a = document.getElementById('a')!
    expect(engine.focus(a)).toBe(true)
    expect(engine.focus(a)).toBe(false)
    expect(document.activeElement).toBe(a)
    expect(engine.getFocused()).toBe(a)
  })
})

describe('structural oddities', () => {
  it('an element that is both focusable and a container is a stop AND a zone', () => {
    // The card itself is clickable; it also contains focusable children.
    const engine = makeEngine(
      `<button id="left"></button>
       <div id="card" data-focusable data-spatial-container>
         <button id="inner1"></button>
         <button id="inner2"></button>
       </div>`,
      {
        left: [0, 0, 80, 80],
        card: [200, 0, 300, 80],
        inner1: [220, 10, 80, 60],
        inner2: [320, 10, 80, 60],
      },
    )
    engine.focus(document.getElementById('left')!)
    expect(() => engine.navigate('right')).not.toThrow()
    // Either candidacy is defensible; what's pinned: it resolves to a real
    // focusable (card or its entry child) without crashing or livelocking.
    const landed = engine.getFocused()?.id
    expect(['card', 'inner1']).toContain(landed)
  })

  it('survives pathologically deep nesting', { timeout: 20_000 }, () => {
    // Isolate the iterative ancestor walk from jsdom's superlinear computed-
    // style implementation: stylesheet behavior has dedicated tests, while
    // this case verifies that 1,000 ancestors do not grow the JS call stack.
    const emptyStyle = document.createElement('div').style
    const styleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue(emptyStyle)
    try {
      document.body.innerHTML = '<button id="a"></button>'
      let parent: HTMLElement = document.body
      for (let i = 0; i < 1_000; i++) {
        const div = document.createElement('div')
        parent.appendChild(div)
        parent = div
      }
      const deep = document.createElement('button')
      deep.id = 'deep'
      parent.appendChild(deep)
      const engine = new SpatialEngine({
        getRect: rectProvider({ a: [0, 0, 80, 80], deep: [200, 0, 80, 80] }),
        visibilityFilter: () => true,
        scrollBehavior: false,
      })
      engine.focus(document.getElementById('a')!)
      expect(() => engine.navigate('right')).not.toThrow()
      expect(engine.getFocused()?.id).toBe('deep')
    } finally {
      styleSpy.mockRestore()
    }
  })

  it('navigates from a zero-size origin', () => {
    const engine = makeEngine(`<button id="collapsed"></button><button id="b"></button>`, {
      collapsed: [100, 100, 0, 0],
      b: [200, 100, 80, 80],
    })
    engine.focus(document.getElementById('collapsed')!)
    expect(engine.navigate('right')).toBe(true)
    expect(engine.getFocused()?.id).toBe('b')
  })

  it('handles negative coordinates (content scrolled above the viewport)', () => {
    const engine = makeEngine(`<button id="above"></button><button id="mid"></button>`, {
      above: [0, -500, 80, 80],
      mid: [0, 100, 80, 80],
    })
    engine.focus(document.getElementById('mid')!)
    expect(engine.navigate('up')).toBe(true)
    expect(engine.getFocused()?.id).toBe('above')
  })

  it('exact geometric ties resolve to DOM order, deterministically', () => {
    const engine = makeEngine(
      `<button id="a"></button><button id="tie1"></button><button id="tie2"></button>`,
      // tie1 and tie2 occupy the identical rect.
      { a: [0, 0, 80, 80], tie1: [200, 0, 80, 80], tie2: [200, 0, 80, 80] },
    )
    for (let i = 0; i < 3; i++) {
      engine.focus(document.getElementById('a')!)
      engine.navigate('right')
      expect(engine.getFocused()?.id).toBe('tie1')
    }
  })

  it('a memory element reparented out of its container is not restored', () => {
    const engine = makeEngine(
      `<button id="s"></button>
       <div id="zone" data-spatial-container="remember">
         <button id="z1"></button><button id="z2"></button>
       </div>
       <div id="elsewhere"></div>`,
      { s: [0, 0, 80, 80], z1: [200, 0, 80, 80], z2: [200, 100, 80, 80] },
    )
    engine.focus(document.getElementById('z2')!)
    engine.focus(document.getElementById('s')!)
    // z2 moves out of the zone but stays connected.
    document.getElementById('elsewhere')!.appendChild(document.getElementById('z2')!)
    engine.navigate('right')
    expect(engine.getFocused()?.id).toBe('z1')
  })

  it('a beforefocus listener that removes the target does not crash navigation', () => {
    const engine = makeEngine(
      `<button id="a"></button><button id="doomed"></button><button id="c"></button>`,
      { a: [0, 0, 80, 80], doomed: [100, 0, 80, 80], c: [300, 0, 80, 80] },
    )
    engine.focus(document.getElementById('a')!)
    document.getElementById('doomed')!.addEventListener('spatial:beforefocus', (e) => {
      ;(e.target as HTMLElement).remove()
    })
    expect(() => engine.navigate('right')).not.toThrow()
    // Wherever focus ends up, the engine must remain coherent for the next move.
    expect(() => engine.navigate('right')).not.toThrow()
  })

  it('completely empty root: every operation degrades to false, none throw', () => {
    const engine = makeEngine(`<div></div>`, {})
    expect(engine.navigate('down')).toBe(false)
    expect(engine.focusFirst()).toBe(false)
    expect(engine.activate()).toBe(false)
    expect(engine.back()).toBe(false)
    expect(engine.getFocused()).toBe(null)
  })

  it('detached root element: operations are inert, not explosive', () => {
    const detached = document.createElement('div')
    detached.innerHTML = `<button id="x"></button>`
    const engine = new SpatialEngine({
      root: detached,
      getRect: () => rect(0, 0, 80, 80),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    expect(() => engine.navigate('down')).not.toThrow()
    expect(engine.getFocused()).toBe(null)
  })

  it('SVG focusables do not break candidate collection', () => {
    document.body.innerHTML = `
      <button id="a"></button>
      <svg viewBox="0 0 100 100"><a href="#somewhere" id="svg-link"><text>link</text></a></svg>
      <button id="b"></button>`
    const engine = new SpatialEngine({
      getRect: rectProvider({ a: [0, 0, 80, 80], b: [100, 0, 80, 80] }),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    engine.focus(document.getElementById('a')!)
    expect(() => engine.navigate('right')).not.toThrow()
    expect(engine.getFocused()?.id).toBe('b') // svg link has a zero rect → skipped
  })
})

describe('native modal dialogs', () => {
  it('visibility checks tolerate environments without :modal support', () => {
    // jsdom has neither showModal() nor the :modal selector — the modal
    // check must degrade silently (real behavior is pinned in the browser
    // conformance page, demo/css-conformance.html).
    document.body.innerHTML = `<dialog open><button id="in"></button></dialog><button id="out"></button>`
    expect(() => isElementVisible(document.getElementById('out')!)).not.toThrow()
    expect(() => isElementVisible(document.getElementById('in')!)).not.toThrow()
  })

  it('the explicit-contain pattern keeps working regardless (defense in depth)', () => {
    const engine = makeEngine(
      `<dialog open data-spatial-container="contain">
         <button id="in1"></button><button id="in2"></button>
       </dialog>
       <button id="bg"></button>`,
      { in1: [0, 0, 80, 80], in2: [100, 0, 80, 80], bg: [300, 0, 80, 80] },
    )
    engine.focus(document.getElementById('in2')!)
    expect(engine.navigate('right')).toBe(false)
  })
})

describe('visibility semantics (jsdom-safe branches)', () => {
  it.each([
    'hidden',
    'inert',
    'aria-hidden="true"',
  ])('excludes elements under [%s] ancestors', (attr) => {
    document.body.innerHTML = `<div ${attr}><button id="x"></button></div>`
    expect(isElementVisible(document.getElementById('x')!)).toBe(false)
  })

  it('asks checkVisibility for CSS visibility under both option spellings', () => {
    // Regression: only the post-Chromium-121 `visibilityProperty` spelling was
    // passed. Engines in the ~105-120 band (including the Chromium builds on
    // current Tizen/webOS TVs) understand only `checkVisibilityCSS` and drop
    // unknown dictionary members silently, degrading the call to a
    // rendered-box check that let `visibility: hidden` elements take focus.
    document.body.innerHTML = '<button id="x"></button>'
    const button = document.getElementById('x')!
    let received: Record<string, unknown> | undefined

    Object.defineProperty(button, 'checkVisibility', {
      configurable: true,
      value: (options: Record<string, unknown>) => {
        received = options
        // Stand in for an older engine: honor only the legacy option.
        return options.checkVisibilityCSS !== true
      },
    })

    expect(isElementVisible(button)).toBe(false)
    expect(received).toMatchObject({ checkVisibilityCSS: true, visibilityProperty: true })
  })
})

describe('multi-document (iframe)', () => {
  it('an engine scoped to an iframe document navigates that document', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const idoc = iframe.contentDocument!
    idoc.body.innerHTML = `<button id="ia"></button><button id="ib"></button>`
    const engine = new SpatialEngine({
      root: idoc,
      getRect: (el) => (el.id === 'ia' ? rect(0, 0, 80, 80) : rect(100, 0, 80, 80)),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    engine.focus(idoc.getElementById('ia')!)
    expect(engine.navigate('right')).toBe(true)
    expect(engine.getFocused()?.id).toBe('ib')
    expect(idoc.activeElement?.id).toBe('ib')
    iframe.remove()
  })

  it('the composed API infers the iframe window and dispatches events in its realm', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const idoc = iframe.contentDocument!
    const iwin = iframe.contentWindow!
    const IframeCustomEvent = (iwin as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent
    idoc.body.innerHTML = `<button id="ia"></button><button id="ib"></button>`
    let context: AdapterContext | null = null
    const adapter: InputAdapter = {
      id: 'capture',
      start(next) {
        context = next
      },
      stop() {},
    }
    const nav = createSpatialNavigation({
      root: idoc,
      adapters: [adapter],
      getRect: (el) => (el.id === 'ia' ? rect(0, 0, 80, 80) : rect(100, 0, 80, 80)),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    let focusEvent: Event | null = null
    idoc.getElementById('ia')!.addEventListener('spatial:focus', (event) => {
      focusEvent = event
    })

    try {
      nav.start()
      expect(context).not.toBeNull()
      expect(context!.window).toBe(iwin)
      expect(() =>
        context!.dispatch({ type: 'direction', direction: 'right', repeat: false, source: 'capture' }),
      ).not.toThrow()
      expect(idoc.activeElement?.id).toBe('ia')
      expect(focusEvent).toBeInstanceOf(IframeCustomEvent)
    } finally {
      nav.destroy()
      iframe.remove()
    }
  })
})

describe('shadow DOM', () => {
  it('an engine rooted inside an open shadow root navigates and tracks focus', () => {
    document.body.innerHTML = `<div id="host"></div>`
    const shadow = document.getElementById('host')!.attachShadow({ mode: 'open' })
    const wrap = document.createElement('div')
    wrap.setAttribute('data-spatial-container', 'wrap remember')
    wrap.innerHTML = `<button id="sa"></button><button id="sb"></button>`
    shadow.appendChild(wrap)

    const engine = new SpatialEngine({
      root: wrap,
      getRect: (el) => (el.id === 'sa' ? rect(0, 0, 80, 80) : rect(100, 0, 80, 80)),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    engine.focus(wrap.querySelector<HTMLElement>('#sa')!)
    // document.activeElement reports the host; the engine must resolve
    // through shadowRoot.activeElement to keep tracking focus.
    expect(engine.getFocused()?.id).toBe('sa')
    expect(engine.navigate('right')).toBe(true)
    expect(engine.getFocused()?.id).toBe('sb')
    expect(engine.navigate('right')).toBe(true)
    expect(engine.getFocused()?.id).toBe('sa')

    const sb = wrap.querySelector<HTMLElement>('#sb')!
    sb.focus()
    expect(engine.getFocused()?.id).toBe('sb')
    sb.blur()
    expect(engine.focusFirst()).toBe(true)
    expect(engine.getFocused()?.id).toBe('sb')
  })
})

describe('form-control quirks', () => {
  it('buttons inside a disabled fieldset are not stops', () => {
    const engine = makeEngine(
      `<button id="a"></button>
       <fieldset disabled><button id="dead"></button></fieldset>
       <button id="c"></button>`,
      { a: [0, 0, 80, 80], dead: [100, 0, 80, 80], c: [200, 0, 80, 80] },
    )
    engine.focus(document.getElementById('a')!)
    engine.navigate('right')
    expect(engine.getFocused()?.id).toBe('c')
  })

  it('positive tabindex values are ordinary stops (spatial order, not tab order)', () => {
    const engine = makeEngine(`<div id="a" tabindex="3"></div><div id="b" tabindex="1"></div>`, {
      a: [0, 0, 80, 80],
      b: [100, 0, 80, 80],
    })
    engine.focus(document.getElementById('a')!)
    engine.navigate('right')
    // Geometry wins; tabindex magnitude is irrelevant to spatial movement.
    expect(engine.getFocused()?.id).toBe('b')
  })
})

describe('writing direction', () => {
  it('directions stay physical under dir="rtl" (matches d-pads and arrows)', () => {
    document.body.innerHTML = ''
    document.documentElement.setAttribute('dir', 'rtl')
    const engine = makeEngine(
      `<button id="first"></button><button id="second"></button>`,
      // "first" is visually on the right, as RTL layout would place it.
      { first: [200, 0, 80, 80], second: [0, 0, 80, 80] },
    )
    engine.focus(document.getElementById('first')!)
    // Pressing left moves visually left regardless of writing direction.
    expect(engine.navigate('left')).toBe(true)
    expect(engine.getFocused()?.id).toBe('second')
    document.documentElement.removeAttribute('dir')
  })
})

describe('engine option contracts', () => {
  it('a custom focusableSelector fully replaces the default', () => {
    const engine = new SpatialEngine({
      focusableSelector: '.tile',
      getRect: rectProvider({ t1: [0, 0, 80, 80], t2: [100, 0, 80, 80], btn: [50, 0, 10, 10] }),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    document.body.innerHTML = `<div class="tile" id="t1"></div><button id="btn"></button><div class="tile" id="t2"></div>`
    engine.focus(document.getElementById('t1')!)
    engine.navigate('right')
    expect(engine.getFocused()?.id).toBe('t2') // the button is invisible to this engine
  })

  it('a custom focusClass is applied and moved', () => {
    document.body.innerHTML = `<button id="a"></button><button id="b"></button>`
    expect(() => new SpatialEngine({ focusClass: '' })).toThrow(/one non-empty DOM class token/)
    expect(() => new SpatialEngine({ focusClass: 'two tokens' })).toThrow(
      /one non-empty DOM class token/,
    )
    expect(() => new SpatialEngine({ scrollBehavior: 'later' as ScrollBehavior })).toThrow(
      /scrollBehavior/,
    )
    const engine = new SpatialEngine({
      focusClass: 'my-ring',
      getRect: rectProvider({ a: [0, 0, 80, 80], b: [100, 0, 80, 80] }),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    engine.focus(document.getElementById('a')!)
    expect(document.getElementById('a')!.classList.contains('my-ring')).toBe(true)
    engine.navigate('right')
    expect(document.getElementById('a')!.classList.contains('my-ring')).toBe(false)
    expect(document.getElementById('b')!.classList.contains('my-ring')).toBe(true)
  })

  it('scrollBehavior false never calls scrollIntoView; smooth passes options through', () => {
    document.body.innerHTML = `<button id="a"></button>`
    const a = document.getElementById('a')!
    const spy = vi.fn()
    ;(a as HTMLElement & { scrollIntoView: typeof spy }).scrollIntoView = spy

    const silent = new SpatialEngine({
      getRect: () => rect(0, 0, 80, 80),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    silent.focus(a)
    expect(spy).not.toHaveBeenCalled()
    a.blur()

    const smooth = new SpatialEngine({
      getRect: () => rect(0, 0, 80, 80),
      visibilityFilter: () => true,
      scrollBehavior: 'smooth',
    })
    smooth.focus(a)
    expect(spy).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  })

  it('uses instant scrolling for opt-in smooth behavior under reduced motion', () => {
    document.body.innerHTML = `<button id="a"></button>`
    const a = document.getElementById('a')!
    const scrollIntoView = vi.fn()
    ;(a as HTMLElement & { scrollIntoView: typeof scrollIntoView }).scrollIntoView = scrollIntoView

    const descriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia')
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    })

    try {
      const engine = new SpatialEngine({
        getRect: () => rect(0, 0, 80, 80),
        visibilityFilter: () => true,
        scrollBehavior: 'smooth',
      })
      engine.focus(a)
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'instant',
      })
    } finally {
      if (descriptor) Object.defineProperty(window, 'matchMedia', descriptor)
      else Reflect.deleteProperty(window, 'matchMedia')
    }
  })
})

describe('traps and combinations', () => {
  it('programmatic focus may enter a contain container (roach motel, not wall)', () => {
    const engine = makeEngine(
      `<button id="outside"></button>
       <div data-spatial-container="contain"><button id="in"></button></div>`,
      { outside: [0, 0, 80, 80], in: [200, 0, 80, 80] },
    )
    engine.focus(document.getElementById('outside')!)
    expect(engine.focus(document.getElementById('in')!)).toBe(true)
    expect(engine.navigate('left')).toBe(false) // …but cannot leave geometrically
  })
})
