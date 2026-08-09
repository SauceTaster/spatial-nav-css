import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpatialEngine } from '../src/core/engine'
import { buildTvPage } from '../bench/fixtures'

/**
 * DOM-API call budgets — the honest proxy for browser cost: in a real
 * engine pass the wall time is dominated by getComputedStyle and layout
 * reads, not JS. These tests pin how many such calls one navigation may
 * make on a TV-scale page (10 rails × 50 cards + sidebar = 506 focusables),
 * so a regression that reintroduces per-candidate-per-ancestor style reads
 * fails loudly.
 */
function countCalls() {
  const fixture = buildTvPage(10, 50)
  const engine = new SpatialEngine({
    getRect: fixture.getRect,
    scrollBehavior: false,
    // jsdom has no layout, so visibility is injected; the spy then counts
    // exactly the config-reading getComputedStyle calls.
    visibilityFilter: () => true,
  })

  const view = document.defaultView!
  const gcs = vi.spyOn(view, 'getComputedStyle')
  const mid = fixture.cards[(fixture.cards.length / 2) | 0]!

  engine.findTarget('down', mid)
  const styleReads = gcs.mock.calls.length
  gcs.mockRestore()
  return { styleReads }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('perf budget (506 focusables, one findTarget pass)', () => {
  it('bounds getComputedStyle calls per navigation', () => {
    const { styleReads } = countCalls()
    // eslint-disable-next-line no-console
    console.warn(`styleReads per findTarget pass: ${styleReads}`)
    // Floor: config is read via getComputedStyle, so a real pass must make at
    // least one call — 0 means the spy stopped intercepting and the ceiling
    // below would pass vacuously.
    expect(styleReads).toBeGreaterThan(0)
    // Budget: roughly one config read per distinct element touched in the
    // pass (candidates + containers + ancestors), with modest slack. The
    // un-cached implementation measured ~6 reads per element per touch
    // (thousands per pass).
    expect(styleReads).toBeLessThan(200)
  })
})
