import type { Direction } from '../core/types'
import { isEditable, isHTMLElementNode } from '../core/dom'
import type { AdapterContext, InputAdapter } from './types'

export type KeyboardAction = Direction | 'activate' | 'back'

export interface KeyboardAdapterOptions {
  /** Map of KeyboardEvent.key values to actions. Replaces the default map. */
  keymap?: Record<string, KeyboardAction>
  /**
   * Map of legacy KeyboardEvent.keyCode values to actions, merged over the
   * defaults. TV / IR remote platforms (webOS, Tizen, HbbTV) report remote
   * buttons through keyCode, often without a useful `key`.
   */
  keyCodeMap?: Record<number, KeyboardAction>
  /** Don't react while focus is in a text input / textarea / contenteditable. Default true. */
  ignoreEditable?: boolean
  /** Leave modified shortcuts (Shift/Alt/Ctrl/Meta) to the browser or OS. Default true. */
  ignoreModified?: boolean
  /**
   * Minimum milliseconds between direction intents. Time-based (not
   * `event.repeat`-based — many TV platforms fire held-key repeats without
   * the flag), so it tames both key repeat and remote-control event floods
   * on slow hardware. A delivered keyup resets the gate, so the next press
   * starts a fresh throttle interval. Default 0 (off).
   */
  throttleMs?: number
}

export const DEFAULT_KEYMAP: Record<string, KeyboardAction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'activate',
  Escape: 'back',
  BrowserBack: 'back',
}

/**
 * Legacy keyCodes used by TV and set-top-box remotes (delivered to the page
 * as keyboard events by the platform's IR stack):
 *   37–40  directional pad        13  OK / Enter
 *   461    webOS BACK             10009  Tizen RETURN
 *   8      HbbTV/STB back (only honored outside editable fields)
 */
export const DEFAULT_KEYCODE_MAP: Record<number, KeyboardAction> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'activate',
  27: 'back',
  8: 'back',
  461: 'back',
  10009: 'back',
}

/**
 * Keyboard adapter. Also the path through which IR remotes work today:
 * webOS / Tizen / HbbTV deliver remote-control buttons as keyboard events.
 */
