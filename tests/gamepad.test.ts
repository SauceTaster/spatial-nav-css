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
  let nextFrameId = 0
  const frames = new Map<number, () => void>()
  const pads: Array<FakePad | null> = [pad]
  const listeners = new Map<string, Set<(e: unknown) => void>>()
  const intents: NavIntent[] = []

  const win = {
    performance: { now: () => now },
    navigator: { getGamepads: () => pads },
    requestAnimationFrame: (cb: () => void) => {
      const id = ++nextFrameId
      frames.set(id, cb)
      return id
    },
    cancelAnimationFrame: (id: number) => {
      frames.delete(id)
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
      const next = frames.entries().next().value as [number, () => void] | undefined
      if (!next) return
      const [id, cb] = next
      frames.delete(id)
      cb()
    },
    isPolling: () => frames.size > 0,
    pendingFrames: () => frames.size,
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
    const activate = h.intents[0]
    const release = h.intents[1]
    expect(release!.type === 'release' && release!.durationMs).toBe(32)
    expect(
      activate!.type === 'activate' &&
        release!.type === 'release' &&
        release!.activationId === activate!.activationId,
    ).toBe(true)

    pad.buttons[0]!.pressed = true
    h.step()
    h.emit('gamepaddisconnected', { gamepad: { index: 0 } })
    expect(h.intents.filter((intent) => intent.type === 'activationcancel')).toEqual([
      {
        type: 'activationcancel',
        source: 'gamepad',
        activationId: 'pad:0:button:0',
      },
    ])
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

  it('cancels a press held across a blocked period instead of reporting a phantom long-press', () => {
    // Regression: durationMs used to include the frozen time, so a tap whose
    // release landed after an alert()/tab switch surfaced as a multi-second
    // hold and triggered long-press UX the user never performed.
    const pad = makePad()
    const h = makeHarness(pad)
    const adapter = gamepadAdapter()
    adapter.start(h.ctx)

    pad.buttons[0]!.pressed = true
    h.step() // pressed at t=16
    expect(h.intents).toMatchObject([{ type: 'activate', source: 'gamepad' }])

    // JS frozen for 3 seconds; the user releases while the page is blocked.
    h.step(3000)
    expect(h.intents[1]).toEqual({
      type: 'activationcancel',
      source: 'gamepad',
      activationId: 'pad:0:button:0',
    })

    pad.buttons[0]!.pressed = false
    h.step()
    expect(h.intents.some((i) => i.type === 'release')).toBe(false)

    // A fresh press after the resume still works normally.
    pad.buttons[0]!.pressed = true
    h.step()
    pad.buttons[0]!.pressed = false
    h.step()
    const release = h.intents.find((i) => i.type === 'release')
    expect(release!.type === 'release' && release!.durationMs).toBeLessThan(100)
    adapter.stop()
  })

  it('repeats a held analog direction and restarts the clock on direction change', () => {
    const pad = makePad()
    const h = makeHarness(pad)
    const adapter = gamepadAdapter({ initialRepeatDelayMs: 400, repeatIntervalMs: 100 })
    adapter.start(h.ctx)

    pad.axes = [1, 0] // stick held right
    h.step()
    expect(h.intents).toMatchObject([{ type: 'direction', direction: 'right', repeat: false }])

    h.step(300) // still inside the initial delay
    expect(h.intents).toHaveLength(1)
    h.step(200) // past it
    expect(h.intents[1]).toMatchObject({ type: 'direction', direction: 'right', repeat: true })
    h.step(100)
    expect(h.intents[2]).toMatchObject({ type: 'direction', direction: 'right', repeat: true })

    // Rolling the stick to a new direction without recentering fires
    // immediately as a fresh press, not as a repeat.
    pad.axes = [0, 1]
    h.step()
    expect(h.intents[3]).toMatchObject({ type: 'direction', direction: 'down', repeat: false })

    // Recentering ends the hold; the next push restarts the initial delay.
    pad.axes = [0, 0]
    h.step()
    const afterRecenter = h.intents.length
    pad.axes = [0, 1]
    h.step()
    expect(h.intents).toHaveLength(afterRecenter + 1)
    h.step(300)
    expect(h.intents).toHaveLength(afterRecenter + 1)
    h.step(200)
    expect(h.intents[afterRecenter + 1]).toMatchObject({ direction: 'down', repeat: true })
    adapter.stop()
  })

  it('honors a custom buttonMap and ignores malformed entries', () => {
    const pad = makePad()
    const h = makeHarness(pad)
    const adapter = gamepadAdapter({
      buttonMap: { 2: 'activate', 3: 'bogus' as 'activate', [-1]: 'activate' },
    })
    adapter.start(h.ctx)

    pad.buttons[2]!.pressed = true
    h.step()
    expect(h.intents).toMatchObject([
      { type: 'activate', source: 'gamepad', activationId: 'pad:0:button:2' },
    ])
    pad.buttons[2]!.pressed = false
    h.step()
    expect(h.intents[1]).toMatchObject({ type: 'release', activationId: 'pad:0:button:2' })

    // The map merges over the defaults rather than replacing them…
    pad.buttons[0]!.pressed = true
    h.step()
    expect(h.intents[2]).toMatchObject({ type: 'activate', activationId: 'pad:0:button:0' })
    pad.buttons[0]!.pressed = false
    h.step()

    // …and an unknown action is dropped rather than dispatched.
    const before = h.intents.length
    pad.buttons[3]!.pressed = true
    h.step()
    expect(h.intents).toHaveLength(before)
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
    const adapter = gamepadAdapter({
      deadzone: Number.NaN,
      initialRepeatDelayMs: Number.NaN,
      repeatIntervalMs: Number.NaN,
    })
    adapter.start(h.ctx)

    pad.axes = [Number.NaN, Number.NaN]
    h.step()
    pad.axes = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
    h.step()
    expect(h.intents).toEqual([]) // no phantom directions

    pad.axes = [0, -1] // recovery: real input still works
    h.step()
    expect(h.intents).toMatchObject([{ type: 'direction', direction: 'up' }])
    h.step()
    expect(h.intents).toHaveLength(1) // invalid repeat timings fell back to documented defaults
    adapter.stop()
  })

  it('tolerates a pad with empty buttons and axes arrays', () => {
    const pad = makePad()
    pad.buttons = []
    pad.axes = []
    const h = makeHarness(pad)
    const adapter = gamepadAdapter({ deadzone: 0 })
    adapter.start(h.ctx)
    expect(() => h.step()).not.toThrow()
    expect(h.intents).toEqual([])
    adapter.stop()
  })

  it('contains a getGamepads failure instead of throwing from the animation frame', () => {
    const h = makeHarness(makePad())
    const adapter = gamepadAdapter()
    Object.defineProperty(h.ctx.window.navigator, 'getGamepads', {
      configurable: true,
      value: () => {
        throw new Error('driver unavailable')
      },
    })
    adapter.start(h.ctx)

    expect(() => h.step()).not.toThrow()
    expect(h.intents).toEqual([])
    adapter.stop()
  })

  it('can be stopped synchronously by a dispatch handler without leaking a frame', () => {
    const pad = makePad()
    const h = makeHarness(pad)
    const adapter = gamepadAdapter()
    let stopOnDispatch = true
    h.ctx.dispatch = (intent) => {
      h.intents.push(intent)
      if (stopOnDispatch) adapter.stop()
      return true
    }
    adapter.start(h.ctx)
    pad.buttons[15]!.pressed = true
    pad.buttons[0]!.pressed = true

    expect(() => h.step()).not.toThrow()
    expect(h.isPolling()).toBe(false)

    // A later restart must not be blocked by a stale rAF id from the stopped poll.
    stopOnDispatch = false
    pad.buttons[15]!.pressed = false
    pad.buttons[0]!.pressed = false
    adapter.start(h.ctx)
    h.step()
    expect(h.isPolling()).toBe(true)
    adapter.stop()

    // Context identity can stay the same across a synchronous stop/restart.
    // The old poll must not schedule over the new lifecycle's frame.
    let restartOnDispatch = true
    h.ctx.dispatch = (intent) => {
      h.intents.push(intent)
      if (restartOnDispatch) {
        restartOnDispatch = false
        adapter.stop()
        adapter.start(h.ctx)
      }
      return true
    }
    pad.buttons[15]!.pressed = true
    adapter.start(h.ctx)
    h.step()
    expect(h.pendingFrames()).toBe(1)
    h.step()
    expect(h.pendingFrames()).toBe(1)
    adapter.stop()
    expect(h.pendingFrames()).toBe(0)
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
