import { describe, expect, it } from 'vitest'
import { aggregateSmall, layoutTreemap, type TreemapBlock, type TreemapItem } from './treemap'

const BOX = { x: 0, y: 0, w: 600, h: 400 }

const items = (...sizes: number[]): TreemapItem[] =>
  sizes.map((size, i) => ({ id: `i${i}`, size }))

const area = (b: TreemapBlock) => b.w * b.h

const overlaps = (a: TreemapBlock, b: TreemapBlock): boolean =>
  a.x < b.x + b.w - 1e-6 &&
  b.x < a.x + a.w - 1e-6 &&
  a.y < b.y + b.h - 1e-6 &&
  b.y < a.y + a.h - 1e-6

const aspect = (b: TreemapBlock) => Math.max(b.w / b.h, b.h / b.w)

describe('layoutTreemap', () => {
  it('gives every block an area proportional to its size', () => {
    const input = items(400, 200, 120, 90, 60, 40, 25, 10)
    const total = input.reduce((sum, i) => sum + i.size, 0)
    const blocks = layoutTreemap(input, BOX)

    expect(blocks).toHaveLength(input.length)
    for (const block of blocks) {
      expect(area(block)).toBeCloseTo((block.size / total) * BOX.w * BOX.h, 4)
    }
  })

  it('tiles the rect exactly — the areas sum to the whole box', () => {
    const blocks = layoutTreemap(items(9, 7, 6, 5, 4, 3, 2, 2, 1), BOX)
    const covered = blocks.reduce((sum, b) => sum + area(b), 0)
    expect(covered).toBeCloseTo(BOX.w * BOX.h, 4)
  })

  it('produces no overlaps', () => {
    const blocks = layoutTreemap(items(500, 300, 220, 180, 140, 100, 70, 55, 30, 12), BOX)
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        expect(overlaps(blocks[i] as TreemapBlock, blocks[j] as TreemapBlock)).toBe(false)
      }
    }
  })

  it('keeps every block inside the bounds it was given', () => {
    const rect = { x: 24, y: 160, w: 700, h: 500 }
    const blocks = layoutTreemap(items(80, 61, 44, 39, 22, 17, 9, 5, 3), rect)
    for (const block of blocks) {
      expect(block.x).toBeGreaterThanOrEqual(rect.x - 1e-6)
      expect(block.y).toBeGreaterThanOrEqual(rect.y - 1e-6)
      expect(block.x + block.w).toBeLessThanOrEqual(rect.x + rect.w + 1e-6)
      expect(block.y + block.h).toBeLessThanOrEqual(rect.y + rect.h + 1e-6)
      expect(block.w).toBeGreaterThan(0)
      expect(block.h).toBeGreaterThan(0)
    }
  })

  it('keeps aspect ratios navigable — that is the point of squarifying', () => {
    // Slice-and-dice on this input would produce 600x2 slivers. Squarified
    // keeps everything within a ratio a D-pad can cross.
    const blocks = layoutTreemap(items(300, 250, 200, 160, 120, 90, 70, 50, 35, 20), BOX)
    for (const block of blocks) expect(aspect(block)).toBeLessThan(5)
    const worst = Math.max(...blocks.map(aspect))
    expect(worst).toBeLessThan(3)
  })

  it('is deterministic and independent of input order', () => {
    const input = items(50, 30, 30, 20, 10, 5)
    const shuffled = [...input].reverse()
    expect(layoutTreemap(shuffled, BOX)).toEqual(layoutTreemap(input, BOX))
  })

  it('orders blocks largest-first, ties broken by id', () => {
    const blocks = layoutTreemap(
      [
        { id: 'zulu', size: 10 },
        { id: 'alpha', size: 10 },
        { id: 'big', size: 40 },
      ],
      BOX,
    )
    expect(blocks.map((b) => b.id)).toEqual(['big', 'alpha', 'zulu'])
  })

  it('lays a single item across the whole rect', () => {
    expect(layoutTreemap(items(7), BOX)).toEqual([{ id: 'i0', size: 7, ...BOX }])
  })

  it('drops non-positive sizes rather than emitting unreachable zero-area blocks', () => {
    const blocks = layoutTreemap(
      [
        { id: 'real', size: 10 },
        { id: 'empty', size: 0 },
        { id: 'bogus', size: -5 },
      ],
      BOX,
    )
    expect(blocks.map((b) => b.id)).toEqual(['real'])
  })

  it('returns nothing for a degenerate rect or an empty input', () => {
    expect(layoutTreemap(items(1, 2), { x: 0, y: 0, w: 0, h: 400 })).toEqual([])
    expect(layoutTreemap(items(1, 2), { x: 0, y: 0, w: 600, h: -1 })).toEqual([])
    expect(layoutTreemap([], BOX)).toEqual([])
  })

  it('survives an extreme size spread without producing a zero-height block', () => {
    const blocks = layoutTreemap(items(1_000_000, 5, 4, 3, 2, 1), BOX)
    expect(blocks).toHaveLength(6)
    for (const block of blocks) {
      expect(block.w).toBeGreaterThan(0)
      expect(block.h).toBeGreaterThan(0)
    }
  })
})

describe('aggregateSmall', () => {
  it('folds the long tail into one block that carries the folded total', () => {
    const input = [{ id: 'big', size: 900 }, ...items(4, 3, 2, 1)]
    const { items: out, folded } = aggregateSmall(input, { minShare: 0.01 })

    expect(out.map((i) => i.id)).toEqual(['big', '__other__'])
    expect(out[1]?.size).toBe(10)
    expect(folded).toEqual(['i0', 'i1', 'i2', 'i3'])
  })

  it('leaves a map alone when every item is big enough', () => {
    const input = items(40, 30, 30)
    expect(aggregateSmall(input, { minShare: 0.01 })).toEqual({ items: input, folded: [] })
  })

  it('keeps a lone small item rather than folding one item into "other"', () => {
    const { items: out, folded } = aggregateSmall([{ id: 'big', size: 999 }, { id: 'tiny', size: 1 }], {
      minShare: 0.01,
    })
    expect(out.map((i) => i.id)).toEqual(['big', 'tiny'])
    expect(folded).toEqual([])
  })

  it('caps the block count, reserving a slot for the aggregate', () => {
    const input = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, size: 100 - i }))
    const { items: out, folded } = aggregateSmall(input, { minShare: 0, maxBlocks: 10 })

    expect(out).toHaveLength(10)
    expect(out.at(-1)?.id).toBe('__other__')
    expect(folded).toHaveLength(31)
    // Nothing is lost: the folded sizes all end up in the aggregate.
    const total = input.reduce((sum, i) => sum + i.size, 0)
    expect(out.reduce((sum, i) => sum + i.size, 0)).toBe(total)
  })

  it('preserves the total, so the map still represents the drive honestly', () => {
    const input = items(500, 120, 60, 9, 8, 7, 6, 5, 4, 3, 2, 1)
    const total = input.reduce((sum, i) => sum + i.size, 0)
    const { items: out } = aggregateSmall(input, { minShare: 0.02 })
    expect(out.reduce((sum, i) => sum + i.size, 0)).toBe(total)
  })

  it('returns nothing when there is nothing with size', () => {
    expect(aggregateSmall([{ id: 'a', size: 0 }])).toEqual({ items: [], folded: [] })
  })
})
