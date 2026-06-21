/**
 * Virtualized-list bridge for spatial-nav-css.
 *
 * Virtualizers (TanStack Virtual, react-window, custom windowing) only mount
 * items near the viewport, so geometric navigation stops at the last
 * *mounted* item — the engine fires `spatial:nofocustarget` there. This
 * helper completes the pattern: compute the next index, ask the virtualizer
 * to scroll, wait for the item to mount, focus it.
 *
 * It is DOM-level and framework-agnostic — the same helper drives TanStack
 * Virtual's React/Vue/Svelte/Solid adapters and hand-rolled windowing:
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
 * React Aria's Virtualizer needs none of this: RAC collections own arrow
 * keys along their orientation and virtualize internally, so the collection
 * stays a single spatial stop (see spatial-nav-css/react-aria).
 */
import type { Direction } from '../core/types'

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
   */
  step?: (index: number, direction: Direction) => number | null
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
      return Number.isNaN(n) ? null : n
    })
  const findElement =
    options.findElement ??
    ((index: number) => options.zone.querySelector<HTMLElement>(`[data-index="${index}"]`))
  const settle = options.settle ?? (() => new Promise<void>((r) => setTimeout(r, 0)))
  const maxAttempts = options.maxAttempts ?? 20

  let pending = 0 // token to cancel a stale advance when a newer one starts

  const onEdge = (event: Event): void => {
    const detail = (event as CustomEvent<{ direction: Direction | null }>).detail
    const origin = event.target
    if (!detail?.direction || !(origin instanceof HTMLElement)) return
    const index = getIndex(origin)
    if (index === null) return
    const next = step(index, detail.direction)
    if (next === null || next < 0 || next >= options.count()) return

    const token = ++pending
    options.scrollToIndex(next)
    void (async () => {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const el = findElement(next)
        if (el && nav.focus(el)) return
        await settle()
        if (token !== pending) return // a newer advance superseded this one
        // Focus left the origin some other way (pointer, programmatic, a
        // different item) — this advance is stale; never yank focus.
        const focused = nav.getFocused()
        if (focused && focused !== origin) return
      }
    })()
  }

  options.zone.addEventListener('spatial:nofocustarget', onEdge)
  return () => options.zone.removeEventListener('spatial:nofocustarget', onEdge)
}
