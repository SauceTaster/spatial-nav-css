import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// react-aria uses CSS.escape when restoring collection focus; vitest's jsdom
// globals don't expose the CSS namespace.
if (typeof (globalThis as { CSS?: unknown }).CSS === 'undefined') {
  ;(globalThis as { CSS?: unknown }).CSS = {
    escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`),
    supports: () => false,
  }
}

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { createElement as h } from 'react'
import { Button, ListBox, ListBoxItem, ListLayout, Virtualizer } from 'react-aria-components'
import { createSpatialNavigation, getFocusables, type SpatialNavigation } from '../src/index'
import { keyboardAdapter } from '../src/input/keyboard'
import { rect } from './helpers'

const TOTAL = 500
const ROW = 40

// React Aria's Virtualizer sizes itself from the scroller's client box;
// jsdom has none, so mock the prototype getters (the same technique
// react-aria's own test suite uses).
beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 200)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 300)
})
afterAll(() => {
  vi.restoreAllMocks()
})

const items = Array.from({ length: TOTAL }, (_, i) => ({ id: i, name: `Item ${i}` }))

function renderScene() {
  return render(
    h(
      'div',
      null,
      h(
        Virtualizer,
        { layout: ListLayout, layoutOptions: { rowSize: ROW } } as never,
        h(ListBox, {
          'aria-label': 'Virtualized',
          selectionMode: 'single',
          items,
          children: (item: { id: number; name: string }) =>
            h(ListBoxItem, { id: item.id, textValue: item.name } as never, item.name),
        } as never),
      ),
      h(Button, { id: 'side' } as never, 'Side'),
    ),
  )
}

let nav: SpatialNavigation | null = null

function startNav(): SpatialNavigation {
  nav = createSpatialNavigation({
    adapters: [keyboardAdapter()],
    getRect: (el) => {
      const role = el.getAttribute('role')
      if (role === 'option') {
        const index = Number(/\d+/.exec(el.textContent ?? '')?.[0] ?? -1)
        return rect(0, index * ROW, 300, ROW)
      }
      if (role === 'listbox') return rect(0, 0, 300, 200)
      if (el.id === 'side') return rect(400, 0, 100, ROW)
      return rect(0, 0, 0, 0)
    },
    visibilityFilter: () => true,
    scrollBehavior: false,
  })
  nav.start()
  return nav
}

const renderedOptions = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')]

afterEach(() => {
  nav?.destroy()
  nav = null
  cleanup()
})

describe('React Aria Virtualizer integration', () => {
  it('virtualizes (rendered options ≪ total) and stays a single spatial stop', () => {
    renderScene()
    const rendered = renderedOptions()
    expect(rendered.length).toBeGreaterThan(2)
    expect(rendered.length).toBeLessThan(50) // 500 items, ~5 visible + overscan

    const stops = getFocusables(document, undefined, () => true).filter((el) => {
      const role = el.getAttribute('role')
      return role === 'option' || role === 'listbox'
    })
    expect(stops).toHaveLength(1)
  })

  it('RAC drives its own axis across the virtualized window; the engine adopts', () => {
    renderScene()
    const n = startNav()
    act(() => {
      n.focus(renderedOptions()[0]!)
    })
    expect(document.activeElement?.textContent).toBe('Item 0')

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement?.textContent).toBe('Item 1')
    expect(n.getFocused()?.textContent).toBe('Item 1')

    // Several more hops — virtualized scrolling is RAC's own business.
    for (let i = 0; i < 4; i++) {
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    }
    expect(document.activeElement?.textContent).toBe('Item 5')
  })

  it('the orthogonal axis exits the virtualized collection spatially', () => {
    renderScene()
    const n = startNav()
    act(() => {
      n.focus(renderedOptions()[0]!)
    })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    expect(document.activeElement?.id).toBe('side')
  })
})
