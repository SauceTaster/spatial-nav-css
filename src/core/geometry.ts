import type { Direction, NavRect, ScoringOptions } from './types'
import { DEFAULT_SCORING } from './types'

export const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

export function toNavRect(r: DOMRectReadOnly): NavRect {
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
}

export function rectCenter(r: NavRect): { x: number; y: number } {
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }
}

export function isHorizontal(dir: Direction): boolean {
  return dir === 'left' || dir === 'right'
}

/** Length of the overlap of two rects projected onto one axis. <= 0 means no overlap. */
export function projectedOverlap(a: NavRect, b: NavRect, axis: 'x' | 'y'): number {
  return axis === 'x'
    ? Math.min(a.right, b.right) - Math.max(a.left, b.left)
    : Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
}

/**
 * Classify whether `candidate` lies in `dir` relative to `origin`.
 *
 *  - 'beyond':      the candidate's near edge is past the origin's far edge —
 *                   unambiguously in the direction of travel.
 *  - 'overlapping': the rects overlap on the navigation axis, but the
 *                   candidate still reaches further in the direction of
 *                   travel. A fallback tier so overlapping layouts work.
 *  - null:          not in that direction.
 *
 * The overlapping tier compares *edges*, not centers, and requires the
 * candidate to be shifted in the direction of travel rather than merely
 * larger. Both halves matter:
 *
 *  - Centers are size-dependent: a narrow item sharing its left edge with a
 *    wider one has a center further left, so it read as "to the left" of a
 *    neighbour it is only below, and pressing left in a mixed-width grid
 *    moved diagonally instead of leaving the row.
 *  - A candidate that *encloses* the origin on this axis (starts before it
 *    and ends after it) is not past it in either direction. Without the
 *    near-edge test, a full-height sticky row label beside slightly inset
 *    content captured every downward press in its row.
 */
export function classifyDirection(
  origin: NavRect,
  candidate: NavRect,
  dir: Direction,
): 'beyond' | 'overlapping' | null {
  switch (dir) {
    case 'left':
      if (candidate.right <= origin.left) return 'beyond'
      return candidate.left < origin.left && candidate.right <= origin.right ? 'overlapping' : null
    case 'right':
      if (candidate.left >= origin.right) return 'beyond'
      return candidate.right > origin.right && candidate.left >= origin.left ? 'overlapping' : null
    case 'up':
      if (candidate.bottom <= origin.top) return 'beyond'
      return candidate.top < origin.top && candidate.bottom <= origin.bottom ? 'overlapping' : null
    case 'down':
      if (candidate.top >= origin.bottom) return 'beyond'
      return candidate.bottom > origin.bottom && candidate.top >= origin.top ? 'overlapping' : null
  }
}

/**
 * Distance score between origin and a candidate for a given direction.
 * Lower is better.
 *
 * The model is inspired by the CSS Spatial Navigation Level 1 Working Draft
 * distance function, simplified for predictability:
 *
 *   score = euclideanGap                    // distance between closest edges
 *         + spanOffset * orthogonalWeight   // real off-axis travel needed
 *         + centerOffset * centerWeight     // mild "most in line" tie-break
 *         + (aligned ? 0 : misalignedPenalty)  // same-row/column grouping
 *
 * spanOffset is the distance from the origin's center to the candidate's
 * *span* on the orthogonal axis — zero when the origin sits laterally within
 * the candidate. This matters for zone candidates: a wide scrolled carousel
 * band that laterally contains the origin needs no off-axis travel and must
 * not be penalized for its breadth (its center can be far off to one side).
 * centerOffset (lightly weighted) then prefers the most in-line candidate
 * among otherwise-equal ones while reducing a wide zone's displaced-center
 * influence in ordinary layouts.
 *
 * "Aligned" means the projections on the axis orthogonal to `dir` overlap —
 * i.e. the candidate is in the same row (for left/right) or column (for
 * up/down). With the default finite penalty, aligned candidates dominate
 * ordinary viewport-scale layouts, keeping rightward moves in the row.
 */
