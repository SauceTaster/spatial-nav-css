/**
 * React Aria Components interop for spatial-nav-css.
 *
 * The two systems already divide the work cleanly:
 *
 *  - RAC collections (ListBox, Menu, GridList, …) use a roving tabindex, so
 *    the spatial engine sees exactly ONE focusable per collection — the
 *    collection behaves as a single spatial stop, and entering it lands on
 *    RAC's current item.
 *  - RAC owns arrow keys along its orientation (it preventDefaults them,
 *    including at the edges); the keyboard adapter skips defaultPrevented
 *    events, so there is no double-handling. Spatial navigation takes over
 *    on the orthogonal axis and everywhere outside the collection.
 *  - Spatial focus is real DOM focus, so RAC's selection/focus state follows
 *    automatically when the engine focuses an item.
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
import { useEffect, useRef, useState, type RefObject } from 'react'

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
 * spatial stop. For RAC collections you usually *don't* need this — the
 * roving-tabindex item is already the stop; use it for custom panels and
 * non-interactive tiles.
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
  ref: RefObject<T | null>
  /** True while the element (or a descendant) holds spatial focus. */
  focused: boolean
}

/**
 * Focus-state hook for styling RAC components under gamepad input.
 *
 * react-aria's focus-visible modality is keyed off real keyboard/pointer
 * events, so controller-driven focus doesn't set `data-focus-visible`. This
 * hook reports focus-within state straight from DOM focus events (which
 * spatial focus always raises), without marking the element `data-focusable`
 * — RAC items are already focusable.
 */
export function useSpatialFocused<T extends HTMLElement = HTMLElement>(): UseSpatialFocusedResult<T> {
  const ref = useRef<T | null>(null)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onIn = () => setFocused(true)
    const onOut = (e: FocusEvent) => {
      if (!(e.relatedTarget instanceof Node) || !el.contains(e.relatedTarget)) setFocused(false)
    }
    el.addEventListener('focusin', onIn)
    el.addEventListener('focusout', onOut)
    return () => {
      el.removeEventListener('focusin', onIn)
      el.removeEventListener('focusout', onOut)
    }
  }, [])
  return { ref, focused }
}
