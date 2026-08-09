import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, withDirectives, type App, type Ref } from 'vue'
import {
  SPATIAL_NAV_KEY,
  SpatialNavigationPlugin,
  useFocusable,
  useSpatialNavigation,
  vFocusable,
  vSpatialContainer,
} from '../src/vue/index'
import type { SpatialNavigation, SpatialNavigationOptions } from '../src/index'
import { rect } from './helpers'

const testOptions = {
  adapters: [],
  visibilityFilter: () => true,
  scrollBehavior: false as const,
  getRect: () => rect(0, 0, 10, 10),
}

let app: App | null = null
let host: HTMLElement | null = null

function mount(
  component: ReturnType<typeof defineComponent>,
  options: SpatialNavigationOptions = testOptions,
): App {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(component)
  app.use(SpatialNavigationPlugin, options)
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

  it('v-focusable updates and removes autofocus when its binding changes', async () => {
    let mode: Ref<string | undefined> | null = null
    mount(
      defineComponent({
        setup() {
          mode = ref<string | undefined>()
          return () => withDirectives(h('div', { id: 'card' }), [[vFocusable, mode!.value]])
        },
      }),
    )
    const card = document.getElementById('card')!
    expect(card.hasAttribute('data-spatial-autofocus')).toBe(false)

    mode!.value = 'autofocus'
    await nextTick()
    expect(card.hasAttribute('data-spatial-autofocus')).toBe(true)

    mode!.value = undefined
    await nextTick()
    expect(card.hasAttribute('data-spatial-autofocus')).toBe(false)
  })

  it('applies plugin autofocus after the app DOM has mounted', async () => {
    mount(
      defineComponent({
        setup() {
          return () => h('button', { id: 'initial' }, 'Initial')
        },
      }),
      { ...testOptions, autofocus: true },
    )

    await nextTick()
    await Promise.resolve()
    expect(document.activeElement?.id).toBe('initial')
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

  it('useFocusable wires an element that appears after mount', async () => {
    // Regression: wiring happened once in onMounted, so a v-if element that
    // rendered later was never registered.
    let nav: SpatialNavigation | null = null
    const show = ref(false)
    let focusedRef: { value: boolean } | null = null
    mount(
      defineComponent({
        setup() {
          nav = useSpatialNavigation()
          const { elRef, focused } = useFocusable({ autofocus: true })
          focusedRef = focused
          return () => (show.value ? h('div', { ref: elRef, id: 'later' }) : h('span'))
        },
      }),
    )
    expect(document.getElementById('later')).toBeNull()

    show.value = true
    await nextTick()
    const later = document.getElementById('later')!
    expect(later.hasAttribute('data-focusable')).toBe(true)
    expect(later.hasAttribute('data-spatial-autofocus')).toBe(true)

    nav!.focus(later)
    expect(focusedRef!.value).toBe(true)

    show.value = false
    await nextTick()
    expect(focusedRef!.value).toBe(false)
  })

  it('v-focusable leaves a declarative autofocus attribute in place', () => {
    // Regression: the directive removed data-spatial-autofocus whenever its
    // own binding was absent, clobbering the template's own declaration.
    mount(
      defineComponent({
        setup() {
          return () =>
            withDirectives(h('button', { id: 'declared', 'data-spatial-autofocus': '' }), [[vFocusable]])
        },
      }),
    )
    expect(document.getElementById('declared')!.hasAttribute('data-spatial-autofocus')).toBe(true)
  })
})