export function distanceScore(
  origin: NavRect,
  candidate: NavRect,
  dir: Direction,
  scoring: ScoringOptions = DEFAULT_SCORING,
): number {
  const gapX = Math.max(candidate.left - origin.right, origin.left - candidate.right, 0)
  const gapY = Math.max(candidate.top - origin.bottom, origin.top - candidate.bottom, 0)
  const euclidean = Math.hypot(gapX, gapY)

  const co = rectCenter(origin)
  const cc = rectCenter(candidate)
  const horizontal = isHorizontal(dir)
  const spanOffset = horizontal
    ? Math.max(candidate.top - co.y, co.y - candidate.bottom, 0)
    : Math.max(candidate.left - co.x, co.x - candidate.right, 0)
  const centerOffset = horizontal ? Math.abs(cc.y - co.y) : Math.abs(cc.x - co.x)
  const overlap = projectedOverlap(origin, candidate, horizontal ? 'y' : 'x')
  // Sliver overlaps don't count as same-row/column: require the overlap to be
  // a meaningful fraction of the *smaller* of the two extents (see
  // ScoringOptions.alignedOverlapRatio).
  //
  // Measuring against the origin alone made the test scale with the origin's
  // size: a full-width control — a scrubber, a wide search field — could not
  // be "aligned" with an ordinary button at all, because no button is 20% as
  // wide as the viewport. A distant, wider neighbour would then beat the one
  // directly above it, and which one won changed with the window width.
  // Against the smaller extent, "do these two share a row/column?" means the
  // same thing whichever of them you are standing on.
  const originExtent = horizontal ? origin.height : origin.width
  const candidateExtent = horizontal ? candidate.height : candidate.width
  const reference = Math.min(originExtent, candidateExtent)
  const aligned = overlap > 0 && overlap >= reference * scoring.alignedOverlapRatio

  return (
    euclidean +
    spanOffset * scoring.orthogonalWeight +
    centerOffset * scoring.centerWeight +
    (aligned ? 0 : scoring.misalignedPenalty)
  )
}

export interface BestCandidateResult<T> {
  element: T
  rect: NavRect
  score: number
}

/**
 * Pick the best candidate in `dir` from `origin`. Pure function — the engine
 * feeds it DOM rects, tests feed it synthetic ones.
 *
 * Candidates classified 'beyond' are preferred as a tier over 'overlapping'
 * ones; within a tier the lowest distance score wins.
 */
export function findBestCandidate<T>(
  origin: NavRect,
  candidates: ReadonlyArray<{ element: T; rect: NavRect }>,
  dir: Direction,
  scoring: ScoringOptions = DEFAULT_SCORING,
): BestCandidateResult<T> | null {
  let best: BestCandidateResult<T> | null = null
  let bestTier = -1 // 1 = beyond, 0 = overlapping

  for (const c of candidates) {
    if (c.rect.width <= 0 && c.rect.height <= 0) continue
    const cls = classifyDirection(origin, c.rect, dir)
    if (cls === null) continue
    const tier = cls === 'beyond' ? 1 : 0
    const score = distanceScore(origin, c.rect, dir, scoring)
    if (tier > bestTier || (tier === bestTier && best !== null && score < best.score)) {
      best = { element: c.element, rect: c.rect, score }
      bestTier = tier
    }
  }
  return best
}

/** Smallest rect covering all inputs. An empty collection returns a zero rect. */
export function unionRects(rects: ReadonlyArray<NavRect>): NavRect {
  if (rects.length === 0) {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
  }
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const r of rects) {
    if (r.left < left) left = r.left
    if (r.top < top) top = r.top
    if (r.right > right) right = r.right
    if (r.bottom > bottom) bottom = r.bottom
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

/**
 * Virtual origin used for wrap-around navigation: a zero-width/height rect
 * sitting just outside the content extent's edge *opposite* the direction of
 * travel, sharing the orthogonal extent of the previously focused rect so
 * row/column alignment is preserved.
 *
 * `container` must be the union of the candidate rects (content extent), not
 * the container element's box — in a scrollable carousel the content
 * overflows the visible box, and the origin has to clear all of it.
 */
export function wrapOrigin(container: NavRect, from: NavRect, dir: Direction): NavRect {
  switch (dir) {
    case 'right': {
      const x = container.left - 1
      return { left: x, right: x, top: from.top, bottom: from.bottom, width: 0, height: from.height }
    }
    case 'left': {
      const x = container.right + 1
      return { left: x, right: x, top: from.top, bottom: from.bottom, width: 0, height: from.height }
    }
    case 'down': {
      const y = container.top - 1
      return { left: from.left, right: from.right, top: y, bottom: y, width: from.width, height: 0 }
    }
    case 'up': {
      const y = container.bottom + 1
      return { left: from.left, right: from.right, top: y, bottom: y, width: from.width, height: 0 }
    }
  }
}
