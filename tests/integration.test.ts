import { afterEach, describe, expect, it } from 'vitest'
import {
  createSpatialNavigation,
  InputManager,
  keyboardAdapter,
  type AdapterContext,
  type InputAdapter,
  type NavIntent,
  type SpatialNavigation,
} from '../src/index'
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

const press = (key: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...init }))

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

    let cancellations = 0
    document.getElementById('a')!.addEventListener('spatial:activatecancel', () => cancellations++)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }))
    expect(cancellations).toBe(1)
  })

  it('pairs activate release with the original press target when focus moves', () => {
    const n = setup(`<button id="a"></button><button id="b"></button>`, {
      a: [0, 0, 80, 80],
      b: [100, 0, 80, 80],
    })
    const a = document.getElementById('a')!
    const b = document.getElementById('b')!
    const releases: string[] = []
    a.addEventListener('spatial:activaterelease', () => releases.push('a'))
    b.addEventListener('spatial:activaterelease', () => releases.push('b'))

    n.focus(a)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    b.focus()
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }))

    expect(releases).toEqual(['a'])
  })

  it('keeps concurrent activate sessions from one adapter independent', () => {
    const n = setup(`<button id="a"></button><button id="b"></button>`, {
      a: [0, 0, 80, 80],
      b: [100, 0, 80, 80],
    })
    let dispatch: AdapterContext['dispatch'] = () => false
    const adapter: InputAdapter = {
      id: 'multi',
      start: (context) => {
        dispatch = context.dispatch
      },
      stop() {},
    }
    n.addAdapter(adapter)

    const a = document.getElementById('a')!
    const b = document.getElementById('b')!
    const releases: string[] = []
    const cancellations: string[] = []
    a.addEventListener('spatial:activaterelease', () => releases.push('a'))
    b.addEventListener('spatial:activaterelease', () => releases.push('b'))
    a.addEventListener('spatial:activatecancel', () => cancellations.push('a'))
    b.addEventListener('spatial:activatecancel', () => cancellations.push('b'))

    n.focus(a)
    dispatch({ type: 'activate', source: 'multi', activationId: 'first' })
    n.focus(b)
    dispatch({ type: 'activate', source: 'multi', activationId: 'second' })
    dispatch({ type: 'release', source: 'multi', activationId: 'first', durationMs: 10 })
    dispatch({ type: 'release', source: 'multi', activationId: 'second', durationMs: 20 })

    expect(releases).toEqual(['a', 'b'])

    n.focus(a)
    dispatch({ type: 'activate', source: 'multi', activationId: 'cancelled' })
    expect(dispatch({ type: 'activationcancel', source: 'multi', activationId: 'cancelled' })).toBe(true)
    expect(
      dispatch({ type: 'release', source: 'multi', activationId: 'cancelled', durationMs: 30 }),
    ).toBe(false)
    expect(releases).toEqual(['a', 'b'])
    expect(cancellations).toEqual(['a'])
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

    let reentrantStops = 0
    const reentrant: InputAdapter = {
      id: 'reentrant',
      start: () => n.stop(),
      stop: () => reentrantStops++,
    }
    n.addAdapter(reentrant)
    expect(reentrantStops).toBe(1)
    n.removeAdapter(reentrant)
    n.start()
    press('ArrowLeft')
    expect(document.activeElement?.id).toBe('a')

    n.stop()
    let childStarts = 0
    const child: InputAdapter = {
      id: 'child',
      start: () => childStarts++,
      stop() {},
    }
    const parent: InputAdapter = {
      id: 'parent',
      start: () => n.addAdapter(child),
      stop() {},
    }
    n.addAdapter(parent)
    n.start()
    expect(childStarts).toBe(1)
    n.removeAdapter(parent)
    n.removeAdapter(child)

    let failedStops = 0
    const failing: InputAdapter = {
      id: 'failing',
      start: () => {
        throw new Error('adapter failed')
      },
      stop: () => failedStops++,
    }
    expect(() => n.addAdapter(failing)).toThrow(/adapter failed/)
    expect(failedStops).toBe(1)
    n.removeAdapter(failing)
    expect(failedStops).toBe(1) // failed additions are rolled back

    const events: string[] = []
    let restartOnce = true
    const manager = new InputManager(() => false, window)
    const lateAdapter: InputAdapter = {
      id: 'late-restart',
      start: () => events.push('late:start'),
      stop: () => events.push('late:stop'),
    }
    const restartAdapter: InputAdapter = {
      id: 'restart',
      start: () => events.push('restart:start'),
      stop: () => {
        events.push('restart:stop')
        if (restartOnce) {
          restartOnce = false
          manager.start()
          manager.add(lateAdapter)
        }
      },
    }
    const siblingAdapter: InputAdapter = {
      id: 'sibling',
      start: () => events.push('sibling:start'),
      stop: () => events.push('sibling:stop'),
    }
    manager.add(restartAdapter)
    manager.add(siblingAdapter)
    manager.start()
    events.length = 0
    manager.stop()
    expect(events).toEqual([
      'restart:stop',
      'sibling:stop',
      'restart:start',
      'sibling:start',
      'late:start',
    ])
    manager.remove(lateAdapter)
    manager.stop()
    expect(events.slice(-3)).toEqual(['late:stop', 'restart:stop', 'sibling:stop'])
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

describe('held-direction repeat reaches the application', () => {
  it('marks repeated moves so an app can accelerate its own scrolling', () => {
    // Accelerated list scrolling — hold down to speed up, then jump by
    // section — has to tell a held repeat from a discrete press, and only
    // the adapter tracks that. It used to be dropped at the engine boundary.
    const n = setup('<button id="a"></button><button id="b"></button><button id="c"></button>', {
      a: [0, 0, 80, 40],
      b: [0, 50, 80, 40],
      c: [0, 100, 80, 40],
    })
    const seen: Array<boolean | undefined> = []
    document.addEventListener('spatial:focus', (event) => {
      seen.push((event as CustomEvent<{ repeat?: boolean }>).detail.repeat)
    })

    n.focus('#a')
    seen.length = 0
    press('ArrowDown') // discrete
    press('ArrowDown', { repeat: true }) // held
    expect(seen).toEqual([false, true])

    // Programmatic moves are discrete unless the caller says otherwise.
    n.focus('#a')
    seen.length = 0
    n.navigate('down')
    n.navigate('down', true)
    expect(seen).toEqual([false, true])
  })

  it('carries repeat on the edge event too, so edge handling can throttle', () => {
    const n = setup('<button id="a"></button>', { a: [0, 0, 80, 40] })
    const edges: Array<boolean | undefined> = []
    document.addEventListener('spatial:nofocustarget', (event) => {
      edges.push((event as CustomEvent<{ repeat?: boolean }>).detail.repeat)
    })
    n.focus('#a')
    press('ArrowDown', { repeat: true })
    expect(edges).toEqual([true])
  })
})

describe('claimFocus', () => {
  const LAYOUT: LayoutMap = { a: [0, 0, 80, 80], b: [100, 0, 80, 80] }

  it('focuses a target while focus is still unclaimed', () => {
    const n = setup('<button id="a"></button><button id="b"></button>', LAYOUT)
    expect(n.claimFocus('#b')).toBe(true)
    expect(n.getFocused()?.id).toBe('b')
  })

  it('falls back to the first focusable when no target is given', () => {
    const n = setup('<button id="a"></button><button id="b"></button>', LAYOUT)
    expect(n.claimFocus()).toBe(true)
    expect(n.getFocused()?.id).toBe('a')
  })

  it('does nothing once something already holds focus', () => {
    // The async-content case: content arrives after the user has already
    // started navigating, and must not yank focus away from them.
    const n = setup('<button id="a"></button><button id="b"></button>', LAYOUT)
    n.focus('#a')
    expect(n.claimFocus('#b')).toBe(false)
    expect(n.getFocused()?.id).toBe('a')
  })

  it('does not claim focus owned by another region on the page', () => {
    document.body.innerHTML =
      '<div id="scope"><button id="a"></button></div><button id="outside"></button>'
    const scope = document.getElementById('scope') as HTMLElement
    nav = createSpatialNavigation({
      root: scope,
      adapters: [],
      getRect: rectProvider({ a: [0, 0, 80, 80], outside: [200, 0, 80, 80] }),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    nav.start()
    document.getElementById('outside')!.focus()
    expect(nav.claimFocus()).toBe(false)
    expect(document.activeElement?.id).toBe('outside')
  })

  it('reports source "claim" so apps can tell it from user movement', () => {
    const n = setup('<button id="a"></button><button id="b"></button>', LAYOUT)
    const sources: string[] = []
    document.addEventListener('spatial:focus', (event) => {
      sources.push((event as CustomEvent<{ source: string }>).detail.source)
    })
    n.claimFocus('#b')
    expect(sources).toEqual(['claim'])
  })

  it('is a no-op on the server-rendering facade', () => {
    // Same shape as the other facade methods: safe to call, never throws.
    expect(typeof createSpatialNavigation({ adapters: [] }).claimFocus).toBe('function')
  })
})

describe('multi-adapter start() rollback', () => {
  it('InputManager.start() rolls back started adapters in reverse order and stays restartable', () => {
    const events: string[] = []
    const intents: NavIntent[] = []
    const manager = new InputManager((intent) => {
      intents.push(intent)
      return true
    }, window)

    let savedContext: AdapterContext | null = null
    const recording = (id: string): InputAdapter => ({
      id,
      start: (context) => {
        savedContext = context
        events.push(`${id}:start`)
      },
      stop: () => events.push(`${id}:stop`),
    })
    const first = recording('first')
    const second = recording('second')
    let failing = true
    const flaky: InputAdapter = {
      id: 'flaky',
      start: () => {
        events.push('flaky:start')
        if (failing) throw new Error('flaky adapter failed')
      },
      stop: () => events.push('flaky:stop'),
    }
    manager.add(first)
    manager.add(second)
    manager.add(flaky)

    expect(() => manager.start()).toThrow(/flaky adapter failed/)
    // Everything started before the failure is unwound newest-first, with a
    // best-effort stop for the failing adapter itself.
    expect(events).toEqual([
      'first:start',
      'second:start',
      'flaky:start',
      'flaky:stop',
      'second:stop',
      'first:stop',
    ])
    expect(intents).toEqual([])

    // The failed start left nothing active: stop() has no adapters to unwind.
    events.length = 0
    manager.stop()
    expect(events).toEqual([])

    // Once the offender is fixed the same manager starts cleanly...
    failing = false
    manager.start()
    expect(events).toEqual(['first:start', 'second:start', 'flaky:start'])
    // ...and adapters are live again: intents flow through the saved context.
    const intent: NavIntent = { type: 'direction', direction: 'right', repeat: false, source: 'second' }
    expect(savedContext!.dispatch(intent)).toBe(true)
    expect(intents).toEqual([intent])
    manager.destroy()
  })

  it('createSpatialNavigation start() failure stops the engine and stays restartable', () => {
    document.body.innerHTML = `<button id="a"></button><button id="b"></button>`
    const flaky: InputAdapter = {
      id: 'flaky',
      start: () => {
        throw new Error('flaky adapter failed')
      },
      stop() {},
    }
    nav = createSpatialNavigation({
      root: document,
      adapters: [keyboardAdapter(), flaky],
      getRect: rectProvider({ a: [0, 0, 80, 80], b: [100, 0, 80, 80] }),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    expect(() => nav!.start()).toThrow(/flaky adapter failed/)

    // The engine was rolled back too: DOM focus is no longer tracked (no
    // focus class is adopted on focusin) and keyboard input is detached.
    const a = document.getElementById('a')!
    a.focus()
    expect(a.classList.contains('spatial-focused')).toBe(false)
    press('ArrowRight')
    expect(document.activeElement?.id).toBe('a')

    // Removing the offender lets the same instance start cleanly.
    nav.removeAdapter(flaky)
    nav.start()
    nav.focus('#a')
    press('ArrowRight')
    expect(document.activeElement?.id).toBe('b')
  })
})
