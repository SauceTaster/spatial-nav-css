import type { Direction } from './core/types'

/**
 * DOM events dispatched by the engine (all bubble and are composed):
 *
 *  - 'spatial:beforefocus'   cancelable — preventDefault() vetoes the move
 *  - 'spatial:focus'         after focus has moved
 *  - 'spatial:nofocustarget' navigation found no target (edge of UI) —
 *                            hook this to paginate, lazy-load, etc.
 *  - 'spatial:activate'      cancelable — preventDefault() suppresses the
 *                            synthetic click on the focused element
 *  - 'spatial:activaterelease' the activate control was released;
 *                            detail.durationMs enables long-press UX
 *  - 'spatial:activatecancel' a matched activate press was abandoned because
 *                            its input source stopped or lost ownership
 *  - 'spatial:back'          cancelable — preventDefault() marks it handled
 */
export type SpatialEventType =
  | 'spatial:beforefocus'
  | 'spatial:focus'
  | 'spatial:nofocustarget'
  | 'spatial:activate'
  | 'spatial:activaterelease'
  | 'spatial:activatecancel'
  | 'spatial:back'

export interface SpatialEventDetail {
  direction: Direction | null
  from: HTMLElement | null
  /** Adapter id ('keyboard', 'gamepad', …) or 'api' for programmatic calls. */
  source: string
  /** How long the activate control was held, on 'spatial:activaterelease'. */
  durationMs?: number
  /**
   * True when this move came from a *held* direction rather than a discrete
   * press. Accelerated list scrolling — "hold down to speed up, then jump by
   * section" — needs to tell the two apart, and only the adapter knows.
   * Absent for non-directional events and programmatic calls.
   */
  repeat?: boolean
}

export type SpatialEvent = CustomEvent<SpatialEventDetail>

/** Dispatch a spatial event. Returns false if a listener called preventDefault(). */
export function dispatchSpatialEvent(
  target: EventTarget,
  type: SpatialEventType,
  detail: SpatialEventDetail,
  cancelable = false,
): boolean {
  const node = target as EventTarget & { nodeType?: number; ownerDocument?: Document | null }
  const doc = node.nodeType === 9 ? (target as Document) : node.ownerDocument
  const EventConstructor =
    doc?.defaultView?.CustomEvent ?? (typeof CustomEvent !== 'undefined' ? CustomEvent : null)
  if (!EventConstructor) {
    throw new Error('spatial-nav-css cannot dispatch DOM events without a CustomEvent implementation')
  }
  return target.dispatchEvent(
    new EventConstructor(type, { detail, bubbles: true, composed: true, cancelable }),
  )
}
