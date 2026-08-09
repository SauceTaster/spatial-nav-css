/**
 * jsdom performs no layout, so tests describe the geometry the CSS would
 * produce and let the engine run its real measurement path (no `getRect`
 * injection — the engine calls getBoundingClientRect exactly as in a browser).
 *
 * Re-apply after any render that adds nodes.
 */

export interface Box {
  x: number
  y: number
  w: number
  h: number
  gap?: number
}

export type LayoutRule = Box & {
  selector: string
  /** 'row', 'column', or a column count for a grid (row-major). */
  flow: 'row' | 'column' | number
  root?: ParentNode
}

const RECT = Symbol('handheld-rect')

interface Stubbed extends HTMLElement {
  [RECT]?: DOMRect
}

function makeRect(x: number, y: number, w: number, h: number): DOMRect {
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

function readStub(this: Stubbed): DOMRect {
  return this[RECT] ?? makeRect(0, 0, 0, 0)
}

function assign(el: HTMLElement, rect: DOMRect): void {
  const target = el as Stubbed
  target[RECT] = rect
  if (el.getBoundingClientRect !== readStub) el.getBoundingClientRect = readStub
}

export function applyLayout(rules: LayoutRule[]): void {
  for (const rule of rules) {
    const scope = rule.root ?? document
    const gap = rule.gap ?? 8
    const matches = [...scope.querySelectorAll<HTMLElement>(rule.selector)]
    matches.forEach((el, i) => {
      const columns = typeof rule.flow === 'number' ? rule.flow : rule.flow === 'row' ? Infinity : 1
      const col = columns === Infinity ? i : i % columns
      const row = columns === Infinity ? 0 : Math.floor(i / columns)
      assign(el, makeRect(rule.x + col * (rule.w + gap), rule.y + row * (rule.h + gap), rule.w, rule.h))
    })
  }
}

/** Give one element an explicit rect (panels, containers, odd placements). */
export function setRect(el: Element | null, box: Box): void {
  if (el) assign(el as HTMLElement, makeRect(box.x, box.y, box.w, box.h))
}

/**
 * Engine options that keep a test deterministic. `visibilityFilter` replaces
 * only the *rendering* check — the engine still enforces aria-hidden / inert /
 * open-modal semantics on top, which is what keeps overlay containment honest
 * in these tests.
 */
export const testNavOptions = {
  adapters: [],
  visibilityFilter: () => true,
  scrollBehavior: false as const,
}
