export type Direction = 'up' | 'down' | 'left' | 'right'

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right']

/** Axis-aligned rectangle in viewport coordinates (a plain-object DOMRect). */
export interface NavRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface Candidate<T = HTMLElement> {
  element: T
  rect: NavRect
}

/** Tunables for the distance function. See geometry.ts for the model. */
export interface ScoringOptions {
  /**
   * Penalty multiplier applied to the off-axis travel needed to reach the
   * candidate (distance from the origin's center to the candidate's span on
   * the orthogonal axis). Higher values prefer staying in the same
   * row/column.
   */
  orthogonalWeight: number
  /**
   * Weight of the center-to-center orthogonal offset, used as a "most in
   * line" tie-break. Kept well below 1 so displaced centers influence the
   * result less than the primary distance terms in ordinary layouts.
   */
  centerWeight: number
  /**
   * Minimum orthogonal overlap — as a fraction of the smaller of the origin's
   * and candidate's extents on that axis — for a candidate to count as
   * "aligned" (same row/column).
   * A 1px sliver overlap should not grant same-row priority over a near
   * diagonal neighbor; 0.2 requires a meaningful overlap relative to the
   * narrower projected span. Set 0 for any-overlap alignment. Engine options
   * accept a finite value from 0 through 1.
   */
  alignedOverlapRatio: number
  /**
   * Flat penalty added to candidates whose projection on the orthogonal axis
   * does not meet `alignedOverlapRatio` (i.e. not meaningfully in the same
   * row/column). Large by default so aligned candidates dominate ordinary
   * viewport-scale layouts.
   */
  misalignedPenalty: number
}

export const DEFAULT_SCORING: ScoringOptions = {
  orthogonalWeight: 5,
  centerWeight: 0.1,
  alignedOverlapRatio: 0.2,
  misalignedPenalty: 1_000_000,
}

/** Parsed per-element navigation config (from CSS custom props + data attributes). */
export interface ElementNavConfig {
  /** Explicit per-direction override: a CSS selector, or 'none' to block. */
  explicit: Partial<Record<Direction, string>>
  /** Element is a spatial navigation container (focus group). */
  isContainer: boolean
  /** Focus may not leave this container via spatial navigation. */
  trap: boolean
  /** Navigation wraps around edges inside this container. */
  wrap: boolean
  /** Container remembers its last focused child and restores it on re-entry. */
  remember: boolean
  /** Element is the preferred initial focus of its container. */
  defaultFocus: boolean
}
