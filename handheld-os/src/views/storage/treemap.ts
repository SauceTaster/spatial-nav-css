/**
 * Squarified treemap layout — Bruls, Huizing & van Wijk (2000).
 *
 * Written here rather than pulled in from d3 for two reasons that are both
 * about navigation rather than about dependencies:
 *
 *  - Squarified is the variant that keeps blocks close to square, and a map of
 *    near-square blocks is the only kind a D-pad can cross predictably. Slice
 *    -and-dice produces 400px x 3px slivers that no distance function can
 *    disambiguate.
 *  - A pure, deterministic function is something a test can assert exact
 *    geometry against, and the spatial tests need exact geometry: they feed
 *    these rects straight into the engine as the blocks' bounding boxes.
 *
 * Coordinates are unitless, so the view lays out in a 0..100 box and renders
 * percentages. That keeps the map resolution-independent and — the part that
 * matters — means the component never has to measure itself, so there is no
 * ResizeObserver in the render path and no layout dependency in jsdom.
 */

export interface TreemapItem {
  id: string
  size: number
}

export interface TreemapRect {
  x: number
  y: number
  w: number
  h: number
}

export interface TreemapBlock extends TreemapRect {
  id: string
  size: number
}

/**
 * Deterministic order: largest first, ties broken by id. Squarify's output
 * depends on input order, so an unstable sort would mean the map reshuffled
 * between renders of identical data.
 */
function ordered(items: readonly TreemapItem[]): TreemapItem[] {
  return items
    .filter((item) => item.size > 0)
    .sort((a, b) => b.size - a.size || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * The worst (largest) aspect ratio in a row, given the pixel areas already in
 * it and the length of the side it is laid along. This is the quantity
 * squarify minimises.
 */
function worstRatio(areas: readonly number[], side: number): number {
  let sum = 0
  let min = Number.POSITIVE_INFINITY
  let max = 0
  for (const area of areas) {
    sum += area
    if (area < min) min = area
    if (area > max) max = area
  }
  if (sum <= 0 || side <= 0) return Number.POSITIVE_INFINITY
  const sum2 = sum * sum
  const side2 = side * side
  return Math.max((side2 * max) / sum2, sum2 / (side2 * min))
}

/**
 * Lay `items` out inside `rect`. Each block's area is proportional to its
 * size; blocks tile the rect exactly, with no overlaps and no gaps.
 *
 * Items with a non-positive size are dropped rather than given a zero-area
 * block: the engine skips candidates whose width and height are both
 * non-positive, so such a block would be a stop the highlight could never
 * reach, and drawing it would misreport the disk.
 */
export function layoutTreemap(items: readonly TreemapItem[], rect: TreemapRect): TreemapBlock[] {
  const sorted = ordered(items)
  if (sorted.length === 0 || rect.w <= 0 || rect.h <= 0) return []

  const blocks: TreemapBlock[] = []
  let free: TreemapRect = { ...rect }
  let remaining = sorted.reduce((sum, item) => sum + item.size, 0)
  let index = 0

  while (index < sorted.length && free.w > 0 && free.h > 0 && remaining > 0) {
    const side = Math.min(free.w, free.h)
    const areaPerUnit = (free.w * free.h) / remaining

    // Grow the row while adding the next item improves (or holds) its worst
    // aspect ratio; stop as soon as it would get worse.
    const row: TreemapItem[] = []
    const areas: number[] = []
    let best = Number.POSITIVE_INFINITY
    while (index < sorted.length) {
      const item = sorted[index] as TreemapItem
      const ratio = worstRatio([...areas, item.size * areaPerUnit], side)
      if (row.length > 0 && ratio > best) break
      row.push(item)
      areas.push(item.size * areaPerUnit)
      best = ratio
      index += 1
    }

    const rowSize = row.reduce((sum, item) => sum + item.size, 0)
    const rowArea = areas.reduce((sum, area) => sum + area, 0)
    const done = index >= sorted.length
    // The strip runs along the shorter side, which is what keeps blocks square.
    const alongX = free.w <= free.h

    if (alongX) {
      // The last strip takes whatever height is left, so accumulated floating
      // point error can never leave a sliver of unpainted rect behind.
      const stripH = done ? free.h : Math.min(rowArea / free.w, free.h)
      if (stripH <= 0) break
      let x = free.x
      row.forEach((item, i) => {
        const last = i === row.length - 1
        const w = last ? free.x + free.w - x : (areas[i] as number) / stripH
        blocks.push({ id: item.id, size: item.size, x, y: free.y, w, h: stripH })
        x += w
      })
      free = { x: free.x, y: free.y + stripH, w: free.w, h: free.h - stripH }
    } else {
      const stripW = done ? free.w : Math.min(rowArea / free.h, free.w)
      if (stripW <= 0) break
      let y = free.y
      row.forEach((item, i) => {
        const last = i === row.length - 1
        const h = last ? free.y + free.h - y : (areas[i] as number) / stripW
        blocks.push({ id: item.id, size: item.size, x: free.x, y, w: stripW, h })
        y += h
      })
      free = { x: free.x + stripW, y: free.y, w: free.w - stripW, h: free.h }
    }

    remaining -= rowSize
  }

  return blocks
}

export interface AggregateOptions {
  /** Smallest share of the total an item may hold and still get its own block. */
  minShare?: number
  /** Hard cap on block count, regardless of share. */
  maxBlocks?: number
  /** Id given to the block standing in for everything folded away. */
  aggregateId?: string
}

export interface AggregateResult {
  items: TreemapItem[]
  /** Ids folded into the aggregate block, largest first. */
  folded: string[]
}

/**
 * Fold the long tail into a single block.
 *
 * A directory of 100 game folders produces blocks down to 0.05% of the map —
 * on a 700x500 panel that is a 12px square, which is a focus stop nobody can
 * see and the distance function cannot separate from its neighbours. Every
 * disk-usage tool does this; here it is a navigation requirement, not a
 * cosmetic one. Folding a *single* item is pointless, so that case keeps the
 * item itself.
 */
export function aggregateSmall(
  items: readonly TreemapItem[],
  options: AggregateOptions = {},
): AggregateResult {
  const minShare = options.minShare ?? 0.006
  const maxBlocks = options.maxBlocks ?? 28
  const aggregateId = options.aggregateId ?? '__other__'

  const sorted = ordered(items)
  const total = sorted.reduce((sum, item) => sum + item.size, 0)
  if (total <= 0) return { items: [], folded: [] }

  const kept: TreemapItem[] = []
  const folded: TreemapItem[] = []
  for (const item of sorted) {
    if (item.size / total >= minShare && kept.length < maxBlocks) kept.push(item)
    else folded.push(item)
  }

  if (folded.length === 0) return { items: kept, folded: [] }
  // The aggregate needs a slot of its own, so a full map demotes its smallest.
  if (kept.length >= maxBlocks) folded.unshift(kept.pop() as TreemapItem)
  if (folded.length === 1) return { items: [...kept, ...folded], folded: [] }

  const size = folded.reduce((sum, item) => sum + item.size, 0)
  return {
    items: [...kept, { id: aggregateId, size }],
    folded: folded.map((item) => item.id),
  }
}
