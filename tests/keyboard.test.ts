import { afterEach, describe, expect, it } from 'vitest'
import { keyboardAdapter } from '../src/input/keyboard'
import type { AdapterContext, NavIntent } from '../src/input/types'

function makeContext(consume = true): { ctx: AdapterContext; intents: NavIntent[] } {
  const intents: NavIntent[] = []
  const ctx: AdapterContext = {
    window,
    dispatch(intent) {
      intents.push(intent)
      return consume
    },
  }
  return { ctx, intents }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('keyboardAdapter', () => {
  it('maps arrow keys to direction intents and consumes the event', () => {
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext()
    adapter.start(ctx)

    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true })
    window.dispatchEvent(event)
    expect(intents).toEqual([
      { type: 'direction', direction: 'right', repeat: false, source: 'keyboard', originalEvent: event },
    ])
    expect(event.defaultPrevented).toBe(true)
    adapter.stop()
  })

  it('maps Enter and Escape to activate and back', () => {
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext()
    adapter.start(ctx)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    expect(intents.map((i) => i.type)).toEqual(['activate', 'back'])
    adapter.stop()
  })

  it('a held Enter fires activate once, not per key repeat', () => {
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext()
    adapter.start(ctx)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    const repeat1 = new KeyboardEvent('keydown', { key: 'Enter', repeat: true, cancelable: true })
    const repeat2 = new KeyboardEvent('keydown', { key: 'Enter', repeat: true, cancelable: true })
    const unflaggedFlood = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    window.dispatchEvent(repeat1)
    window.dispatchEvent(repeat2)
    window.dispatchEvent(unflaggedFlood)
    expect(intents.filter((i) => i.type === 'activate')).toHaveLength(1)
    // Repeats are still consumed so the browser's own repeated default
    // (e.g. repeated clicks on a focused button) is suppressed.
    expect(repeat1.defaultPrevented).toBe(true)
    expect(repeat2.defaultPrevented).toBe(true)
    expect(unflaggedFlood.defaultPrevented).toBe(true)
    adapter.stop()
  })

  it('reports hold duration on Enter release (long-press UX)', () => {
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext()
    adapter.start(ctx)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }))
    const release = intents.find((i) => i.type === 'release')
    const activate = intents.find((i) => i.type === 'activate')
    expect(release).toBeDefined()
    expect(release!.type === 'release' && release!.durationMs).toBeGreaterThanOrEqual(0)
    expect(
      activate?.type === 'activate' &&
        release?.type === 'release' &&
        release.activationId === activate.activationId,
    ).toBe(true)

    // Pair by physical code even if modifier/layout state changes `key`
    // between keydown and keyup.
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', code: 'NumpadEnter', cancelable: true }),
    )
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Unidentified', code: 'NumpadEnter' }))
    expect(intents.filter((i) => i.type === 'release')).toHaveLength(2)

    // A keyup without a dispatched press (e.g. press consumed elsewhere)
    // produces no release.
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }))
    expect(intents.filter((i) => i.type === 'release')).toHaveLength(2)
    adapter.stop()
  })

  it('throttleMs gates direction floods; keyup resets so fresh presses are instant', () => {
    const adapter = keyboardAdapter({ throttleMs: 10_000 }) // huge gate for determinism
    const { ctx, intents } = makeContext()
    adapter.start(ctx)

    const first = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true })
    const flood1 = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true })
    const flood2 = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true })
    window.dispatchEvent(first)
    window.dispatchEvent(flood1)
    window.dispatchEvent(flood2)
    expect(intents.filter((i) => i.type === 'direction')).toHaveLength(1)
    // Dropped events are still consumed — no page scroll leaks.
    expect(flood1.defaultPrevented).toBe(true)
    expect(flood2.defaultPrevented).toBe(true)

    // Release the key: the gate resets, the next press is immediate.
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }))
    expect(intents.filter((i) => i.type === 'direction')).toHaveLength(2)
    adapter.stop()
  })

  it('maps TV remote keyCodes (webOS back = 461)', () => {
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext()
    adapter.start(ctx)

    window.dispatchEvent(
      new KeyboardEvent('keydown', { keyCode: 461, cancelable: true } as KeyboardEventInit),
    )
    expect(intents.map((i) => i.type)).toEqual(['back'])
    adapter.stop()
  })

  it('maps BrowserBack and legacy keyCode 8 to back outside editable controls', () => {
    document.body.innerHTML = `<input id="field" type="text">`
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext()
    adapter.start(ctx)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'BrowserBack', cancelable: true }))
    window.dispatchEvent(
      new KeyboardEvent('keydown', { keyCode: 8, cancelable: true } as KeyboardEventInit),
    )
    expect(intents.map((intent) => intent.type)).toEqual(['back', 'back'])

    document.getElementById('field')!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Backspace',
        keyCode: 8,
        bubbles: true,
        cancelable: true,
      } as KeyboardEventInit),
    )
    expect(intents.map((intent) => intent.type)).toEqual(['back', 'back'])
    adapter.stop()
  })

  it.each([
    ['Alt', { altKey: true }],
    ['Control', { ctrlKey: true }],
    ['Meta', { metaKey: true }],
    ['Shift', { shiftKey: true }],
  ] as const)('leaves %s+Arrow shortcuts alone', (_label, modifiers) => {
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext()
    adapter.start(ctx)
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      cancelable: true,
      ...modifiers,
    })

    window.dispatchEvent(event)
    adapter.stop()

    expect(intents).toEqual([])
    expect(event.defaultPrevented).toBe(false)
  })

  it('preserves native arrow-key behavior on radio controls', () => {
    document.body.innerHTML = `<input id="choice" type="radio" name="choice">`
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext()
    adapter.start(ctx)
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    })

    document.getElementById('choice')!.dispatchEvent(event)

    expect(intents).toEqual([])
    expect(event.defaultPrevented).toBe(false)
    adapter.stop()
  })

  it('on a <select>, leaves up/down native and navigates out sideways', () => {
    // Regression: a closed <select> swallows all four arrows plus Enter and
    // Escape. Ignoring it wholesale (it is "editable") left keyboard and
    // remote users unable to leave the control at all.
    document.body.innerHTML = `<select id="pick"><option>a</option><option>b</option></select>`
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext()
    adapter.start(ctx)
    const select = document.getElementById('pick')!

    // The select's own axis stays native so the value can still be changed.
    for (const key of ['ArrowDown', 'ArrowUp']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      select.dispatchEvent(event)
      expect(intents).toEqual([])
      expect(event.defaultPrevented).toBe(false)
    }

    // Enter and Escape stay native too — they open and dismiss the list.
    for (const key of ['Enter', 'Escape']) {
      select.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      expect(intents).toEqual([])
    }

    // The orthogonal axis is the way out.
    select.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    )
    expect(intents).toMatchObject([{ type: 'direction', direction: 'right' }])
    adapter.stop()
  })

  it('still leaves every key to a focused text field', () => {
    document.body.innerHTML = `<input id="text" type="text">`
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext()
    adapter.start(ctx)
    const input = document.getElementById('text')!
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape']) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    }
    expect(intents).toEqual([])
    adapter.stop()
  })

  it('on range sliders, leaves the slider axis native and navigates on the other', () => {
    document.body.innerHTML = `<input id="slider" type="range">`
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext()
    adapter.start(ctx)

    const slider = document.getElementById('slider')!
    const horizontal = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    })
    slider.dispatchEvent(horizontal)
    expect(intents).toEqual([])
    expect(horizontal.defaultPrevented).toBe(false)

    slider.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    )
    expect(intents).toMatchObject([{ type: 'direction', direction: 'down' }])

    slider.setAttribute('aria-orientation', 'vertical')
    slider.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    )
    expect(intents).toHaveLength(1)
    slider.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
    )
    expect(intents).toMatchObject([
      { type: 'direction', direction: 'down' },
      { type: 'direction', direction: 'left' },
    ])
    adapter.stop()
  })

  it('ignores keys while typing in editable elements', () => {
    document.body.innerHTML = `<input id="field" type="text">`
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext()
    adapter.start(ctx)

    const field = document.getElementById('field')!
    field.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    )
    expect(intents).toEqual([])
    adapter.stop()
  })

  it('ignores keys in editable elements from an iframe realm', () => {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const iwin = iframe.contentWindow!
    const idoc = iframe.contentDocument!
    const IframeKeyboardEvent = (iwin as unknown as { KeyboardEvent: typeof KeyboardEvent })
      .KeyboardEvent
    idoc.body.innerHTML = `<input id="field" type="text">`
    const adapter = keyboardAdapter()
    const intents: NavIntent[] = []
    adapter.start({
      window: iwin,
      dispatch(intent) {
        intents.push(intent)
        return true
      },
    })
    const event = new IframeKeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    })

    try {
      idoc.getElementById('field')!.dispatchEvent(event)
      expect(intents).toEqual([])
      expect(event.defaultPrevented).toBe(false)
    } finally {
      adapter.stop()
      iframe.remove()
    }
  })

  it('uses the composed event path to ignore an editable inside shadow DOM', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const field = document.createElement('input')
    shadow.appendChild(field)
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext()
    adapter.start(ctx)
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      composed: true,
      cancelable: true,
    })

    field.dispatchEvent(event)

    expect(intents).toEqual([])
    expect(event.defaultPrevented).toBe(false)
    adapter.stop()
  })

  it('stops listening after stop() and does not retain state across a reentrant restart', () => {
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext()
    adapter.start(ctx)
    adapter.stop()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }))
    expect(intents).toEqual([])

    let restartOnDispatch = true
    ctx.dispatch = (intent) => {
      intents.push(intent)
      if (restartOnDispatch) {
        restartOnDispatch = false
        adapter.stop()
        adapter.start(ctx)
      }
      return true
    }
    adapter.start(ctx)
    const interrupted = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    window.dispatchEvent(interrupted)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }))

    expect(intents.map((intent) => intent.type)).toEqual(['activate', 'activate', 'release'])
    expect(interrupted.defaultPrevented).toBe(true)
    adapter.stop()
  })

  it('does not consume when the engine reports unhandled', () => {
    const adapter = keyboardAdapter()
    const { ctx } = makeContext(false)
    adapter.start(ctx)
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    adapter.stop()
  })

  it('does not consume a repeat when the initial activate press was unhandled', () => {
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext(false)
    adapter.start(ctx)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    const repeat = new KeyboardEvent('keydown', {
      key: 'Enter',
      repeat: true,
      cancelable: true,
    })
    window.dispatchEvent(repeat)

    expect(intents).toHaveLength(1)
    expect(repeat.defaultPrevented).toBe(false)
    adapter.stop()
  })

  it('does not arm the direction throttle after an unhandled press', () => {
    const adapter = keyboardAdapter({ throttleMs: 10_000 })
    const { ctx, intents } = makeContext(false)
    adapter.start(ctx)
    const first = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true })
    const second = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true })
    window.dispatchEvent(first)
    window.dispatchEvent(second)

    expect(intents).toHaveLength(2)
    expect(first.defaultPrevented).toBe(false)
    expect(second.defaultPrevented).toBe(false)
    adapter.stop()
  })

  it('rechecks ownership when focus moves during a throttled hold', () => {
    document.body.innerHTML = `<button id="a"></button><button id="b"></button>`
    const adapter = keyboardAdapter({ throttleMs: 10_000 })
    const intents: NavIntent[] = []
    let consume = true
    adapter.start({
      window,
      dispatch(intent) {
        intents.push(intent)
        return consume
      },
    })
    document.getElementById('a')!.focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }))

    document.getElementById('b')!.focus()
    consume = false
    const repeat = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      repeat: true,
      cancelable: true,
    })
    window.dispatchEvent(repeat)

    expect(intents).toHaveLength(2)
    expect(repeat.defaultPrevented).toBe(false)
    adapter.stop()
  })

  it('cancels held-key state when the window loses focus', () => {
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext()
    adapter.start(ctx)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }))

    expect(intents.map((intent) => intent.type)).toEqual(['activate', 'activationcancel'])
    adapter.stop()
  })
})
