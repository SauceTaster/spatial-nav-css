import { describe, expect, it } from 'vitest'
import {
  classifyDirection,
  distanceScore,
  findBestCandidate,
  projectedOverlap,
  wrapOrigin,
} from '../src/core/geometry'
import { DEFAULT_SCORING } from '../src/core/types'
import { rect } from './helpers'

describe('classifyDirection', () => {
  const origin = rect(100, 100, 80, 80)

  it('classifies rects past the far edge as beyond', () => {
    expect(classifyDirection(origin, rect(200, 100, 80, 80), 'right')).toBe('beyond')
    expect(classifyDirection(origin, rect(0, 100, 80, 80), 'left')).toBe('beyond')
    expect(classifyDirection(origin, rect(100, 0, 80, 80), 'up')).toBe('beyond')
    expect(classifyDirection(origin, rect(100, 200, 80, 80), 'down')).toBe('beyond')
  })

  it('classifies overlapping rects by center', () => {
    expect(classifyDirection(origin, rect(150, 100, 80, 80), 'right')).toBe('overlapping')
    expect(classifyDirection(origin, rect(150, 100, 80, 80), 'left')).toBe(null)
  })

  it('rejects rects in the opposite direction', () => {
    expect(classifyDirection(origin, rect(0, 100, 80, 80), 'right')).toBe(null)
    expect(classifyDirection(origin, rect(100, 200, 80, 80), 'up')).toBe(null)
  })
})

describe('projectedOverlap', () => {
  it('measures axis overlap', () => {
    expect(projectedOverlap(rect(0, 0, 100, 100), rect(50, 200, 100, 100), 'x')).toBe(50)
    expect(projectedOverlap(rect(0, 0, 100, 100), rect(200, 0, 100, 100), 'x')).toBeLessThanOrEqual(0)
  })
})

describe('distanceScore', () => {
  it('grows with distance', () => {
    const origin = rect(0, 0, 100, 100)
    const near = distanceScore(origin, rect(150, 0, 100, 100), 'right')
    const far = distanceScore(origin, rect(400, 0, 100, 100), 'right')
    expect(near).toBeLessThan(far)
  })

  it('penalizes off-axis drift', () => {
    const origin = rect(0, 0, 100, 100)
    const aligned = distanceScore(origin, rect(150, 0, 100, 100), 'right')
    const drifted = distanceScore(origin, rect(150, 40, 100, 100), 'right')
    expect(aligned).toBeLessThan(drifted)
  })
})

describe('findBestCandidate', () => {
  it('picks the straight-line neighbor in a grid, not the diagonal', () => {
    // 3x3 grid of 80x80 cells with 20px gutters
    const cell = (col: number, row: number) => rect(col * 100, row * 100, 80, 80)
    const origin = cell(1, 1)
    const candidates = [
      { element: 'up-right', rect: cell(2, 0) },
      { element: 'right', rect: cell(2, 1) },
      { element: 'down-right', rect: cell(2, 2) },
    ]
    expect(findBestCandidate(origin, candidates, 'right')?.element).toBe('right')
  })

  it('sliver overlaps below the aligned threshold do not win same-row priority', () => {
    const origin = rect(0, 0, 100, 100)
    const candidates = [
      // 8px overlap with the origin's row (8% < the 20% threshold), far away.
      { element: 'far-sliver', rect: rect(500, 92, 100, 100) },
      // No overlap at all, but right next door.
      { element: 'near-diagonal', rect: rect(150, 110, 100, 100) },
    ]
    expect(findBestCandidate(origin, candidates, 'right')?.element).toBe('near-diagonal')
    // alignedOverlapRatio: 0 restores any-overlap alignment (the old rule).
    expect(
      findBestCandidate(origin, candidates, 'right', { ...DEFAULT_SCORING, alignedOverlapRatio: 0 })
        ?.element,
    ).toBe('far-sliver')
  })

  it('prefers an aligned far candidate over a misaligned near one', () => {
    const origin = rect(0, 0, 100, 40)
    const candidates = [
      { element: 'near-misaligned', rect: rect(120, 200, 100, 40) },
      { element: 'far-aligned', rect: rect(500, 0, 100, 40) },
    ]
    expect(findBestCandidate(origin, candidates, 'right')?.element).toBe('far-aligned')
  })

  it('returns null when nothing lies in the direction', () => {
    const origin = rect(500, 0, 100, 100)
    expect(findBestCandidate(origin, [{ element: 'left', rect: rect(0, 0, 100, 100) }], 'right')).toBe(
      null,
    )
  })

  it('prefers beyond-tier candidates over overlapping ones', () => {
    const origin = rect(0, 0, 100, 100)
    const candidates = [
      { element: 'overlapping', rect: rect(40, 0, 100, 100) },
      { element: 'beyond', rect: rect(300, 0, 100, 100) },
    ]
    expect(findBestCandidate(origin, candidates, 'right')?.element).toBe('beyond')
  })
})

describe('wrapOrigin', () => {
  it('finds the row-aligned first item when wrapping right', () => {
    const container = rect(0, 0, 1000, 300)
    const from = rect(900, 0, 80, 80)
    const origin = wrapOrigin(container, from, 'right')
    const candidates = [
      { element: 'first-row-start', rect: rect(0, 0, 80, 80) },
      { element: 'second-row-start', rect: rect(0, 200, 80, 80) },
      { element: 'mid', rect: rect(450, 0, 80, 80) },
    ]
    expect(findBestCandidate(origin, candidates, 'right')?.element).toBe('first-row-start')
  })
})
