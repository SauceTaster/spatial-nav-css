/**
 * Svelte bindings for spatial-nav-css.
 *
 * Svelte actions are plain functions and Svelte stores are a plain contract,
 * so this adapter has no dependency on the svelte package and works with
 * Svelte 3, 4, and 5.
 *
 *   <script>
 *     import { createSpatialNav, focusable, spatialContainer } from 'spatial-nav-css/svelte'
 *     import { onDestroy, onMount } from 'svelte'
 *     const { nav, focused, destroy } = createSpatialNav()
 *     onMount(() => nav.focusFirst())
 *     onDestroy(destroy)
 *   </script>
 *
 *   <section use:spatialContainer={'wrap remember'}>
 *     <button use:focusable on:click={open}>Open</button>
 *   </section>
 *   <p>Focused: {$focused?.textContent ?? 'nothing'}</p>
 */
import { createSpatialNavigation, type SpatialNavigation, type SpatialNavigationOptions } from '../index'
import type { SpatialEvent } from '../events'
import { ownerDocumentOf } from '../core/dom'
import {
  applyFocusableAttributes,
  releaseOwnedAttributes,
  type OwnedAttributes,
} from '../core/attributes'

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
  // Only attributes this action writes are ever removed again — the same
  // data-* names are also how markup declares navigation directly.
  const owned: OwnedAttributes = new Map()
  const applyParams = () => applyFocusableAttributes(node, current, owned)
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
      releaseOwnedAttributes(node, owned)
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
  let doc: Document | null = null
  let root: Document | HTMLElement | null = null
  try {
    root = nav.engine.root
    doc = ownerDocumentOf(root)
  } catch {
    // The SSR facade deliberately has no engine. A static null store keeps
    // server rendering deterministic; the client creates a separate store.
  }
  return {
    subscribe(run) {
      let last = nav.getFocused()
      run(last)
      if (!doc) return () => {}
      const onChange = () => {
        const next = nav.getFocused()
        if (next === last) return
        last = next
        run(next)
      }
      doc.addEventListener('spatial:focus', onChange)
      doc.addEventListener('focusin', onChange)
      doc.addEventListener('focusout', onChange)
      const Observer = doc.defaultView?.MutationObserver
      const observer = root && Observer ? new Observer(onChange) : null
      if (observer && root) observer.observe(root, { childList: true, subtree: true })
      return () => {
        doc.removeEventListener('spatial:focus', onChange)
        doc.removeEventListener('focusin', onChange)
        doc.removeEventListener('focusout', onChange)
        observer?.disconnect()
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
