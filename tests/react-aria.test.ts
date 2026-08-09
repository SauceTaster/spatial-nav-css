import { afterEach, describe, expect, it } from 'vitest'

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
import { Button, ListBox, ListBoxItem } from 'react-aria-components'
import { createSpatialNavigation, getFocusables, type SpatialNavigation } from '../src/index'
import { keyboardAdapter } from '../src/input/keyboard'
import { spatialFocusable, spatialZone, useSpatialFocused } from '../src/react-aria/index'
import { rect, type LayoutMap } from './helpers'

let nav: SpatialNavigation | null = null

const LAYOUT: LayoutMap = {
  'opt-a': [0, 0, 200, 40],
  'opt-b': [0, 50, 200, 40],
  'opt-c': [0, 100, 200, 40],
  side: [300, 0, 100, 40],
}

function startNav(): SpatialNavigation {
  nav = createSpatialNavigation({
    adapters: [keyboardAdapter()],
    getRect: (el) => {
      // RAC owns DOM ids (and re-mounts items on focus hydration), so key
      // the layout off data-testid with id as fallback.
      const r = LAYOUT[el.dataset.testid ?? el.id]
      return r ? rect(r[0], r[1], r[2], r[3]) : rect(0, 0, 0, 0)
    },
    visibilityFilter: () => true,
    scrollBehavior: false,
  })
  nav.start()
  return nav
}

const activeTestId = () =>
  (document.activeElement as HTMLElement | null)?.dataset.testid ?? document.activeElement?.id

afterEach(() => {
  nav?.destroy()
  nav = null
  cleanup()
})

function renderListBoxScene() {
  return render(
    h(
      'div',
      null,
      h(
        ListBox,
        { 'aria-label': 'Library', selectionMode: 'single' } as never,
        h(ListBoxItem, { id: 'a', textValue: 'A', 'data-testid': 'opt-a' } as never, 'Option A'),
        h(ListBoxItem, { id: 'b', textValue: 'B', 'data-testid': 'opt-b' } as never, 'Option B'),
        h(ListBoxItem, { id: 'c', textValue: 'C', 'data-testid': 'opt-c' } as never, 'Option C'),
      ),
      h(Button, { id: 'side' } as never, 'Side'),
    ),
  )
}

describe('react-aria-components interop', () => {
  it('a RAC collection appears as a single spatial stop', () => {
    const { getByRole, getByTestId } = renderListBoxScene()

    // Before entry, the listbox element itself is the tabbable stop (it
    // forwards focus inward); exactly one stop either way.
    const stops = () =>
      getFocusables(document, undefined, () => true).filter((el) => {
        const role = el.getAttribute('role')
        return role === 'option' || role === 'listbox'
      })
    expect(stops()).toHaveLength(1)
    expect(stops()[0]!.getAttribute('role')).toBe('listbox')

    // Entering through the collection root redirects to its current option;
    // the engine treats that eligible in-root redirect as a successful move.
    const n = startNav()
    let entered = false
    act(() => {
      entered = n.focus(getByRole('listbox'))
    })
    expect(entered).toBe(true)
    expect(activeTestId()).toBe('opt-a')
    expect(n.getFocused()?.dataset.testid).toBe('opt-a')

    // After focus is inside, the roving item is the single stop.
    act(() => {
      n.focus(getByTestId('opt-b'))
    })
    expect(stops()).toHaveLength(1)
    expect(stops()[0]!.dataset.testid).toBe('opt-b')
  })

  it('RAC owns its orientation axis; the engine adopts the moves', () => {
    const { getByTestId } = renderListBoxScene()
    const n = startNav()
    act(() => {
      n.focus(getByTestId('opt-a'))
    })
    expect(activeTestId()).toBe('opt-a')

    // ArrowDown inside the listbox: RAC handles it (preventDefault), the
    // keyboard adapter must not double-move; focus lands on option B and the
    // engine adopts it as the spatial position.
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(activeTestId()).toBe('opt-b')
    expect(n.getFocused()?.dataset.testid).toBe('opt-b')
  })

  it('the orthogonal axis exits the collection spatially', () => {
    const { getByTestId } = renderListBoxScene()
    const n = startNav()
    act(() => {
      n.focus(getByTestId('opt-a'))
    })

    // Vertical listbox does not handle ArrowRight → bubbles to the adapter →
    // spatial navigation moves to the button beside the list.
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    expect(activeTestId()).toBe('side')
  })

  it('useSpatialFocused reports focus-within without marking the element', () => {
    function Panel() {
      const { ref, focused } = useSpatialFocused<HTMLDivElement>()
      return h(
        'div',
        { ref, id: 'panel', 'data-state': focused ? 'focused' : 'idle' },
        h('button', { id: 'inner', type: 'button' }, 'Inner'),
      )
    }
    render(h(Panel))
    const panel = document.getElementById('panel')!
    expect(panel.hasAttribute('data-focusable')).toBe(false)
    expect(panel.getAttribute('data-state')).toBe('idle')

    act(() => {
      document.getElementById('inner')!.focus()
    })
    expect(panel.getAttribute('data-state')).toBe('focused')

    act(() => {
      document.getElementById('inner')!.blur()
    })
    expect(panel.getAttribute('data-state')).toBe('idle')
  })

  it('spatialFocusable / spatialZone generate RAC-spreadable DOM props', () => {
    expect(spatialFocusable()).toEqual({ 'data-focusable': '' })
    expect(spatialFocusable({ autofocus: true, navRight: 'none' })).toEqual({
      'data-focusable': '',
      'data-spatial-autofocus': '',
      'data-nav-right': 'none',
    })
    expect(spatialZone('contain')).toEqual({ 'data-spatial-container': 'contain' })
    expect(spatialZone({ wrap: true, remember: true })).toEqual({
      'data-spatial-container': 'wrap remember',
    })
  })
})
