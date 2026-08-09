/**
 * A tiny layout engine for jsdom.
 *
 * jsdom performs no layout, so every element reports a zero rect and spatial
 * navigation has nothing to measure. The library's own unit tests dodge this
 * by injecting `getRect` keyed by element id, which does not scale to
 * app-shaped examples with hundreds of nodes.
 *
 * Instead, describe the page the way a designer would — "these cards are a
 * 4-column grid at x=260" — and this assigns matching rectangles by stubbing
 * getBoundingClientRect. The engine then runs its real measurement path.
 *
 * Call `applyLayout` again after any render that adds nodes (data arriving,
 * a dialog opening); it is cheap and idempotent.
 */

export interface Box {
  x: number
  y: number
  /** Width of one item. */
  w: number
  /** Height of one item. */
  h: number
  /** Space between items on both axes. Default 8. */
  gap?: number
}

export type LayoutRule = Box & {
  selector: string
  /**
   * 'row' places matches left to right, 'column' top to bottom, and a number
   * places them in that many columns, row-major.
   */
  flow: 'row' | 'column' | number
  /** Place only the first N matches (the rest collapse to a zero rect). */
  limit?: number
  /** Search inside this root instead of the document. */
  root?: ParentNode
}

const RECT = Symbol('spatial-example-rect')

interface Stubbed extends HTMLElement {
  [RECT]?: DOMRect
}

function rectFor(x: number, y: number, w: number, h: number): DOMRect {
  return {
    x,
    y,
    left: x,
    top: y,
    right: x + w,
    bottom: y + h,
    width: w,
    height: h,
    toJSON() {
      return this
    },
  } as DOMRect
}

function assign(el: HTMLElement, rect: DOMRect): void {
  const target = el as Stubbed
  target[RECT] = rect
  if (el.getBoundingClientRect !== boundFromStub) {
    el.getBoundingClientRect = boundFromStub
  }
}

function boundFromStub(this: Stubbed): DOMRect {
  return this[RECT] ?? rectFor(0, 0, 0, 0)
}

/**
 * Apply layout rules. Later rules win when selectors overlap, so put general
 * rules first and specific overrides after.
 */
export function applyLayout(rules: LayoutRule[]): void {
  for (const rule of rules) {
    const scope = rule.root ?? document
    const gap = rule.gap ?? 8
    const matches = [...scope.querySelectorAll<HTMLElement>(rule.selector)]
    const limit = rule.limit ?? matches.length
    matches.slice(0, limit).forEach((el, i) => {
      const columns = typeof rule.flow === 'number' ? rule.flow : rule.flow === 'row' ? Infinity : 1
      const col = columns === Infinity ? i : i % columns
      const row = columns === Infinity ? 0 : Math.floor(i / columns)
      assign(el, rectFor(rule.x + col * (rule.w + gap), rule.y + row * (rule.h + gap), rule.w, rule.h))
    })
  }
}

/** Give one element an explicit rect (containers, panels, oddly placed nodes). */
export function setRect(el: HTMLElement | null, box: Box): void {
  if (el) assign(el, rectFor(box.x, box.y, box.w, box.h))
}

/**
 * Engine options that make an example deterministic under jsdom while still
 * exercising the library's real geometry path (no getRect injection).
 *
 * `visibilityFilter` replaces only the *rendering* check — jsdom paints
 * nothing, so every element would otherwise be invisible. The engine still
 * enforces its semantic policy (`aria-hidden`, `inert`, `hidden`, an open
 * modal) on top of this, which is what keeps focus inside a portaled overlay
 * in these tests exactly as it does in a browser.
 */
export const layoutNavOptions = {
  adapters: [],
  visibilityFilter: () => true,
  scrollBehavior: false as const,
}
