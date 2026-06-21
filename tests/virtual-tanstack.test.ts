import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { createElement as h, useRef } from 'react'
import { type Virtualizer, useVirtualizer } from '@tanstack/react-virtual'
import { createSpatialNavigation, type SpatialNavigation } from '../src/index'
import { attachVirtualEdges } from '../src/virtual/index'
import { rect } from './helpers'

const TOTAL = 200
const ROW = 40
const VIEWPORT = 200

/**
 * A real TanStack Virtual list driven headlessly: jsdom has no layout, so
 * rect/offset observation and scrolling are injected — exactly the hooks
 * TanStack provides for non-browser environments. Geometry for the spatial
 * engine comes from each item's data-index.
 */
function makeScene() {
  const state = {
    offset: 0,
    offsetCbs: new Set<(offset: number, isScrolling: boolean) => void>(),
    virtualizer: null as Virtualizer<HTMLDivElement, Element> | null,
  }

  function List() {
    const parentRef = useRef<HTMLDivElement>(null)
    const virtualizer = useVirtualizer({
      count: TOTAL,
      getScrollElement: () => parentRef.current,
      estimateSize: () => ROW,
      overscan: 3,
      initialRect: { width: 300, height: VIEWPORT },
      observeElementRect: (_instance, cb) => {
        cb({ width: 300, height: VIEWPORT })
      },
      observeElementOffset: (_instance, cb) => {
        state.offsetCbs.add(cb)
        cb(state.offset, false)
        return () => state.offsetCbs.delete(cb)
      },
      scrollToFn: (offset) => {
        state.offset = offset
        for (const cb of state.offsetCbs) cb(offset, false)
      },
      measureElement: () => ROW,
    })
    state.virtualizer = virtualizer
    return h(
      'div',
      { ref: parentRef, id: 'zone', 'data-spatial-container': '' },
      h(
        'div',
        { style: { height: `${virtualizer.getTotalSize()}px`, position: 'relative' } },
        virtualizer.getVirtualItems().map((vi) =>
          h(
            'div',
            {
              key: vi.key,
              id: `item-${vi.index}`,
              'data-index': vi.index,
              'data-focusable': '',
            },
            `Item ${vi.index}`,
          ),
        ),
      ),
    )
  }

  return { state, List }
}

let nav: SpatialNavigation | null = null
let detach: (() => void) | null = null

function startNav(): SpatialNavigation {
  nav = createSpatialNavigation({
    adapters: [],
    getRect: (el) => {
      if (el.dataset.index !== undefined) {
        return rect(0, Number(el.dataset.index) * ROW, 300, ROW)
      }
      if (el.id === 'zone') return rect(0, 0, 300, TOTAL * ROW)
      return rect(0, 0, 0, 0)
    },
    visibilityFilter: () => true,
    scrollBehavior: false,
  })
  nav.start()
  return nav
}

const mountedIndices = () =>
  [...document.querySelectorAll<HTMLElement>('[data-index]')].map((el) => Number(el.dataset.index))

/**
 * TanStack clamps scroll targets against the scroller's real
 * scrollHeight/clientHeight, which jsdom reports as 0 — give the zone its
 * would-be layout metrics so offset math works headlessly.
 */
function defineScrollMetrics() {
  const zone = document.getElementById('zone')!
  Object.defineProperty(zone, 'scrollHeight', { value: TOTAL * ROW, configurable: true })
  Object.defineProperty(zone, 'clientHeight', { value: VIEWPORT, configurable: true })
}

afterEach(() => {
  detach?.()
  detach = null
  nav?.destroy()
  nav = null
  cleanup()
})

describe('TanStack Virtual integration', () => {
  it('actually virtualizes (mounted items ≪ total) and navigates the mounted window', () => {
    const { List } = makeScene()
    render(h(List))
    const mounted = mountedIndices()
    expect(mounted.length).toBeGreaterThan(3)
    expect(mounted.length).toBeLessThan(20) // 200 items, ~5 visible + overscan

    const n = startNav()
    act(() => {
      n.focus('#item-1')
    })
    act(() => {
      n.navigate('down')
    })
    expect(document.activeElement?.id).toBe('item-2')
  })

  it('continues past the mounted edge: scroll → mount → focus', async () => {
    const { state, List } = makeScene()
    render(h(List))
    defineScrollMetrics()
    const n = startNav()
    detach = attachVirtualEdges(n, {
      zone: document.getElementById('zone')!,
      count: () => TOTAL,
      scrollToIndex: (i) => state.virtualizer!.scrollToIndex(i),
    })

    const lastMounted = Math.max(...mountedIndices())
    act(() => {
      n.focus(`#item-${lastMounted}`)
    })

    // Geometrically there is nothing below the last mounted item — the
    // helper must scroll the virtualizer and land on the next index.
    await act(async () => {
      n.navigate('down')
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(document.activeElement?.id).toBe(`item-${lastMounted + 1}`)
    expect(n.getFocused()?.id).toBe(`item-${lastMounted + 1}`)
  })

  it('walks an entire screen boundary item by item', async () => {
    const { state, List } = makeScene()
    render(h(List))
    defineScrollMetrics()
    const n = startNav()
    detach = attachVirtualEdges(n, {
      zone: document.getElementById('zone')!,
      count: () => TOTAL,
      scrollToIndex: (i) => state.virtualizer!.scrollToIndex(i),
    })

    act(() => {
      n.focus('#item-2')
    })
    for (let presses = 0; presses < 15; presses++) {
      await act(async () => {
        n.navigate('down')
      })
      await act(async () => {
        await new Promise((r) => setTimeout(r, 30))
      })
    }
    // 15 downs from item 2 → item 17, several scroll hops past the window.
    expect(document.activeElement?.id).toBe('item-17')
  })

  it('recovers when the focused item is scrolled out and unmounted', async () => {
    const { state, List } = makeScene()
    render(h(List))
    defineScrollMetrics()
    const n = startNav()

    act(() => {
      n.focus('#item-2')
    })
    // Jump far away: item-2 unmounts.
    await act(async () => {
      state.virtualizer!.scrollToOffset(150 * ROW)
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(document.getElementById('item-2')).toBeNull()
    expect(n.getFocused()).toBeNull()

    // Next input claims focus among what is mounted — no crash, no dead end.
    act(() => {
      n.navigate('down')
    })
    const landed = document.activeElement as HTMLElement | null
    expect(landed?.dataset.index).toBeDefined()
    expect(mountedIndices()).toContain(Number(landed!.dataset.index))
  })
})
