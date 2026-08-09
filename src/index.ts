import type { Direction } from './core/types'
import { SpatialEngine, type EngineOptions } from './core/engine'
import { InputManager } from './input/manager'
import { keyboardAdapter } from './input/keyboard'
import { gamepadAdapter } from './input/gamepad'
import type { InputAdapter, NavIntent } from './input/types'
import { ownerDocumentOf } from './core/dom'

export interface SpatialNavigationOptions extends EngineOptions {
  /**
   * Input adapters to drive navigation. Defaults to
   * [keyboardAdapter(), gamepadAdapter()]. Pass [] for a purely
   * programmatic engine.
   */
  adapters?: InputAdapter[]
  /** Focus the default/first focusable element on start(). Default false. */
  autofocus?: boolean
  /** Window used by input adapters (for iframes / test environments). */
  window?: Window
}

export interface SpatialNavigation {
  /** Begin tracking focus and listening to input devices. */
  start(): void
  /** Stop listening; focus state is kept. */
  stop(): void
  /** Stop and release everything. */
  destroy(): void
  /** Move focus in a direction. Returns true if focus moved. */
  navigate(direction: Direction, repeat?: boolean): boolean
  /** Focus an element or selector. */
  focus(target: HTMLElement | string): boolean
  /** Focus the default-focus element, else the first focusable. */
  focusFirst(): boolean
  /**
   * Focus `target` — or the default/first focusable when omitted — but only
   * while focus is still unclaimed: nothing spatially focused and the
   * document's active element still the body. Returns false, changing
   * nothing, once anything holds focus.
   *
   * This is the safe way to focus content that arrives asynchronously.
   * `autofocus` runs once at `start()`, when a data-driven screen is still
   * skeletons; call this when the data lands and it will place focus without
   * yanking it away from a user who already started navigating, or from a
   * second navigation region on the page.
   */
  claimFocus(target?: HTMLElement | string): boolean
  /** Currently focused element, if any. */
  getFocused(): HTMLElement | null
  /** Synthesize activation (click) on the focused element. */
  activate(): boolean
  /** Dispatch spatial:back. Returns true if a listener handled it. */
  back(): boolean
  addAdapter(adapter: InputAdapter): void
  removeAdapter(adapter: InputAdapter): void
  /** The underlying engine, for advanced use. */
  readonly engine: SpatialEngine
}

function createServerFacade(): SpatialNavigation {
  const unavailable = (): never => {
    throw new Error('SpatialNavigation.engine is unavailable during server rendering')
  }
  return {
    get engine(): SpatialEngine {
      return unavailable()
    },
    start() {},
    stop() {},
    destroy() {},
    navigate: () => false,
    focus: () => false,
    focusFirst: () => false,
    claimFocus: () => false,
    getFocused: () => null,
    activate: () => false,
    back: () => false,
    addAdapter() {},
    removeAdapter() {},
  }
}

/**
 * Wire up a spatial navigation instance: engine + input adapters.
 *
 *   import { createSpatialNavigation } from 'spatial-nav-css'
 *   import 'spatial-nav-css/css'
 *
 *   const nav = createSpatialNavigation()
 *   nav.start()
 */
