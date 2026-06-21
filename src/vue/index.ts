/**
 * Vue 3 bindings for spatial-nav-css.
 *
 *   // main.ts
 *   app.use(SpatialNavigationPlugin, { autofocus: true })
 *
 *   // Component.vue
 *   const { elRef, focused } = useFocusable({ onActivate: open })
 *   <div ref="elRef" :class="{ focused }">…</div>
 *
 *   // or with directives (registered by the plugin):
 *   <div v-focusable>…</div>
 *   <section v-spatial-container="'wrap remember'">…</section>
 */
import {
  inject,
  onBeforeUnmount,
  onMounted,
  ref,
  type App,
  type Directive,
  type InjectionKey,
  type Ref,
} from 'vue'
import { createSpatialNavigation, type SpatialNavigation, type SpatialNavigationOptions } from '../index'
import type { SpatialEvent } from '../events'

export const SPATIAL_NAV_KEY: InjectionKey<SpatialNavigation> = Symbol('spatial-nav-css')

/** `v-focusable` — marks an element spatially focusable. */
export const vFocusable: Directive<HTMLElement, string | undefined> = {
  mounted(el, binding) {
    el.setAttribute('data-focusable', '')
    if (binding.value === 'autofocus' || binding.modifiers?.autofocus) {
      el.setAttribute('data-spatial-autofocus', '')
    }
  },
}

/** `v-spatial-container="'contain wrap remember'"` — marks a focus group. */
export const vSpatialContainer: Directive<HTMLElement, string | undefined> = {
  mounted(el, binding) {
    el.setAttribute('data-spatial-container', binding.value ?? '')
  },
  updated(el, binding) {
    el.setAttribute('data-spatial-container', binding.value ?? '')
  },
}

/**
 * App plugin: creates and starts a SpatialNavigation, provides it for
 * `useSpatialNavigation()`, registers the directives, and destroys the
 * instance when the app unmounts.
 */
export const SpatialNavigationPlugin = {
  install(app: App, options: SpatialNavigationOptions = {}) {
    const nav = createSpatialNavigation(options)
    nav.start()
    app.provide(SPATIAL_NAV_KEY, nav)
    app.directive('focusable', vFocusable)
    app.directive('spatial-container', vSpatialContainer)
    const unmount = app.unmount.bind(app)
    app.unmount = () => {
      nav.destroy()
      unmount()
    }
  },
}

/** The app's SpatialNavigation. Throws if the plugin is not installed. */
export function useSpatialNavigation(): SpatialNavigation {
  const nav = inject(SPATIAL_NAV_KEY, null)
  if (!nav) throw new Error('useSpatialNavigation requires app.use(SpatialNavigationPlugin)')
  return nav
}

export interface UseFocusableOptions {
  autofocus?: boolean
  onFocus?: (event: SpatialEvent) => void
  onActivate?: (event: SpatialEvent) => void
}

export interface UseFocusableResult {
  /** Bind to the element: `<div ref="elRef">` */
  elRef: Ref<HTMLElement | null>
  /** True while the element is spatially focused. */
  focused: Ref<boolean>
}

/** Composable form of `v-focusable` with reactive focus state. */
export function useFocusable(options: UseFocusableOptions = {}): UseFocusableResult {
  const elRef = ref<HTMLElement | null>(null)
  const focused = ref(false)
  let cleanup: (() => void) | null = null

  onMounted(() => {
    const el = elRef.value
    if (!el) return
    el.setAttribute('data-focusable', '')
    if (options.autofocus) el.setAttribute('data-spatial-autofocus', '')
    const onFocus = () => (focused.value = true)
    const onBlur = () => (focused.value = false)
    const onSpatialFocus = (e: Event) => options.onFocus?.(e as SpatialEvent)
    const onActivate = (e: Event) => options.onActivate?.(e as SpatialEvent)
    el.addEventListener('focus', onFocus)
    el.addEventListener('blur', onBlur)
    el.addEventListener('spatial:focus', onSpatialFocus)
    el.addEventListener('spatial:activate', onActivate)
    cleanup = () => {
      el.removeEventListener('focus', onFocus)
      el.removeEventListener('blur', onBlur)
      el.removeEventListener('spatial:focus', onSpatialFocus)
      el.removeEventListener('spatial:activate', onActivate)
    }
  })
  onBeforeUnmount(() => cleanup?.())

  return { elRef, focused }
}
