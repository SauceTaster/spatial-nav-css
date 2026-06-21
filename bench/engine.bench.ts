import { bench, describe } from 'vitest'
import { SpatialEngine } from '../src/core/engine'
import { buildTvPage } from './fixtures'

/**
 * Full findTarget() call graph on a TV-scale DOM in jsdom — config reading,
 * container resolution, zone grouping, candidate scoring. jsdom's DOM calls
 * are slower than Blink's, so treat these as relative numbers; absolute
 * browser latency comes from demo/bench.html.
 */
function setup(rails: number, cardsPerRail: number) {
  const fixture = buildTvPage(rails, cardsPerRail)
  const engine = new SpatialEngine({
    getRect: fixture.getRect,
    visibilityFilter: () => true,
    scrollBehavior: false,
  })
  const mid = fixture.cards[(fixture.cards.length / 2) | 0]!
  return { engine, mid }
}

describe('engine.findTarget on a TV-scale DOM (jsdom)', () => {
  {
    const { engine, mid } = setup(5, 20) // 100 cards
    bench('findTarget — 5 rails × 20 cards (100)', () => {
      engine.findTarget('down', mid)
      engine.findTarget('right', mid)
    })
  }
  {
    const { engine, mid } = setup(10, 50) // 500 cards
    bench('findTarget — 10 rails × 50 cards (500)', () => {
      engine.findTarget('down', mid)
      engine.findTarget('right', mid)
    })
  }
  {
    const { engine, mid } = setup(20, 100) // 2000 cards
    bench('findTarget — 20 rails × 100 cards (2000)', () => {
      engine.findTarget('down', mid)
      engine.findTarget('right', mid)
    })
  }
})
