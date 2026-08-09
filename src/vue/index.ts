/**
 * Vue 3 bindings for spatial-nav-css.
 *
 *   // main.ts
 *   app.use(SpatialNavigationPlugin, { autofocus: true })
 *
 *   // Component.vue
 *   const { elRef, focused } = useFocusable()
 *   <button ref="elRef" :class="{ focused }" @click="open">…</button>
 *
 *   // or with directives (registered by the plugin):
 *   <button v-focusable>…</button>
 *   <section v-spatial-container="'wrap remember'">…</section>
 */
import {
  inject,
  onBeforeUnmount,
  ref,
  watch,
  type App,
  type Directive,
  type InjectionKey,
  type Ref,
} from 'vue'
import { createSpatialNavigation, type SpatialNavigation, type SpatialNavigationOptions } from '../index'
import {
  applyFocusableAttributes,
  releaseOwnedAttributes,
  type OwnedAttributes,
} from '../core/attributes'
import type { SpatialEvent } from '../events'

export const SPATIAL_NAV_KEY: InjectionKey<SpatialNavigation> = Symbol('spatial-nav-css')

// Per-element record of what this directive wrote, so an update never
// deletes a data-spatial-autofocus the template declared itself.
const directiveOwned = new WeakMap<HTMLElement, OwnedAttributes>()

const syncFocusableDirective = (
  el: HTMLElement,
  binding: { value?: string; modifiers?: Partial<Record<string, boolean>> },
): void => {
  let owned = directiveOwned.get(el)
  if (!owned) {
    owned = new Map()
    directiveOwned.set(el, owned)
  }
  const autofocus = binding.value === 'autofocus' || binding.modifiers?.autofocus === true
  applyFocusableAttributes(el, { autofocus }, owned)
}

/** `v-focusable` — marks an element spatially focusable. */
export const vFocusable: Directive<HTMLElement, string | undefined> = {
  mounted(el, binding) {
    syncFocusableDirective(el, binding)
  },
  updated(el, binding) {
    syncFocusableDirective(el, binding)
  },
  unmounted(el) {
    const owned = directiveOwned.get(el)
    if (owned) releaseOwnedAttributes(el, owned)
    directiveOwned.delete(el)
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
    // The plugin installs before app.mount(), so defer its autofocus pass
    // until the component DOM has committed.
    const nav = createSpatialNavigation({ ...options, autofocus: false })
    nav.start()
    app.provide(SPATIAL_NAV_KEY, nav)
    app.directive('focusable', vFocusable)
    app.directive('spatial-container', vSpatialContainer)
    const mount = app.mount.bind(app)
    app.mount = ((...args: Parameters<App['mount']>) => {
      try {
        const result = mount(...args)
        if (options.autofocus && !nav.getFocused()) nav.focusFirst()
        return result
      } catch (error) {
        nav.destroy()
        throw error
      }
    }) as App['mount']
    const unmount = app.unmount.bind(app)
    app.unmount = () => {
      try {
        unmount()
      } finally {
        nav.destroy()
      }
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
  /** Bind to the element: `<button ref="elRef">` */
  elRef: Ref<HTMLElement | null>
  /** True while the element is spatially focused. */
  focused: Ref<boolean>
}

/** Composable form of `v-focusable` with reactive focus state. */
export function useFocusable(options: UseFocusableOptions = {}): UseFocusableResult {
  const elRef = ref<HTMLElement | null>(null)
  const focused = ref(false)
  let cleanup: (() => void) | null = null

  // Watching the ref rather than wiring once in onMounted: the element can
  // arrive later (v-if) or be replaced, and a mount-time-only binding would
  // leave those nodes unwired and the old node's listeners attached.
  watch(
    elRef,
    (el) => {
      cleanup?.()
      cleanup = null
      if (!el) {
        focused.value = false
        return
      }
      const owned: OwnedAttributes = new Map()
      applyFocusableAttributes(el, options, owned)
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
        releaseOwnedAttributes(el, owned)
      }
      focused.value = el.ownerDocument.activeElement === el
    },
    // Sync flush keeps the original onMounted timing: the binding is live as
    // soon as the template ref points at a node, not a tick later.
    { immediate: true, flush: 'sync' },
  )
  onBeforeUnmount(() => cleanup?.())

  return { elRef, focused }
}
