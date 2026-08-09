import { describe, expect, it } from 'vitest'
import {
  classifyDirection,
  distanceScore,
  findBestCandidate,
  projectedOverlap,
  unionRects,
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

  it('classifies overlapping rects by their leading edge', () => {
    expect(classifyDirection(origin, rect(150, 100, 80, 80), 'right')).toBe('overlapping')
    expect(classifyDirection(origin, rect(150, 100, 80, 80), 'left')).toBe(null)
  })

  it('does not treat a narrower rect sharing an edge as being in that direction', () => {
    // Regression: the tier compared centers, so a 1-wide cell under a 2-wide
    // one — same left edge — had a center further left and counted as "to the
    // left" of it. Pressing left in a mixed-width inventory then moved
    // diagonally down instead of leaving the row.
    const wide = rect(100, 100, 180, 80)
    const narrowBelow = rect(100, 200, 90, 80)
    expect(classifyDirection(wide, narrowBelow, 'left')).toBe(null)
    expect(classifyDirection(wide, narrowBelow, 'down')).toBe('beyond')

    // The mirrored case: a narrow cell sharing the right edge of a wide one.
    const narrowRightAligned = rect(190, 200, 90, 80)
    expect(classifyDirection(wide, narrowRightAligned, 'right')).toBe(null)

    // A genuinely overlapping rect that reaches further still qualifies.
    expect(classifyDirection(wide, rect(120, 100, 200, 80), 'right')).toBe('overlapping')
    expect(classifyDirection(wide, rect(60, 100, 100, 80), 'left')).toBe('overlapping')
  })

  it('does not treat a rect that encloses the origin as being past it', () => {
    // Regression: a full-height sticky row label sitting beside content that
    // is inset by a few pixels ends after the origin on the travel axis, so
    // an end-edge-only rule made it a "down" candidate and every downward
    // press in the row landed on the label instead of the row below.
    const inset = rect(300, 303, 120, 8) // a programme block, 4px inset
    const fullHeight = rect(100, 299, 180, 16) // the row's label cell
    expect(classifyDirection(inset, fullHeight, 'down')).toBe(null)
    expect(classifyDirection(inset, fullHeight, 'up')).toBe(null)
    // It is genuinely to the left, though.
    expect(classifyDirection(inset, fullHeight, 'left')).toBe('beyond')

    // The mirrored axis: a wide banner enclosing a narrow button horizontally.
    const button = rect(200, 0, 60, 40)
    const banner = rect(0, 60, 400, 40)
    expect(classifyDirection(button, banner, 'left')).toBe(null)
    expect(classifyDirection(button, banner, 'right')).toBe(null)
    expect(classifyDirection(button, banner, 'down')).toBe('beyond')
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

describe('unionRects', () => {
  it('returns a finite zero rect for an empty collection', () => {
    expect(unionRects([])).toEqual(rect(0, 0, 0, 0))
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

  it('lets a wide origin align with an ordinary-sized neighbour', () => {
    // Regression, from a media scrubber: the alignment threshold scaled with
    // the *origin's* extent, so a full-width control needed a neighbour 20%
    // of the viewport wide to count as being in its column. The play button
    // directly above it was "misaligned" while a distant, wider pill in the
    // corner was "aligned" — and which one won changed with the window width.
    const seekBar = rect(90, 136, 580, 40)
    const playAbove = rect(330, 76, 100, 40) // centred directly above
    const widePillFarRight = rect(540, 16, 200, 40)

    expect(
      findBestCandidate(
        seekBar,
        [
          { element: 'play', rect: playAbove },
          { element: 'pill', rect: widePillFarRight },
        ],
        'up',
      )?.element,
    ).toBe('play')

    // Both now count as aligned, so the ordinary distance terms decide.
    expect(distanceScore(seekBar, playAbove, 'up')).toBeLessThan(
      distanceScore(seekBar, widePillFarRight, 'up'),
    )
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
