/**
 * React Aria Components interop for spatial-nav-css.
 *
 * The two systems already divide the work cleanly:
 *
 *  - In tested single-orientation collection patterns, RAC's roving tabindex
 *    can make its current item the collection's spatial stop.
 *  - When RAC consumes an arrow key with `preventDefault()`, the keyboard
 *    adapter leaves that event alone. Applications should browser-test which
 *    axes and edge keys their RAC components consume.
 *  - Spatial moves use real DOM focus, so RAC receives ordinary focus events;
 *    selection behavior still depends on the component and its configuration.
 *
 * What this module adds: prop helpers for marking RAC components as spatial
 * stops/zones (RAC components forward data-* props to the DOM), a lean
 * focus-state hook for styling under gamepad input (where react-aria's
 * :focus-visible modality tracking can't see the controller), and re-exports
 * of the React bindings so one import serves a RAC app.
 *
 *   <SpatialNavigationProvider autofocus>
 *     <nav {...spatialZone('remember')}>
 *       <ListBox aria-label="Library" {...spatialFocusable()}> … </ListBox>
 *     </nav>
 *     <Modal {...spatialZone('contain')}> … </Modal>
 *   </SpatialNavigationProvider>
 */
import { useRef, useState } from 'react'
import type { SpatialRef } from '../react/index'

export {
  SpatialNavigationProvider,
  SpatialContainer,
  useSpatialNavigation,
  useSpatialEvent,
  useFocusable,
} from '../react/index'
export type {
  SpatialNavigationProviderProps,
  SpatialContainerProps,
  SpatialRef,
  SpatialRefObject,
  UseFocusableOptions,
  UseFocusableResult,
} from '../react/index'

export interface SpatialFocusableOptions {
  /** Preferred entry of the surrounding container / initial page focus. */
  autofocus?: boolean
  /** Per-direction overrides: a selector, or 'none' to block. */
  navUp?: string
  navDown?: string
  navLeft?: string
  navRight?: string
}

/**
 * DOM props to spread onto a RAC component (or any element) to make it a
 * spatial stop. In a RAC collection, its current roving-tabindex item may
 * already be the stop. Prefer native interactive elements; custom focusable
 * elements still need suitable roles, names, and activation behavior.
 */
export function spatialFocusable(options: SpatialFocusableOptions = {}): Record<string, string> {
  const props: Record<string, string> = { 'data-focusable': '' }
  if (options.autofocus) props['data-spatial-autofocus'] = ''
  if (options.navUp) props['data-nav-up'] = options.navUp
  if (options.navDown) props['data-nav-down'] = options.navDown
  if (options.navLeft) props['data-nav-left'] = options.navLeft
  if (options.navRight) props['data-nav-right'] = options.navRight
  return props
}

/**
 * DOM props marking a layout region as a spatial zone (container).
 * Accepts the token string or an options object.
 *
 *   <div {...spatialZone('contain')}>            // RAC Modal: also trap spatially
 *   <div {...spatialZone({ wrap: true, remember: true })}>
 */
export function spatialZone(
  tokens: string | { contain?: boolean; wrap?: boolean; remember?: boolean } = '',
): Record<string, string> {
  const value =
    typeof tokens === 'string'
      ? tokens
      : [tokens.contain && 'contain', tokens.wrap && 'wrap', tokens.remember && 'remember']
          .filter(Boolean)
          .join(' ')
  return { 'data-spatial-container': value }
}

export interface UseSpatialFocusedResult<T extends HTMLElement> {
  ref: SpatialRef<T>
  /** True while the element (or a descendant) holds spatial focus. */
  focused: boolean
}

/**
 * Focus-state hook for styling RAC components under gamepad input.
 *
 * Focus-visible styling is modality-sensitive and may not classify
 * controller-driven focus as an application expects. This hook reports
 * focus-within state from ordinary DOM focus events, without changing the
 * element's focusability.
 */
export function useSpatialFocused<T extends HTMLElement = HTMLElement>(): UseSpatialFocusedResult<T> {
  const [focused, setFocused] = useState(false)
  const node = useRef<T | null>(null)
  const detach = useRef<(() => void) | null>(null)
  const ref = useRef<SpatialRef<T> | null>(null)

  if (!ref.current) {
    // Callback ref, so a RAC component that renders its DOM node later (or
    // swaps it) still gets wired — a mount-time effect would have bailed on
    // the null ref and never retried.
    const attach = (next: T | null): void => {
      if (node.current === next) return
      detach.current?.()
      detach.current = null
      node.current = next
      if (!next) {
        setFocused(false)
        return
      }
      const onIn = () => setFocused(true)
      const onOut = (e: FocusEvent) => {
        const related = e.relatedTarget as (EventTarget & { nodeType?: number }) | null
        if (!related || typeof related.nodeType !== 'number' || !next.contains(related as Node)) {
          setFocused(false)
        }
      }
      next.addEventListener('focusin', onIn)
      next.addEventListener('focusout', onOut)
      detach.current = () => {
        next.removeEventListener('focusin', onIn)
        next.removeEventListener('focusout', onOut)
      }
      const active = next.ownerDocument.activeElement
      setFocused(active !== null && next.contains(active))
    }
    ref.current = Object.defineProperty(attach, 'current', {
      get: () => node.current,
    }) as SpatialRef<T>
  }

  return { ref: ref.current, focused }
}
