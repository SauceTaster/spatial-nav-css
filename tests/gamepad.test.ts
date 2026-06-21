import { describe, expect, it } from 'vitest'
import { gamepadAdapter } from '../src/input/gamepad'
import type { AdapterContext, NavIntent } from '../src/input/types'

interface FakePad {
  connected: boolean
  index: number
  buttons: Array<{ pressed: boolean }>
  axes: number[]
}

function makePad(): FakePad {
  return {
    connected: true,
    index: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
    axes: [0, 0],
  }
}

/** Deterministic stand-in for window: manual clock and frame stepping. */
function makeHarness(pad: FakePad | null) {
  let now = 0
  let frame: (() => void) | null = null
  const pads: Array<FakePad | null> = [pad]
  const listeners = new Map<string, Set<(e: unknown) => void>>()
  const intents: NavIntent[] = []

  const win = {
    performance: { now: () => now },
    navigator: { getGamepads: () => pads },
    requestAnimationFrame: (cb: () => void) => {
      frame = cb
      return 1
    },
    cancelAnimationFrame: () => {
      frame = null
    },
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    },
    removeEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners.get(type)?.delete(fn)
    },
  } as unknown as Window

  const ctx: AdapterContext = {
    window: win,
    dispatch(intent) {
      intents.push(intent)
      return true
    },
  }

  return {
    ctx,
    intents,
    step(ms = 16) {
      now += ms
      const cb = frame
      frame = null
      cb?.()
    },
    isPolling: () => frame !== null,
    emit(type: string, event: unknown) {
      listeners.get(type)?.forEach((fn) => {
        fn(event)
      })
    },
  }
}

describe('gamepadAdapter', () => {
  it('emits a direction once on d-pad press, then repeats after the delay', () => {
    const pad = makePad()
    const h = makeHarness(pad)
    const adapter = gamepadAdapter({ initialRepeatDelayMs: 400, repeatIntervalMs: 100 })
    adapter.start(h.ctx)

    pad.buttons[15]!.pressed = true // d-pad right
    h.step()
    expect(h.intents).toEqual([
      { type: 'direction', direction: 'right', repeat: false, source: 'gamepad' },
    ])

    // Held but before the initial delay: no repeat.
    h.step(200)
    expect(h.intents).toHaveLength(1)

    // Past the initial delay: repeats flagged as such.
    h.step(300)
    expect(h.intents).toHaveLength(2)
    expect(h.intents[1]).toMatchObject({ type: 'direction', direction: 'right', repeat: true })

    // Released: nothing further.
    pad.buttons[15]!.pressed = false
    h.step(200)
    expect(h.intents).toHaveLength(2)
    adapter.stop()
  })

  it('translates the left stick beyond the deadzone, dominant axis wins', () => {
    const pad = makePad()
    const h = makeHarness(pad)
    const adapter = gamepadAdapter({ deadzone: 0.5 })
    adapter.start(h.ctx)

    pad.axes = [0.2, -0.3] // inside deadzone
    h.step()
    expect(h.intents).toHaveLength(0)

    pad.axes = [0.4, -0.9] // up dominates
    h.step()
    expect(h.intents).toEqual([{ type: 'direction', direction: 'up', repeat: false, source: 'gamepad' }])
    adapter.stop()
  })

  it('edge-detects face buttons: press once, release reports hold duration', () => {
    const pad = makePad()
    const h = makeHarness(pad)
    const adapter = gamepadAdapter()
    adapter.start(h.ctx)

    pad.buttons[0]!.pressed = true // A / Cross — pressed at t=16
    h.step()
    h.step()
    pad.buttons[0]!.pressed = false // released at t=48
    pad.buttons[1]!.pressed = true // B / Circle
    h.step()
    expect(h.intents.map((i) => i.type)).toEqual(['activate', 'release', 'back'])
    const release = h.intents[1]
    expect(release!.type === 'release' && release!.durationMs).toBe(32)
    adapter.stop()
  })

  it('a long A-button hold reports its full duration on release', () => {
    const pad = makePad()
    const h = makeHarness(pad)
    const adapter = gamepadAdapter()
    adapter.start(h.ctx)

    pad.buttons[0]!.pressed = true
    h.step() // pressed at t=16
    h.step(700) // held — t=716
    pad.buttons[0]!.pressed = false
    h.step() // released at t=732
    const release = h.intents.find((i) => i.type === 'release')
    expect(release!.type === 'release' && release!.durationMs).toBe(716)
    adapter.stop()
  })

  it('does not fire a stale repeat after a blocked period (alert, tab freeze)', () => {
    const pad = makePad()
    const h = makeHarness(pad)
    const adapter = gamepadAdapter({ initialRepeatDelayMs: 400, repeatIntervalMs: 100 })
    adapter.start(h.ctx)

    pad.buttons[13]!.pressed = true // hold d-pad down
    h.step()
    expect(h.intents).toHaveLength(1) // initial fire

    // JS frozen for 5 seconds (alert() open) while the button stays held:
    // resuming must NOT fire an instant phantom repeat…
    h.step(5000)
    expect(h.intents).toHaveLength(1)

    // …and the hold restarts as fresh: repeats resume only after the
    // initial delay passes again.
    h.step(200)
    expect(h.intents).toHaveLength(1)
    h.step(300)
    expect(h.intents).toHaveLength(2)
    expect(h.intents[1]).toMatchObject({ type: 'direction', direction: 'down', repeat: true })
    adapter.stop()
  })

  it('treats NaN/Infinity axes (flaky drivers) as centered', () => {
    const pad = makePad()
    const h = makeHarness(pad)
    const adapter = gamepadAdapter()
    adapter.start(h.ctx)

    pad.axes = [Number.NaN, Number.NaN]
    h.step()
    pad.axes = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
    h.step()
    expect(h.intents).toEqual([]) // no phantom directions

    pad.axes = [0, -1] // recovery: real input still works
    h.step()
    expect(h.intents).toMatchObject([{ type: 'direction', direction: 'up' }])
    adapter.stop()
  })

  it('tolerates a pad with empty buttons and axes arrays', () => {
    const pad = makePad()
    pad.buttons = []
    pad.axes = []
    const h = makeHarness(pad)
    const adapter = gamepadAdapter()
    adapter.start(h.ctx)
    expect(() => h.step()).not.toThrow()
    expect(h.intents).toEqual([])
    adapter.stop()
  })

  it('stops polling with no pads and resumes on gamepadconnected', () => {
    const h = makeHarness(null)
    const adapter = gamepadAdapter()
    adapter.start(h.ctx)
    h.step()
    expect(h.isPolling()).toBe(false)

    // A pad arrives.
    ;(h.ctx.window.navigator.getGamepads() as Array<FakePad | null>)[0] = makePad()
    h.emit('gamepadconnected', { gamepad: { index: 0 } })
    expect(h.isPolling()).toBe(true)
    adapter.stop()
    expect(h.isPolling()).toBe(false)
  })
})
