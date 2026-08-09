import type { Direction } from '../core/types'

/**
 * Semantic navigation intent, decoupled from the physical device.
 * Adapters translate device events into intents; the engine consumes them.
 */
export type NavIntent =
  | { type: 'direction'; direction: Direction; repeat: boolean; source: string; originalEvent?: Event }
  | { type: 'activate'; source: string; activationId?: string; originalEvent?: Event }
  | {
      type: 'release'
      durationMs: number
      source: string
      /** Matches a release to its activate press when a source supports concurrent holds. */
      activationId?: string
      originalEvent?: Event
    }
  | {
      /** Drop a stored activate press without announcing a release. */
      type: 'activationcancel'
      source: string
      activationId?: string
      originalEvent?: Event
    }
  | { type: 'back'; source: string; originalEvent?: Event }

export interface AdapterContext {
  /**
   * Deliver an intent. Returns true if it was consumed (adapters typically
   * preventDefault() the originating event when so).
   */
  dispatch(intent: NavIntent): boolean
  readonly window: Window
}

/**
 * A physical input source. Implement this to add new devices —
 * Steamworks action sets, dedicated IR receivers, Kinect, MIDI, whatever.
 */
export interface InputAdapter {
  /**
   * Stable adapter identifier. Use the same value for the intents' `source`
   * when events should report this adapter; InputManager does not rewrite
   * caller-supplied source strings.
   */
  readonly id: string
  start(context: AdapterContext): void
  stop(): void
}
