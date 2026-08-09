/**
 * Virtualized-list bridge for spatial-nav-css.
 *
 * Virtualizers (TanStack Virtual, react-window, custom windowing) only mount
 * items near the viewport, so geometric navigation stops at the last
 * *mounted* item — the engine fires `spatial:nofocustarget` there. This
 * helper completes the pattern: compute the next index, ask the virtualizer
 * to scroll, wait for the item to mount, focus it.
 *
 * It is DOM-level and framework-agnostic, so it can bridge TanStack Virtual
 * integrations or hand-rolled windowing without depending on a framework:
 *
 *   const cleanup = attachVirtualEdges(nav, {
 *     zone: scrollerEl,                       // the data-spatial-container
 *     count: () => virtualizer.options.count,
 *     scrollToIndex: (i) => virtualizer.scrollToIndex(i),
 *   })
 *
 * Items must carry their index (data-index by default — TanStack's
 * convention for dynamic measurement already puts it there).
 *
 * React Aria collections may instead own their oriented arrow-key behavior
 * and virtualization internally. Test that integration's actual roving-
 * tabindex and edge-key behavior (see spatial-nav-css/react-aria).
 */
import type { Direction } from '../core/types'
import { isHTMLElementNode } from '../core/dom'

/** The subset of SpatialNavigation the helper needs. */
export interface FocusHost {
  focus(target: HTMLElement | string): boolean
  getFocused(): HTMLElement | null
}

export interface VirtualEdgeOptions {
  /** The virtualized container (usually also a data-spatial-container). */
  zone: HTMLElement
  /** Total item count (mounted and unmounted). */
  count: () => number
  /** Ask the virtualizer to bring an index into the mounted window. */
  scrollToIndex: (index: number) => void
  /** Scroll axis; used by the default `step`. Default 'vertical'. */
  axis?: 'vertical' | 'horizontal'
  /**
   * Next index for a navigation past the mounted edge, or null to let the
   * edge stand. Override for grids (e.g. `i + columns` for 'down').
   * Default: ±1 along `axis`.
   *
   * `repeat` is true when the press came from a *held* control. A list long
   * enough to need virtualizing is long enough that holding a direction
   * should cover ground faster than one item per press — return a larger
   * jump for those, the way the mounted part of the list does.
   */
  step?: (index: number, direction: Direction, repeat: boolean) => number | null
  /** Read an item's index. Default: Number(el.dataset.index). */
  getIndex?: (el: HTMLElement) => number | null
  /** Find the mounted element for an index. Default: [data-index="i"] inside zone. */
  findElement?: (index: number) => HTMLElement | null
  /** Await one re-render. Default: a macrotask (covers React/Vue/Svelte flushes). */
  settle?: () => Promise<void>
  /** How many settle rounds to wait for the item to mount. Default 20. */
  maxAttempts?: number
}

function defaultStep(axis: 'vertical' | 'horizontal') {
  return (index: number, direction: Direction): number | null => {
    if (axis === 'vertical') {
      if (direction === 'down') return index + 1
      if (direction === 'up') return index - 1
      return null
    }
    if (direction === 'right') return index + 1
    if (direction === 'left') return index - 1
    return null
  }
}

/**
 * Listen for navigation hitting the mounted edge inside `zone` and continue
 * it through the virtualizer. Returns a cleanup function.
 */
export function attachVirtualEdges(nav: FocusHost, options: VirtualEdgeOptions): () => void {
  const axis = options.axis ?? 'vertical'
  const step = options.step ?? defaultStep(axis)
  const getIndex =
    options.getIndex ??
    ((el: HTMLElement) => {
      const raw = el.dataset.index
      if (raw === undefined) return null
      const n = Number(raw)
      return Number.isSafeInteger(n) ? n : null
    })
  const findElement =
    options.findElement ??
    ((index: number) => options.zone.querySelector<HTMLElement>(`[data-index="${index}"]`))
  const settle = options.settle ?? (() => new Promise<void>((r) => setTimeout(r, 0)))
  const maxAttempts = options.maxAttempts ?? 20
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 0) {
    throw new RangeError('VirtualEdgeOptions.maxAttempts must be a non-negative safe integer')
  }

  let pending = 0 // token to cancel a stale advance when a newer one starts

  const onEdge = (event: Event): void => {
    const detail = (event as CustomEvent<{ direction: Direction | null; repeat?: boolean }>).detail
    const origin = event.target
    if (!detail?.direction || !isHTMLElementNode(origin)) return
    const index = getIndex(origin)
    if (index === null) return
    const next = step(index, detail.direction, detail.repeat === true)
    const count = options.count()
    if (!Number.isSafeInteger(count) || count < 0) return
    if (next === null || !Number.isSafeInteger(next) || next < 0 || next >= count) return

    const token = ++pending
    options.scrollToIndex(next)
    void (async () => {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const el = findElement(next)
        if (el && nav.focus(el)) return
        await settle()
        if (token !== pending) return // a newer advance superseded this one
        // Focus left the origin some other way (pointer, programmatic, a
        // different item) — this advance is stale; do not reclaim focus.
        const focused = nav.getFocused()
        if (focused && focused !== origin) return
        if (!focused) {
          const doc = origin.ownerDocument
          const active = doc.activeElement
          if (active && active !== doc.body && active !== doc.documentElement) return
        }
      }
    })()
  }

  options.zone.addEventListener('spatial:nofocustarget', onEdge)
  return () => {
    pending++
    options.zone.removeEventListener('spatial:nofocustarget', onEdge)
  }
}
