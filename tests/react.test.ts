import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { createElement as h, useEffect } from 'react'
import {
  SpatialContainer,
  SpatialNavigationProvider,
  useFocusable,
  useSpatialEvent,
  useSpatialNavigation,
} from '../src/react/index'
import type { SpatialNavigation } from '../src/index'
import { rect } from './helpers'

const testOptions = {
  adapters: [],
  visibilityFilter: () => true,
  scrollBehavior: false as const,
  getRect: () => rect(0, 0, 10, 10),
}

afterEach(cleanup)

function NavProbe({ onNav }: { onNav: (nav: SpatialNavigation) => void }) {
  const nav = useSpatialNavigation()
  useEffect(() => {
    onNav(nav)
  }, [nav, onNav])
  return null
}

describe('react adapter', () => {
  it('provides a started SpatialNavigation via context', () => {
    let nav: SpatialNavigation | null = null
    render(h(SpatialNavigationProvider, testOptions as never, h(NavProbe, { onNav: (n) => (nav = n) })))
    expect(nav).not.toBeNull()
    expect(nav!.engine).toBeDefined()
  })

  it('throws when useSpatialNavigation is used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(h(NavProbe, { onNav: () => {} }))).toThrow(/SpatialNavigationProvider/)
    spy.mockRestore()
  })

  it('useFocusable marks the element and tracks focus state', () => {
    let nav: SpatialNavigation | null = null
    function Card() {
      const { ref, focused } = useFocusable<HTMLDivElement>({ autofocus: true, navRight: 'none' })
      return h('div', { ref, id: 'card', 'data-state': focused ? 'focused' : 'idle' })
    }
    render(
      h(
        SpatialNavigationProvider,
        testOptions as never,
        h(NavProbe, { onNav: (n) => (nav = n) }),
        h(Card),
      ),
    )
    const card = document.getElementById('card')!
    expect(card.hasAttribute('data-focusable')).toBe(true)
    expect(card.hasAttribute('data-spatial-autofocus')).toBe(true)
    expect(card.getAttribute('data-nav-right')).toBe('none')
    expect(card.getAttribute('data-state')).toBe('idle')

    act(() => {
      nav!.focus(card)
    })
    expect(card.getAttribute('data-state')).toBe('focused')
  })

  it('useFocusable fires onActivate', () => {
    let nav: SpatialNavigation | null = null
    const onActivate = vi.fn()
    function Card() {
      const { ref } = useFocusable<HTMLDivElement>({ onActivate })
      return h('div', { ref, id: 'card' })
    }
    render(
      h(
        SpatialNavigationProvider,
        testOptions as never,
        h(NavProbe, { onNav: (n) => (nav = n) }),
        h(Card),
      ),
    )
    act(() => {
      nav!.focus(document.getElementById('card')!)
      nav!.activate()
    })
    expect(onActivate).toHaveBeenCalledOnce()
  })

  it('useSpatialEvent subscribes for the component lifetime', () => {
    const seen: string[] = []
    function Listener() {
      useSpatialEvent('spatial:focus', (e) => {
        seen.push(e.detail.source)
      })
      return null
    }
    const { unmount } = render(h(Listener))
    document.dispatchEvent(
      new CustomEvent('spatial:focus', {
        detail: { direction: null, from: null, source: 'test' },
        bubbles: true,
      }),
    )
    expect(seen).toEqual(['test'])
    unmount()
    document.dispatchEvent(
      new CustomEvent('spatial:focus', {
        detail: { direction: null, from: null, source: 'after' },
        bubbles: true,
      }),
    )
    expect(seen).toEqual(['test'])
  })

  it('SpatialContainer renders the container tokens', () => {
    render(h(SpatialContainer, { as: 'section', wrap: true, remember: true, id: 'zone' }, 'content'))
    expect(document.getElementById('zone')!.getAttribute('data-spatial-container')).toBe('wrap remember')
  })
})