export function createSpatialNavigation(options: SpatialNavigationOptions = {}): SpatialNavigation {
  // Framework adapters construct during render/plugin setup. On the server,
  // expose a deterministic no-op facade so imports and SSR renders are safe;
  // the browser hydration creates its own live instance.
  if (!options.root && typeof document === 'undefined') return createServerFacade()

  const engine = new SpatialEngine(options)
  const win =
    options.window ??
    ownerDocumentOf(engine.root).defaultView ??
    (typeof window !== 'undefined' ? window : undefined)
  // Pair each physical activate press with the element that received it.
  // Focus can move while the control is held (for example, an activate
  // handler can open a dialog), but its release still belongs to the
  // original press target.
  const activationTargets = new Map<string, HTMLElement>()
  let activationGeneration = 0
  let lifecycle: 'idle' | 'starting' | 'running' | 'stopping' | 'destroying' | 'destroyed' = 'idle'
  const activationKey = (intent: { source: string; activationId?: string }): string =>
    `${intent.source}\u0000${intent.activationId ?? ''}`

  const handleIntent = (intent: NavIntent): boolean => {
    switch (intent.type) {
      case 'direction': {
        if (!engine.getFocused()) {
          // Claim first focus only when nothing on the page holds focus —
          // otherwise multiple nav regions (e.g. two <spatial-nav> islands)
          // would steal focus from each other on every keypress.
          if (!engine.canClaimFocus()) return false
          return engine.focusFirst({
            direction: intent.direction,
            source: intent.source,
            repeat: intent.repeat,
          })
        }
        // Consume the input even when at an edge so arrow keys / sticks
        // never scroll the page out from under the focus system. Apps react
        // to edges via the 'spatial:nofocustarget' event instead.
        engine.navigate(intent.direction, intent.source, intent.repeat)
        return true
      }
      case 'activate': {
        const generation = activationGeneration
        const target = engine.getFocused()
        const consumed = engine.activate(intent.source)
        if (consumed && target && generation === activationGeneration) {
          activationTargets.set(activationKey(intent), target)
        }
        return consumed
      }
      case 'release': {
        const key = activationKey(intent)
        const target = activationTargets.get(key)
        activationTargets.delete(key)
        return target ? engine.activateRelease(intent.durationMs, intent.source, target) : false
      }
      case 'activationcancel': {
        const key = activationKey(intent)
        const target = activationTargets.get(key)
        activationTargets.delete(key)
        return target ? engine.activateCancel(intent.source, target) : false
      }
      case 'back':
        return engine.back(intent.source)
    }
  }

  const manager = win ? new InputManager(handleIntent, win) : null
  const adapters = options.adapters ?? [keyboardAdapter(), gamepadAdapter()]
  for (const adapter of adapters) manager?.add(adapter)

  return {
    engine,
    start() {
      if (lifecycle !== 'idle') return
      lifecycle = 'starting'
      try {
        engine.start()
        manager?.start()
        // A custom adapter or focus listener may stop/destroy synchronously.
        if (lifecycle !== 'starting') return
        if (options.autofocus && !engine.getFocused()) engine.focusFirst({ source: 'autofocus' })
        if (lifecycle === 'starting') lifecycle = 'running'
      } catch (error) {
        if (lifecycle === 'starting') {
          lifecycle = 'stopping'
          try {
            manager?.stop()
          } catch {
            // Preserve the operation that made start() fail.
          } finally {
            activationTargets.clear()
            engine.stop()
            if (lifecycle === 'stopping') lifecycle = 'idle'
          }
        }
        throw error
      }
    },
    stop() {
      if (
        lifecycle === 'idle' ||
        lifecycle === 'stopping' ||
        lifecycle === 'destroying' ||
        lifecycle === 'destroyed'
      ) {
        return
      }
      lifecycle = 'stopping'
      activationGeneration++
      try {
        manager?.stop()
      } finally {
        activationTargets.clear()
        engine.stop()
        if (lifecycle === 'stopping') lifecycle = 'idle'
      }
    },
    destroy() {
      if (lifecycle === 'destroying' || lifecycle === 'destroyed') return
      lifecycle = 'destroying'
      activationGeneration++
      try {
        manager?.destroy()
      } finally {
        activationTargets.clear()
        engine.destroy()
        lifecycle = 'destroyed'
      }
    },
    navigate: (direction, repeat) => engine.navigate(direction, 'api', repeat),
    focus: (target) => engine.focus(target),
    focusFirst: () => engine.focusFirst(),
    claimFocus: (target) => {
      if (!engine.canClaimFocus()) return false
      return target === undefined
        ? engine.focusFirst({ source: 'claim' })
        : engine.focus(target, { source: 'claim' })
    },
    getFocused: () => engine.getFocused(),
    activate: () => engine.activate(),
    back: () => engine.back(),
    addAdapter: (adapter) => manager?.add(adapter),
    removeAdapter: (adapter) => manager?.remove(adapter),
  }
}

// Core
export { SpatialEngine } from './core/engine'
export type { EngineOptions, FocusMoveDetail } from './core/engine'
export type { Direction, NavRect, ScoringOptions, ElementNavConfig, Candidate } from './core/types'
export { DEFAULT_SCORING, DIRECTIONS } from './core/types'
export {
  findBestCandidate,
  distanceScore,
  classifyDirection,
  projectedOverlap,
  wrapOrigin,
  toNavRect,
  rectCenter,
  unionRects,
  OPPOSITE,
} from './core/geometry'
export { readNavConfig, findContainer, containerChain } from './core/config'
export {
  DEFAULT_FOCUSABLE_SELECTOR,
  getFocusables,
  isElementVisible,
  isRendered,
  isSemanticallyNavigable,
  isEditable,
} from './core/dom'

// Events
export { dispatchSpatialEvent } from './events'
export type { SpatialEvent, SpatialEventDetail, SpatialEventType } from './events'

// Input
export { InputManager } from './input/manager'
export { keyboardAdapter, DEFAULT_KEYMAP, DEFAULT_KEYCODE_MAP } from './input/keyboard'
export type { KeyboardAdapterOptions, KeyboardAction } from './input/keyboard'
export { gamepadAdapter } from './input/gamepad'
export type { GamepadAdapterOptions, GamepadAction } from './input/gamepad'
export type { InputAdapter, AdapterContext, NavIntent } from './input/types'
