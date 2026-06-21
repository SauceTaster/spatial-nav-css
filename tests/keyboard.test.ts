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
    window.dispatchEvent(repeat1)
    window.dispatchEvent(repeat2)
    expect(intents.filter((i) => i.type === 'activate')).toHaveLength(1)
    // Repeats are still consumed so the browser's own repeated default
    // (e.g. repeated clicks on a focused button) is suppressed.
    expect(repeat1.defaultPrevented).toBe(true)
    expect(repeat2.defaultPrevented).toBe(true)
    adapter.stop()
  })

  it('reports hold duration on Enter release (long-press UX)', () => {
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext()
    adapter.start(ctx)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }))
    const release = intents.find((i) => i.type === 'release')
    expect(release).toBeDefined()
    expect(release!.type === 'release' && release!.durationMs).toBeGreaterThanOrEqual(0)

    // A keyup without a dispatched press (e.g. press consumed elsewhere)
    // produces no release.
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }))
    expect(intents.filter((i) => i.type === 'release')).toHaveLength(1)
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

  it('stops listening after stop()', () => {
    const adapter = keyboardAdapter()
    const { ctx, intents } = makeContext()
    adapter.start(ctx)
    adapter.stop()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }))
    expect(intents).toEqual([])
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
})
