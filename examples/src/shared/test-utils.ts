import type { NavRect } from 'spatial-nav-css'

/**
 * Shared test helpers. jsdom gives every element a zero rect, so spatial
 * tests inject a `getRect` provider (an EngineOptions field) that returns a
 * deterministic layout keyed by element id — the same trick the library's own
 * tests/ use.
 */

export function rect(left: number, top: number, width: number, height: number): NavRect {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

export type LayoutMap = Record<string, [left: number, top: number, width: number, height: number]>

/** Rect provider keyed by element id. Unknown ids collapse to a zero rect. */
export function rectProvider(layout: LayoutMap): (el: HTMLElement) => NavRect {
  return (el) => {
    const r = layout[el.id]
    return r ? rect(r[0], r[1], r[2], r[3]) : rect(0, 0, 0, 0)
  }
}

/** EngineOptions that make the engine fully deterministic under jsdom. */
export function testNavOptions(layout: LayoutMap) {
  return {
    adapters: [],
    visibilityFilter: () => true,
    scrollBehavior: false as const,
    getRect: rectProvider(layout),
  }
}

/** Fire a matched keydown+keyup pair on the window (drives input adapters). */
export function press(key: string, target: EventTarget = window): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }))
}
