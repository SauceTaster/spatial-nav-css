import { bench, describe } from 'vitest'
import { classifyDirection, distanceScore, findBestCandidate, unionRects } from '../src/core/geometry'
import { gridCandidates, rect } from './fixtures'

const origin = rect(550, 550, 100, 100) // middle of the grid

const c100 = gridCandidates(100)
const c1k = gridCandidates(1_000)
const c10k = gridCandidates(10_000)
const rects1k = gridCandidates(1_000).map((c) => c.rect)
const neighbor = rect(660, 550, 100, 100)

describe('pure geometry (V8 hot path)', () => {
  bench('distanceScore', () => {
    distanceScore(origin, neighbor, 'right')
  })

  bench('classifyDirection', () => {
    classifyDirection(origin, neighbor, 'right')
  })

  bench('findBestCandidate — 100 candidates', () => {
    findBestCandidate(origin, c100, 'right')
  })

  bench('findBestCandidate — 1,000 candidates', () => {
    findBestCandidate(origin, c1k, 'right')
  })

  bench('findBestCandidate — 10,000 candidates', () => {
    findBestCandidate(origin, c10k, 'right')
  })

  bench('unionRects — 1,000 rects', () => {
    unionRects(rects1k)
  })
})
