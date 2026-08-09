/**
 * Accelerated list scrolling — "hold down to go faster, then jump by section".
 *
 * Every console library does this, and none of it can live in the engine: the
 * engine's job is one press, one move. What it *does* give us is
 * `detail.repeat`, which distinguishes a held control from a discrete press.
 * Only the input adapter knows that, and re-deriving it from event timing is
 * both fiddly and wrong on a gamepad (stick repeat has its own cadence).
 *
 * The escalation, matching the feel of SteamOS / tvOS libraries:
 *
 *   presses 1..N        one item          — precise, for aiming
 *   held, N..M          `stride` items    — covering ground
 *   held beyond M       next section      — the alphabet jump
 *
 * A discrete press always resets to stage one, so tapping is never
 * accelerated: the user is aiming, not travelling.
 */
import { useCallback, useEffect, useRef } from 'react'
import type { SpatialEvent } from 'spatial-nav-css'

export interface FastScrollOptions {
  /** The scrolling region. Only moves originating inside it are accelerated. */
  containerRef: { current: HTMLElement | null }
  /** Which axis this list scrolls on. Cross-axis moves are left alone. */
  axis?: 'vertical' | 'horizontal'
  /** Total item count, for clamping. */
  count: () => number
  /** Index of the currently focused item, or -1. */
  indexOf: (el: HTMLElement) => number
  /** Focus the item at an index; return false if it could not be focused. */
  focusIndex: (index: number) => boolean
  /** First index of the section containing `index`, in the given direction. */
  sectionEdge: (index: number, delta: 1 | -1) => number
  /** Repeats before the stride stage. Default 4. */
  strideAfter?: number
  /** Repeats before the section stage. Default 12. */
  sectionAfter?: number
  /** Items per step during the stride stage. Default 5. */
  stride?: number
  /** Called with the current stage, for a scroll-position/section indicator. */
  onStageChange?: (stage: FastScrollStage) => void
  enabled?: boolean
}

export type FastScrollStage = 'item' | 'stride' | 'section'

export function useFastScroll(options: FastScrollOptions): { reset: () => void } {
  const { containerRef, enabled = true } = options

  // Kept in refs: this runs inside a DOM event handler, and re-rendering per
  // keypress at 90 Hz is exactly the cost we are trying to avoid.
  const repeats = useRef(0)
  const stage = useRef<FastScrollStage>('item')
  const latest = useRef(options)
  latest.current = options

  const setStage = useCallback(
    (next: FastScrollStage) => {
      if (stage.current === next) return
      stage.current = next
      latest.current.onStageChange?.(next)
    },
    [],
  )

  const reset = useCallback(() => {
    repeats.current = 0
    setStage('item')
  }, [setStage])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) return

    const onBeforeFocus = (event: Event) => {
      // Read every option through the ref. Consumers pass these inline, so
      // depending on their identity would tear this listener down — and reset
      // the hold — on every render, which is exactly what a fast scroll
      // causes. The effect below depends only on genuinely stable values.
      const {
        axis: currentAxis = 'vertical',
        count: currentCount,
        indexOf: currentIndexOf,
        focusIndex: currentFocusIndex,
        sectionEdge: currentSectionEdge,
        strideAfter: currentStrideAfter = 4,
        sectionAfter: currentSectionAfter = 12,
        stride: currentStride = 5,
      } = latest.current
      const detail = (event as SpatialEvent).detail
      const direction = detail.direction
      if (!direction) return

      const onAxis =
        currentAxis === 'vertical'
          ? direction === 'up' || direction === 'down'
          : direction === 'left' || direction === 'right'
      if (!onAxis) {
        reset()
        return
      }

      // `from` is where the move started. Only accelerate moves that begin
      // inside this list — entering it from outside is a normal single step.
      const from = detail.from
      if (!from || !container.contains(from)) {
        reset()
        return
      }

      if (!detail.repeat) {
        // A deliberate, discrete press: the user is aiming. Never accelerate.
        reset()
        return
      }

      repeats.current += 1
      const next =
        repeats.current >= currentSectionAfter
          ? 'section'
          : repeats.current >= currentStrideAfter
            ? 'stride'
            : 'item'
      setStage(next)
      if (next === 'item') return

      const index = currentIndexOf(from)
      if (index < 0) return
      const delta: 1 | -1 = direction === 'down' || direction === 'right' ? 1 : -1
      const total = currentCount()

      let target: number
      if (next === 'section') {
        target = currentSectionEdge(index, delta)
        // A section edge that does not move would stall the hold; fall back
        // to a stride so the list keeps travelling.
        if (target === index) target = index + delta * currentStride
      } else {
        target = index + delta * currentStride
      }
      target = Math.max(0, Math.min(total - 1, target))
      if (target === index) return

      // Only veto the engine's one-step move if we actually made a bigger
      // one. Vetoing unconditionally would swallow the press whenever the
      // target could not be focused — a windowed row that is not mounted, say
      // — and the list would freeze under a held control with no explanation.
      if (currentFocusIndex(target)) event.preventDefault()
    }

    // Release/blur ends the hold. `keyup` covers keyboard; the engine's
    // activate-cancel and a plain blur cover the controller and tab-out.
    const onRelease = () => reset()

    const doc = container.ownerDocument
    container.addEventListener('spatial:beforefocus', onBeforeFocus)
    doc.addEventListener('keyup', onRelease)
    doc.defaultView?.addEventListener('blur', onRelease)
    return () => {
      container.removeEventListener('spatial:beforefocus', onBeforeFocus)
      doc.removeEventListener('keyup', onRelease)
      doc.defaultView?.removeEventListener('blur', onRelease)
      reset()
    }
    // Deliberately minimal: only values whose change genuinely requires a
    // different listener. Everything else is read from `latest` above.
  }, [containerRef, enabled, reset, setStage])

  return { reset }
}

/**
 * Section boundaries for an alphabetically sorted list: the index of the first
 * item whose section differs from the current one, walking in `delta`.
 *
 * Returns the *start* of the next section going forwards, and the start of the
 * previous section going backwards — the same asymmetry a scrollbar's letter
 * rail has, so a held press lands on "F", then "G", rather than on the last
 * item of each.
 */
export function sectionEdgeFor(
  sections: readonly string[],
  index: number,
  delta: 1 | -1,
): number {
  const current = sections[index]
  if (current === undefined) return index
  if (delta === 1) {
    for (let i = index + 1; i < sections.length; i++) {
      if (sections[i] !== current) return i
    }
    return sections.length - 1
  }
  // Backwards: find the start of this section; if we are already on it, find
  // the start of the one before.
  let start = index
  while (start > 0 && sections[start - 1] === current) start--
  if (start < index) return start
  if (start === 0) return 0
  const previous = sections[start - 1]
  let previousStart = start - 1
  while (previousStart > 0 && sections[previousStart - 1] === previous) previousStart--
  return previousStart
}
