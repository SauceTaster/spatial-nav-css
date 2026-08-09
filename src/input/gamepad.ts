import type { Direction } from '../core/types'
import type { AdapterContext, InputAdapter } from './types'

export type GamepadAction = 'activate' | 'back'

export interface GamepadAdapterOptions {
  /** Stick magnitude below which input is ignored. Default 0.5. */
  deadzone?: number
  /** Delay before a held direction starts repeating, ms. Default 400. */
  initialRepeatDelayMs?: number
  /** Interval between repeats while held, ms. Default 130. */
  repeatIntervalMs?: number
  /**
   * Standard-mapping button index → action. Defaults: 0 (A/Cross) activate,
   * 1 (B/Circle) back. Merged over the defaults.
   */
  buttonMap?: Record<number, GamepadAction>
}

/** Standard-mapping d-pad button indices (https://w3c.github.io/gamepad/#remapping). */
const DPAD: ReadonlyArray<[number, Direction]> = [
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
]

const DEFAULT_BUTTON_MAP: Record<number, GamepadAction> = { 0: 'activate', 1: 'back' }

interface PadState {
  direction: Direction | null
  nextRepeatAt: number
  buttons: Map<number, boolean>
  /** performance.now() when each mapped button went down (long-press UX). */
  pressedAt: Map<number, number>
}

/**
 * Gamepad API adapter.
 *
 * Uses the W3C Standard Gamepad button/axis layout. It works when the host
 * browser exposes a controller with that layout; raw/nonstandard mappings
 * may require a custom adapter. Steam Input can work when configured for
 * gamepad emulation and the host exposes the emulated pad through Gamepad API.
 *
 * Polls via requestAnimationFrame only while at least one pad is connected.
 */
