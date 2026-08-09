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

  it('cleans engine-owned DOM state outside the React tree on unmount', () => {
    const external = document.createElement('div')
    external.setAttribute('data-focusable', '')
    document.body.appendChild(external)
    let nav: SpatialNavigation | null = null
    const view = render(
      h(
        SpatialNavigationProvider,
        testOptions as never,
        h(NavProbe, { onNav: (value) => (nav = value) }),
      ),
    )
    act(() => {
      nav!.focus(external)
    })
    expect(external.getAttribute('tabindex')).toBe('-1')
    expect(external.classList.contains('spatial-focused')).toBe(true)

    view.unmount()

    expect(external.hasAttribute('tabindex')).toBe(false)
    expect(external.classList.contains('spatial-focused')).toBe(false)
    external.remove()
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

  it('useFocusable keeps navigation attributes in sync across rerenders', () => {
    function Card({ autofocus, navRight }: { autofocus: boolean; navRight?: string }) {
      const { ref } = useFocusable<HTMLDivElement>({ autofocus, navRight })
      return h('div', { ref, id: 'card' })
    }
    const view = render(
      h(
        SpatialNavigationProvider,
        testOptions as never,
        h(Card, { autofocus: false, navRight: '#first' }),
      ),
    )
    const card = document.getElementById('card')!
    expect(card.hasAttribute('data-spatial-autofocus')).toBe(false)
    expect(card.getAttribute('data-nav-right')).toBe('#first')

    view.rerender(
      h(
        SpatialNavigationProvider,
        testOptions as never,
        h(Card, { autofocus: true, navRight: '#second' }),
      ),
    )
    expect(card.hasAttribute('data-spatial-autofocus')).toBe(true)
    expect(card.getAttribute('data-nav-right')).toBe('#second')

    view.rerender(h(SpatialNavigationProvider, testOptions as never, h(Card, { autofocus: false })))
    expect(card.hasAttribute('data-spatial-autofocus')).toBe(false)
    expect(card.hasAttribute('data-nav-right')).toBe(false)
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

  it('keeps the focus ring when React rerenders className from the focused flag', () => {
    // Regression: the documented pattern below (className derived from
    // `focused`) made React rewrite the class attribute on the very render
    // that focus caused, deleting the engine's `spatial-focused` class and
    // the focus ring with it. The mirrored attribute survives that.
    let nav: SpatialNavigation | null = null
    function Card() {
      const { ref, focused } = useFocusable<HTMLButtonElement>()
      return h('button', {
        ref,
        type: 'button',
        id: 'card',
        className: focused ? 'card is-focused' : 'card',
      })
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
    act(() => {
      nav!.focus(card)
    })

    // React has re-rendered with its own className by now.
    expect(card.className).toBe('card is-focused')
    expect(card.hasAttribute('data-spatial-focused')).toBe(true)
  })

  it('leaves declarative data-nav-* attributes it did not set alone', () => {
    // Regression: the hook removed every direction attribute it had no option
    // for, deleting routes the consumer declared in JSX — the library's own
    // documented configuration surface.
    function Card() {
      const { ref } = useFocusable<HTMLButtonElement>()
      return h('button', {
        ref,
        type: 'button',
        id: 'card',
        'data-nav-up': '#header',
        'data-spatial-autofocus': '',
      })
    }
    const { unmount } = render(h(Card))
    const card = document.getElementById('card')!
    expect(card.getAttribute('data-nav-up')).toBe('#header')
    expect(card.hasAttribute('data-spatial-autofocus')).toBe(true)
    unmount()
  })

  it('restores a declarative attribute when its option is withdrawn', () => {
    function Card({ navUp }: { navUp?: string }) {
      const { ref } = useFocusable<HTMLButtonElement>({ navUp })
      return h('button', { ref, type: 'button', id: 'card', 'data-nav-up': '#declared' })
    }
    const { rerender } = render(h(Card, { navUp: '#option' }))
    const card = document.getElementById('card')!
    expect(card.getAttribute('data-nav-up')).toBe('#option')
    rerender(h(Card, {}))
    expect(card.getAttribute('data-nav-up')).toBe('#declared')
  })

  it('wires an element that mounts after the hook and unwires the previous one', () => {
    // Regression: the wiring effects ran once with a null ref and never
    // retried, so conditionally rendered elements were never registered.
    let nav: SpatialNavigation | null = null
    function Late({ show }: { show: boolean }) {
      const { ref, focused } = useFocusable<HTMLButtonElement>({ autofocus: true })
      return h(
        'div',
        null,
        show ? h('button', { ref, type: 'button', id: 'late' }) : null,
        h('span', { id: 'state' }, focused ? 'focused' : 'blurred'),
      )
    }
    const { rerender } = render(
      h(
        SpatialNavigationProvider,
        testOptions as never,
        h(NavProbe, { onNav: (n) => (nav = n) }),
        h(Late, { show: false }),
      ),
    )
    expect(document.getElementById('late')).toBeNull()

    rerender(
      h(
        SpatialNavigationProvider,
        testOptions as never,
        h(NavProbe, { onNav: (n) => (nav = n) }),
        h(Late, { show: true }),
      ),
    )
    const late = document.getElementById('late')!
    expect(late.hasAttribute('data-focusable')).toBe(true)
    expect(late.hasAttribute('data-spatial-autofocus')).toBe(true)

    act(() => {
      nav!.focus(late)
    })
    expect(document.getElementById('state')!.textContent).toBe('focused')

    // Unmounting the node detaches its listeners and returns its attributes.
    rerender(
      h(
        SpatialNavigationProvider,
        testOptions as never,
        h(NavProbe, { onNav: (n) => (nav = n) }),
        h(Late, { show: false }),
      ),
    )
    expect(document.getElementById('state')!.textContent).toBe('blurred')
    expect(late.hasAttribute('data-focusable')).toBe(false)
  })
})
