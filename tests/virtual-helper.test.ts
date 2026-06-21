import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSpatialNavigation, type SpatialNavigation } from '../src/index'
import { attachVirtualEdges } from '../src/virtual/index'
import { rect } from './helpers'

/**
 * attachVirtualEdges edge cases against a synchronous fake windower — no
 * framework, pure DOM, so the helper's own guards are isolated.
 */
const ROW = 40
const TOTAL = 50

let nav: SpatialNavigation | null = null
let detach: (() => void) | null = null

function buildZone(mountedRange: [number, number]) {
  document.body.innerHTML = `<div id="zone" data-spatial-container></div>`
  const zone = document.getElementById('zone')!
  const mount = (from: number, to: number) => {
    zone.innerHTML = ''
    for (let i = from; i <= to; i++) {
      const el = document.createElement('div')
      el.dataset.index = String(i)
      el.id = `it-${i}`
      el.setAttribute('data-focusable', '')
      zone.appendChild(el)
    }
  }
  mount(...mountedRange)
  return { zone, mount }
}

function startNav(): SpatialNavigation {
  nav = createSpatialNavigation({
    adapters: [],
    getRect: (el) =>
      el.dataset.index !== undefined
        ? rect(0, Number(el.dataset.index) * ROW, 300, ROW)
        : rect(0, 0, 0, 0),
    visibilityFilter: () => true,
    scrollBehavior: false,
  })
  nav.start()
  return nav
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

afterEach(() => {
  detach?.()
  detach = null
  nav?.destroy()
  nav = null
  document.body.innerHTML = ''
})

describe('attachVirtualEdges guards', () => {
  it('does not scroll past the collection end', async () => {
    const { zone, mount } = buildZone([TOTAL - 3, TOTAL - 1])
    const n = startNav()
    const scrollToIndex = vi.fn((i: number) => mount(i - 2, Math.min(TOTAL - 1, i + 2)))
    detach = attachVirtualEdges(n, { zone, count: () => TOTAL, scrollToIndex })

    n.focus(`#it-${TOTAL - 1}`)
    n.navigate('down') // past the last real item
    await sleep(10)
    expect(scrollToIndex).not.toHaveBeenCalled()
    expect(n.getFocused()?.id).toBe(`it-${TOTAL - 1}`)
  })

  it('ignores directions off the configured axis', async () => {
    const { zone, mount } = buildZone([0, 4])
    const n = startNav()
    const scrollToIndex = vi.fn((i: number) => mount(i, i + 4))
    detach = attachVirtualEdges(n, { zone, count: () => TOTAL, scrollToIndex })

    n.focus('#it-0')
    n.navigate('right') // vertical axis: left/right edges are not the helper's business
    await sleep(10)
    expect(scrollToIndex).not.toHaveBeenCalled()
  })

  it('ignores edges from elements without an index', async () => {
    const { zone } = buildZone([0, 4])
    // A focusable header inside the zone, no data-index.
    const header = document.createElement('div')
    header.id = 'header'
    header.setAttribute('data-focusable', '')
    zone.prepend(header)
    const n = startNav()
    const scrollToIndex = vi.fn()
    detach = attachVirtualEdges(n, { zone, count: () => TOTAL, scrollToIndex })

    n.focus('#header')
    n.navigate('up')
    await sleep(10)
    expect(scrollToIndex).not.toHaveBeenCalled()
  })

  it('a custom step drives grid-style jumps', async () => {
    const { zone, mount } = buildZone([0, 11])
    const n = startNav()
    detach = attachVirtualEdges(n, {
      zone,
      count: () => TOTAL,
      scrollToIndex: (i) => mount(Math.max(0, i - 6), Math.min(TOTAL - 1, i + 6)),
      step: (i, dir) => (dir === 'down' ? i + 4 : dir === 'up' ? i - 4 : null), // 4 columns
    })

    n.focus('#it-11')
    n.navigate('down') // 11 + 4 = 15, beyond the mounted window
    await sleep(15)
    expect(n.getFocused()?.id).toBe('it-15')
  })

  it('gives up after maxAttempts when the item never mounts', async () => {
    const { zone } = buildZone([0, 4])
    const n = startNav()
    const scrollToIndex = vi.fn() // a broken virtualizer that never re-renders
    detach = attachVirtualEdges(n, {
      zone,
      count: () => TOTAL,
      scrollToIndex,
      maxAttempts: 3,
    })

    n.focus('#it-4')
    n.navigate('down')
    await sleep(30)
    expect(scrollToIndex).toHaveBeenCalledWith(5)
    expect(n.getFocused()?.id).toBe('it-4') // unchanged, no crash, no spin
  })

  it('a newer advance supersedes a stale one', async () => {
    const { zone, mount } = buildZone([0, 4])
    const n = startNav()
    let mountOnNext: number | null = null
    detach = attachVirtualEdges(n, {
      zone,
      count: () => TOTAL,
      scrollToIndex: (i) => {
        mountOnNext = i
      },
      settle: async () => {
        await sleep(5)
        if (mountOnNext !== null) {
          mount(mountOnNext - 2 < 0 ? 0 : mountOnNext - 2, mountOnNext + 2)
          mountOnNext = null
        }
      },
    })

    n.focus('#it-4')
    n.navigate('down') // advance to 5 (stale)
    n.navigate('down') // immediately again: origin still it-4 → advance to 5 again (newer)
    await sleep(40)
    // Exactly one of the advances lands; focus is on 5, not bounced twice.
    expect(n.getFocused()?.dataset.index).toBe('5')
  })

  it('an advance never yanks focus the user moved elsewhere — even to another item', async () => {
    const { zone } = buildZone([0, 4])
    const n = startNav()
    const gate: { release?: () => void } = {}
    detach = attachVirtualEdges(n, {
      zone,
      count: () => TOTAL,
      scrollToIndex: () => {},
      // Hold the advance until the test has moved focus, then mount 5–6
      // additively (real windowing keeps on-screen nodes alive — rebuilding
      // them would destroy the user's focused element and muddy the test).
      settle: () =>
        new Promise<void>((r) => {
          gate.release = () => {
            for (const i of [5, 6]) {
              const el = document.createElement('div')
              el.dataset.index = String(i)
              el.id = `it-${i}`
              el.setAttribute('data-focusable', '')
              zone.appendChild(el)
            }
            r()
          }
        }),
    })

    n.focus('#it-4')
    n.navigate('down') // pending advance to 5, parked in settle
    n.focus('#it-2') // user moves focus mid-advance
    gate.release?.()
    await sleep(10)
    expect(n.getFocused()?.id).toBe('it-2') // not yanked to it-5
  })

  it('cleanup detaches the listener', async () => {
    const { zone } = buildZone([0, 4])
    const n = startNav()
    const scrollToIndex = vi.fn()
    const cleanup = attachVirtualEdges(n, { zone, count: () => TOTAL, scrollToIndex })
    cleanup()

    n.focus('#it-4')
    n.navigate('down')
    await sleep(10)
    expect(scrollToIndex).not.toHaveBeenCalled()
  })
})