export function gamepadAdapter(options: GamepadAdapterOptions = {}): InputAdapter {
  const finiteOption = (value: number | undefined, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const deadzone = Math.min(1, Math.max(0, finiteOption(options.deadzone, 0.5)))
  const initialDelay = Math.max(0, finiteOption(options.initialRepeatDelayMs, 400))
  const repeatInterval = Math.max(0, finiteOption(options.repeatIntervalMs, 130))
  const buttonMap = { ...DEFAULT_BUTTON_MAP, ...options.buttonMap }
  // Precomputed to avoid rebuilding the mapping on every animation frame.
  const buttonEntries: ReadonlyArray<[number, GamepadAction]> = Object.entries(buttonMap)
    .map(([index, action]) => [Number(index), action] as [number, GamepadAction])
    .filter(
      ([index, action]) =>
        Number.isInteger(index) && index >= 0 && (action === 'activate' || action === 'back'),
    )

  let ctx: AdapterContext | null = null
  // Dispatch handlers can synchronously stop and restart this adapter with
  // the same context object, so identity alone cannot distinguish lifecycles.
  let lifecycleVersion = 0
  let rafId: number | null = null
  let lastPollAt = 0
  const pads = new Map<number, PadState>()

  const cancelPad = (index: number, context: AdapterContext): void => {
    const state = pads.get(index)
    if (!state) return
    const pressed = [...state.pressedAt.keys()]
    state.pressedAt.clear()
    pads.delete(index)
    for (const button of pressed) {
      context.dispatch({
        type: 'activationcancel',
        source: 'gamepad',
        activationId: `pad:${index}:button:${button}`,
      })
    }
  }

  // alert()/confirm() freeze all page JS mid-frame; tab switches stop rAF.
  // A gap this large means held-input repeat timers are stale — reset them
  // on resume instead of firing an instant phantom repeat. Kept well above
  // worst-case jank frames so ordinary slow frames still repeat on time.
  const SUSPEND_GAP_MS = 1000

  // Flaky drivers can report NaN/Infinity axes; treat anything non-finite
  // as centered or every NaN comparison reads as "pressed".
  const finite = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

  const readDirection = (pad: Gamepad): Direction | null => {
    for (const [index, dir] of DPAD) {
      if (pad.buttons[index]?.pressed) return dir
    }
    const x = finite(pad.axes[0])
    const y = finite(pad.axes[1])
    const magnitude = Math.hypot(x, y)
    if (magnitude === 0 || magnitude < deadzone) return null
    if (Math.abs(x) >= Math.abs(y)) return x > 0 ? 'right' : 'left'
    return y > 0 ? 'down' : 'up'
  }

  const poll = (): void => {
    const context = ctx
    if (!context) return
    const version = lifecycleVersion
    const isStale = (): boolean => ctx !== context || lifecycleVersion !== version
    const win = context.window
    const now = win.performance.now()
    const suspended = lastPollAt > 0 && now - lastPollAt > SUSPEND_GAP_MS
    lastPollAt = now
    let list: readonly (Gamepad | null)[]
    try {
      list = win.navigator.getGamepads?.() ?? []
    } catch {
      // Permissions Policy, privacy settings, or a host implementation may
      // reject access. Cancel retained presses and stop polling; a later
      // connection event can retry.
      for (const index of [...pads.keys()]) {
        cancelPad(index, context)
        if (isStale()) return
      }
      rafId = null
      return
    }
    let anyConnected = false
    const seen = new Set<number>()

    for (const pad of list) {
      if (!pad?.connected) continue
      anyConnected = true
      seen.add(pad.index)
      let state = pads.get(pad.index)
      if (!state) {
        state = { direction: null, nextRepeatAt: 0, buttons: new Map(), pressedAt: new Map() }
        pads.set(pad.index, state)
      }
      if (suspended && state.direction) {
        // Resuming from a blocked period with a direction still held:
        // restart the hold as if it had just begun.
        state.nextRepeatAt = now + initialDelay
      }
      if (suspended && state.pressedAt.size > 0) {
        // A press retained across a frozen/hidden period (alert(), tab
        // switch) must not resolve into a release whose durationMs counts
        // the blocked time — that reads as a long-press the user never
        // performed. Treat it as lost input ownership, like the keyboard
        // adapter's blur handling: cancel the activation. state.buttons is
        // left as-is, so a still-held button neither re-activates nor
        // releases until a real edge after a fresh press.
        const retained = [...state.pressedAt.keys()]
        state.pressedAt.clear()
        for (const button of retained) {
          context.dispatch({
            type: 'activationcancel',
            source: 'gamepad',
            activationId: `pad:${pad.index}:button:${button}`,
          })
          if (isStale()) return
        }
      }

      const dir = readDirection(pad)
      if (dir !== state.direction) {
        state.direction = dir
        if (dir) {
          context.dispatch({ type: 'direction', direction: dir, repeat: false, source: 'gamepad' })
          if (isStale()) return
          state.nextRepeatAt = now + initialDelay
        }
      } else if (dir && now >= state.nextRepeatAt) {
        context.dispatch({ type: 'direction', direction: dir, repeat: true, source: 'gamepad' })
        if (isStale()) return
        state.nextRepeatAt = now + repeatInterval
      }

      for (const [i, action] of buttonEntries) {
        const activationId = `pad:${pad.index}:button:${i}`
        const pressed = pad.buttons[i]?.pressed ?? false
        const wasPressed = state.buttons.get(i) ?? false
        if (pressed && !wasPressed) {
          const consumed = context.dispatch({
            type: action,
            source: 'gamepad',
            ...(action === 'activate' ? { activationId } : {}),
          })
          if (isStale()) return
          if (consumed && action === 'activate') state.pressedAt.set(i, now)
        } else if (!pressed && wasPressed && action === 'activate') {
          const downAt = state.pressedAt.get(i)
          if (downAt !== undefined) {
            state.pressedAt.delete(i)
            context.dispatch({
              type: 'release',
              durationMs: now - downAt,
              source: 'gamepad',
              activationId,
            })
            if (isStale()) return
          }
        }
        state.buttons.set(i, pressed)
      }
    }

    // Driver/privacy changes can make a pad disappear without delivering a
    // gamepaddisconnected event. Treat omission as cancellation so press
    // targets are not retained waiting for an impossible release.
    for (const index of [...pads.keys()]) {
      if (!seen.has(index)) {
        cancelPad(index, context)
        if (isStale()) return
      }
    }

    if (!isStale()) rafId = anyConnected ? win.requestAnimationFrame(poll) : null
  }

  const ensurePolling = (): void => {
    if (ctx && rafId === null) rafId = ctx.window.requestAnimationFrame(poll)
  }

  const onConnected = (): void => ensurePolling()
  const onDisconnected = (event: GamepadEvent): void => {
    if (ctx) cancelPad(event.gamepad.index, ctx)
  }

  return {
    id: 'gamepad',
    start(context) {
      lifecycleVersion++
      ctx = context
      lastPollAt = 0
      context.window.addEventListener('gamepadconnected', onConnected)
      context.window.addEventListener('gamepaddisconnected', onDisconnected)
      // A pad may already be connected (no event fires for pre-existing pads
      // until an input, but poll defensively — it self-stops when none).
      ensurePolling()
    },
    stop() {
      lifecycleVersion++
      const context = ctx
      if (context && rafId !== null) context.window.cancelAnimationFrame(rafId)
      rafId = null
      context?.window.removeEventListener('gamepadconnected', onConnected)
      context?.window.removeEventListener('gamepaddisconnected', onDisconnected)
      ctx = null
      lastPollAt = 0
      if (context) {
        for (const index of [...pads.keys()]) cancelPad(index, context)
      } else {
        pads.clear()
      }
    },
  }
}
