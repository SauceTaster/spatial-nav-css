/**
 * Svelte bindings for spatial-nav-css.
 *
 * Svelte actions are plain functions and Svelte stores are a plain contract,
 * so this adapter has no dependency on the svelte package and works with
 * Svelte 3, 4, and 5.
 *
 *   <script>
 *     import { createSpatialNav, focusable, spatialContainer } from 'spatial-nav-css/svelte'
 *     import { onDestroy } from 'svelte'
 *     const { nav, focused, destroy } = createSpatialNav({ autofocus: true })
 *     onDestroy(destroy)
 *   </script>
 *
 *   <section use:spatialContainer={'wrap remember'}>
 *     <div use:focusable={{ onActivate: open }} class:active={$focused === el}>…</div>
 *   </section>
 */
import { createSpatialNavigation, type SpatialNavigation, type SpatialNavigationOptions } from '../index'
import type { SpatialEvent } from '../events'
import { ownerDocumentOf } from '../core/dom'

/** Minimal svelte/store Readable contract — structurally compatible. */
export interface Readable<T> {
  subscribe(run: (value: T) => void): () => void
}

export interface FocusableParams {
  autofocus?: boolean
  navUp?: string
  navDown?: string
  navLeft?: string
  navRight?: string
  onFocus?: (event: SpatialEvent) => void
  onActivate?: (event: SpatialEvent) => void
}

export interface ActionReturn<P> {
  update?: (params: P) => void
  destroy?: () => void
}

/** `use:focusable` — marks the node spatially focusable. */
export function focusable(
  node: HTMLElement,
  params: FocusableParams = {},
): ActionReturn<FocusableParams> {
  let current = params
  node.setAttribute('data-focusable', '')

  const applyParams = () => {
    if (current.autofocus) node.setAttribute('data-spatial-autofocus', '')
    else node.removeAttribute('data-spatial-autofocus')
    const dirs = {
      up: current.navUp,
      down: current.navDown,
      left: current.navLeft,
      right: current.navRight,
    }
    for (const [dir, value] of Object.entries(dirs)) {
      if (typeof value === 'string') node.setAttribute(`data-nav-${dir}`, value)
      else node.removeAttribute(`data-nav-${dir}`)
    }
  }
  applyParams()

  const onSpatialFocus = (e: Event) => current.onFocus?.(e as SpatialEvent)
  const onActivate = (e: Event) => current.onActivate?.(e as SpatialEvent)
  node.addEventListener('spatial:focus', onSpatialFocus)
  node.addEventListener('spatial:activate', onActivate)

  return {
    update(next) {
      current = next ?? {}
      applyParams()
    },
    destroy() {
      node.removeEventListener('spatial:focus', onSpatialFocus)
      node.removeEventListener('spatial:activate', onActivate)
    },
  }
}

/** `use:spatialContainer={'contain wrap remember'}` — marks a focus group. */
export function spatialContainer(node: HTMLElement, tokens: string = ''): ActionReturn<string> {
  node.setAttribute('data-spatial-container', tokens)
  return {
    update(next) {
      node.setAttribute('data-spatial-container', next ?? '')
    },
  }
}

/** Readable store of the currently focused element (or null). */
export function focusedStore(nav: SpatialNavigation): Readable<HTMLElement | null> {
  const root = nav.engine.root
  const doc = ownerDocumentOf(root instanceof Document ? root : root)
  return {
    subscribe(run) {
      run(nav.getFocused())
      const onChange = () => run(nav.getFocused())
      doc.addEventListener('spatial:focus', onChange)
      doc.addEventListener('focusout', onChange)
      return () => {
        doc.removeEventListener('spatial:focus', onChange)
        doc.removeEventListener('focusout', onChange)
      }
    },
  }
}

export interface SvelteSpatialNav {
  nav: SpatialNavigation
  /** Store of the currently focused element. */
  focused: Readable<HTMLElement | null>
  /** Call from onDestroy. */
  destroy: () => void
}

/** Create and start a SpatialNavigation wired for Svelte usage. */
export function createSpatialNav(options: SpatialNavigationOptions = {}): SvelteSpatialNav {
  const nav = createSpatialNavigation(options)
  nav.start()
  return {
    nav,
    focused: focusedStore(nav),
    destroy: () => nav.destroy(),
  }
}