export function keyboardAdapter(options: KeyboardAdapterOptions = {}): InputAdapter {
  const keymap = options.keymap ?? DEFAULT_KEYMAP
  const keyCodeMap = { ...DEFAULT_KEYCODE_MAP, ...options.keyCodeMap }
  const ignoreEditable = options.ignoreEditable ?? true
  const ignoreModified = options.ignoreModified ?? true
  const requestedThrottle = options.throttleMs ?? 0
  const throttleMs = Number.isFinite(requestedThrottle) ? Math.max(0, requestedThrottle) : 0

  let ctx: AdapterContext | null = null
  // A dispatch handler can synchronously stop and restart this adapter with
  // the same context object. Context identity alone cannot distinguish that
  // new lifecycle from the handler that is still unwinding.
  let lifecycleVersion = 0
  // -Infinity = gate open (leading edge): the first press always fires —
  // performance.now() starts near 0, so initializing to 0 would gate the
  // first throttleMs of page lifetime.
  let lastDirectionAt = Number.NEGATIVE_INFINITY
  let lastDirectionFocus: Element | null = null
  // Set while an activate press we dispatched is being held; release fires
  // 'spatial:activaterelease' with the hold duration (long-press UX).
  const activateDownAt = new Map<string, number>()
  const consumedPresses = new Set<string>()

  const physicalKeyId = (event: KeyboardEvent): string => {
    const key = event.key && event.key !== 'Unidentified' ? event.key : `keyCode:${event.keyCode}`
    return `${event.code || key}:${event.location}`
  }

  const activeElement = (context: AdapterContext): Element | null => {
    let active = context.window.document.activeElement
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
    return active
  }

  const resolveAction = (event: KeyboardEvent): KeyboardAction | undefined =>
    keymap[event.key] ?? keyCodeMap[event.keyCode]

  const resetPressState = (cancelContext?: AdapterContext): void => {
    const activationIds = [...activateDownAt.keys()]
    lastDirectionAt = Number.NEGATIVE_INFINITY
    lastDirectionFocus = null
    activateDownAt.clear()
    consumedPresses.clear()
    for (const activationId of activationIds) {
      cancelContext?.dispatch({ type: 'activationcancel', source: 'keyboard', activationId })
    }
  }

  const onBlur = (): void => resetPressState(ctx ?? undefined)

  const onKeyDown = (event: KeyboardEvent): void => {
    const context = ctx
    if (!context || event.defaultPrevented) return
    const version = lifecycleVersion
    if (ignoreModified && (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey)) return
    const origin = event.composedPath()[0] ?? event.target
    const editable = ignoreEditable && isEditable(origin)

    const action = resolveAction(event)
    if (!action) return

    if (editable) {
      // A closed <select> consumes all four arrows plus Enter and Escape, so
      // ignoring it wholesale leaves keyboard and remote users with no way
      // off the control at all — a dead end with no visible cause. Its own
      // axis is vertical (up/down change or open the list), so hand the
      // orthogonal axis to navigation, exactly as the range slider below
      // does. Text fields and contenteditable stay fully native: they have
      // a caret and Tab, and horizontal arrows move within the text.
      if (!(isHTMLElementNode(origin) && origin.tagName === 'SELECT')) return
      if (action !== 'left' && action !== 'right') return
    }

    // Range sliders: leave the slider's own axis to the browser (arrows
    // adjust the value), navigate away on the orthogonal axis.
    if (ignoreEditable && isHTMLElementNode(origin) && origin.tagName === 'INPUT') {
      const input = origin as HTMLInputElement
      // Radio-group arrows are native selection/navigation controls.
      if (input.type === 'radio' && !['activate', 'back'].includes(action)) return
      if (input.type === 'range') {
        const vertical = input.getAttribute('aria-orientation') === 'vertical'
        if (!vertical && (action === 'left' || action === 'right')) return
        if (vertical && (action === 'up' || action === 'down')) return
      }
    }

    if (action === 'activate' || action === 'back') {
      const activationId = physicalKeyId(event)
      // One intent per physical press: a held Enter must not machine-gun
      // clicks (matches the gamepad adapter's edge detection). Some remote
      // stacks emit held-key floods without setting `repeat`, so use the
      // press identity until keyup/blur instead of trusting that flag alone.
      if (consumedPresses.has(activationId)) {
        event.preventDefault()
        return
      }
      // If this adapter did not see/consume the initial keydown, leave a
      // repeat alone rather than claiming another handler's press.
      if (event.repeat) {
        return
      }
      const consumed = context.dispatch({
        type: action,
        source: 'keyboard',
        ...(action === 'activate' ? { activationId } : {}),
        originalEvent: event,
      })
      if (ctx !== context || lifecycleVersion !== version) {
        if (consumed) event.preventDefault()
        return
      }
      if (consumed) {
        consumedPresses.add(activationId)
        if (action === 'activate') {
          activateDownAt.set(activationId, context.window.performance.now())
        }
        event.preventDefault()
      }
      return
    }

    // Direction: optional time-based gate. Dropped events are still
    // consumed so a flood from an already-owned press doesn't leak into page
    // scrolling. An unhandled press does not arm the gate.
    let now: number | null = null
    if (throttleMs > 0) {
      now = context.window.performance.now()
      if (now - lastDirectionAt < throttleMs) {
        // The adapter may be one of several scoped engines listening on this
        // window. Only suppress a throttled repeat while DOM focus is still
        // where the last consumed move left it; otherwise let every engine
        // re-evaluate ownership.
        if (activeElement(context) === lastDirectionFocus) {
          event.preventDefault()
          return
        }
        lastDirectionAt = Number.NEGATIVE_INFINITY
        lastDirectionFocus = null
      }
    }
    const consumed = context.dispatch({
      type: 'direction',
      direction: action,
      repeat: event.repeat,
      source: 'keyboard',
      originalEvent: event,
    })
    if (ctx !== context || lifecycleVersion !== version) {
      if (consumed) event.preventDefault()
      return
    }
    if (consumed) {
      if (now !== null) {
        lastDirectionAt = now
        lastDirectionFocus = activeElement(context)
      }
      event.preventDefault()
    }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (!ctx) return
    const activationId = physicalKeyId(event)
    consumedPresses.delete(activationId)
    const downAt = activateDownAt.get(activationId)
    if (downAt !== undefined) {
      const durationMs = ctx.window.performance.now() - downAt
      activateDownAt.delete(activationId)
      ctx.dispatch({
        type: 'release',
        durationMs,
        source: 'keyboard',
        activationId,
        originalEvent: event,
      })
      return
    }
    const action = resolveAction(event)
    if (!action) return
    // Releasing a direction key resets the throttle gate for the next press.
    if (action !== 'back') {
      lastDirectionAt = Number.NEGATIVE_INFINITY
      lastDirectionFocus = null
    }
  }

  return {
    id: 'keyboard',
    start(context) {
      lifecycleVersion++
      ctx = context
      context.window.addEventListener('keydown', onKeyDown)
      context.window.addEventListener('keyup', onKeyUp)
      context.window.addEventListener('blur', onBlur)
    },
    stop() {
      const context = ctx
      lifecycleVersion++
      context?.window.removeEventListener('keydown', onKeyDown)
      context?.window.removeEventListener('keyup', onKeyUp)
      context?.window.removeEventListener('blur', onBlur)
      ctx = null
      resetPressState(context ?? undefined)
    },
  }
}
