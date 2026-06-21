import type { NavRect } from '../src/core/types'

/** Build a NavRect from (left, top, width, height). */
export function rect(left: number, top: number, width: number, height: number): NavRect {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

export type LayoutMap = Record<string, [left: number, top: number, width: number, height: number]>

/** Rect provider keyed by element id, for driving the engine in jsdom. */
export function rectProvider(layout: LayoutMap): (el: HTMLElement) => NavRect {
  return (el) => {
    const r = layout[el.id]
    if (!r) return rect(0, 0, 0, 0)
    return rect(r[0], r[1], r[2], r[3])
  }
}
