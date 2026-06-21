import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, withDirectives, type App } from 'vue'
import {
  SPATIAL_NAV_KEY,
  SpatialNavigationPlugin,
  useFocusable,
  useSpatialNavigation,
  vFocusable,
  vSpatialContainer,
} from '../src/vue/index'
import type { SpatialNavigation } from '../src/index'
import { rect } from './helpers'

const testOptions = {
  adapters: [],
  visibilityFilter: () => true,
  scrollBehavior: false as const,
  getRect: () => rect(0, 0, 10, 10),
}

let app: App | null = null
let host: HTMLElement | null = null

function mount(component: ReturnType<typeof defineComponent>): App {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(component)
  app.use(SpatialNavigationPlugin, testOptions)
  app.mount(host)
  return app
}

afterEach(() => {
  app?.unmount()
  host?.remove()
  app = null
  host = null
})

describe('vue adapter', () => {
  it('plugin provides a SpatialNavigation for useSpatialNavigation', () => {
    let nav: SpatialNavigation | null = null
    mount(
      defineComponent({
        setup() {
          nav = useSpatialNavigation()
          return () => h('div')
        },
      }),
    )
    expect(nav).not.toBeNull()
    expect(app!._context.provides[SPATIAL_NAV_KEY as symbol]).toBe(nav)
  })

  it('v-focusable and v-spatial-container set engine attributes', () => {
    mount(
      defineComponent({
        setup() {
          return () =>
            withDirectives(
              h('section', { id: 'zone' }, [
                withDirectives(h('div', { id: 'card' }), [[vFocusable, undefined]]),
              ]),
              [[vSpatialContainer, 'wrap remember']],
            )
        },
      }),
    )
    expect(document.getElementById('zone')!.getAttribute('data-spatial-container')).toBe('wrap remember')
    expect(document.getElementById('card')!.hasAttribute('data-focusable')).toBe(true)
  })

  it('useFocusable tracks focus reactively and fires onActivate', () => {
    let nav: SpatialNavigation | null = null
    const onActivate = vi.fn()
    let focusedRef: { value: boolean } | null = null
    mount(
      defineComponent({
        setup() {
          nav = useSpatialNavigation()
          const { elRef, focused } = useFocusable({ autofocus: true, onActivate })
          focusedRef = focused
          return () => h('div', { ref: elRef, id: 'card' })
        },
      }),
    )
    const card = document.getElementById('card')!
    expect(card.hasAttribute('data-focusable')).toBe(true)
    expect(card.hasAttribute('data-spatial-autofocus')).toBe(true)
    expect(focusedRef!.value).toBe(false)

    nav!.focus(card)
    expect(focusedRef!.value).toBe(true)
    nav!.activate()
    expect(onActivate).toHaveBeenCalledOnce()
  })
})
