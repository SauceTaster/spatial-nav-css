/** Shape of the library grid, shared by the view and its tests. */

/**
 * A handheld has exactly one screen, so the column count is a constant rather
 * than a media query. That matters beyond styling: every vertical move in the
 * grid — the engine's one-row step, the fast-scroll stride, the virtual-edge
 * page — is arithmetic on this number, and a column count that changes under
 * the user turns a held D-pad into a diagonal.
 */
export const COLUMNS = 5

/** Fixed row height: no dynamic measurement, so no measure-then-reflow jitter. */
export const ROW_HEIGHT = 214

/**
 * Rows kept mounted beyond the visible window. Deliberately generous: the
 * engine can only navigate to elements that exist, so the overscan is what
 * makes a one-row step at the edge of the window land on a real tile instead
 * of falling through to `attachVirtualEdges`.
 */
export const OVERSCAN = 6

/**
 * Fallback size for the scroller when it measures 0×0 — server rendering, a
 * hidden tab, and jsdom all report that. TanStack Virtual bails out of
 * `calculateRange` at size 0 and renders no rows at all, so without this the
 * grid is silently empty rather than visibly broken.
 */
export const GRID_FALLBACK_SIZE = { width: 860, height: 620 }

/** Rows the stride stage covers per press. Whole rows, or the hold drifts. */
export const STRIDE_ROWS = 3

/**
 * Offered as filter values rather than derived from the loaded page: the page
 * is already filtered, so deriving would make the genre list collapse as you
 * use it.
 */
export const GENRES = [
  'Action',
  'RPG',
  'Strategy',
  'Roguelike',
  'Simulation',
  'Puzzle',
  'Racing',
  'Co-op',
  'Metroidvania',
  'Souls-like',
  'Shooter',
  'Farming',
] as const
