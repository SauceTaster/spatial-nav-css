/**
 * React bindings for spatial-nav-css.
 *
 * No JSX is used here so the adapter compiles with any React setup; consumers
 * use it from .tsx as usual:
 *
 *   <SpatialNavigationProvider autofocus>
 *     <App />
 *   </SpatialNavigationProvider>
 *
 *   function Card() {
 *     const { ref, focused } = useFocusable<HTMLButtonElement>()
 *     return <button ref={ref} onClick={open} className={focused ? 'card focused' : 'card'}>Open</button>
 *   }
 */
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createSpatialNavigation, type SpatialNavigation, type SpatialNavigationOptions } from '../index'
import {
  applyFocusableAttributes,
  releaseOwnedAttributes,
  type OwnedAttributes,
} from '../core/attributes'
import type { SpatialEvent, SpatialEventType } from '../events'

const SpatialContext = createContext<SpatialNavigation | null>(null)

export interface SpatialNavigationProviderProps extends SpatialNavigationOptions {
  children?: ReactNode
}

/**
 * Creates a SpatialNavigation instance, starts it on mount, stops it on
 * unmount, and provides it via context. Options are captured on first render.
 */
export function SpatialNavigationProvider(props: SpatialNavigationProviderProps): ReactElement {
  const { children, ...options } = props
  const [nav] = useState(() => createSpatialNavigation(options))
  useEffect(() => {
    nav.start()
    // The nav instance is reused when React replays effects (notably
    // StrictMode). Stop the composed input manager so its adapters remain
    // registered, then reset only the engine's DOM state. A remount can start
    // cleanly, while a genuine unmount does not leave focus classes or
    // engine-added tabindex attributes on elements outside the React tree.
    return () => {
      nav.stop()
      nav.engine.destroy()
    }
  }, [nav])
  return createElement(SpatialContext.Provider, { value: nav }, children)
}

/** The SpatialNavigation from the nearest provider. Throws outside one. */
export function useSpatialNavigation(): SpatialNavigation {
  const nav = useContext(SpatialContext)
  if (!nav) throw new Error('useSpatialNavigation must be used inside <SpatialNavigationProvider>')
  return nav
}

export interface UseFocusableOptions {
  /** Mark as the preferred entry of its container / initial page focus. */
  autofocus?: boolean
  /** Block navigation in a direction, or redirect it to a selector. */
  navUp?: string
  navDown?: string
  navLeft?: string
  navRight?: string
  onFocus?: (event: SpatialEvent) => void
  onActivate?: (event: SpatialEvent) => void
}

export interface UseFocusableResult<T extends HTMLElement> {
  ref: SpatialRef<T>
  /** True while this element is the spatially focused element. */
  focused: boolean
}

/**
 * Object-ref shape shared by React 17–19. React 19 moved nullability into the
 * `RefObject` generic, while earlier versions kept it on `.current`.
 */
export interface SpatialRefObject<T extends HTMLElement> {
  readonly current: T | null
}

/**
 * A callback ref that also exposes `.current`. React invokes it on every
 * attach and detach, which is what lets a conditionally rendered element or
 * a swapped target wire itself up; `.current` keeps the plain object-ref
 * reads that earlier versions of this hook returned working.
 */
export interface SpatialRef<T extends HTMLElement> extends SpatialRefObject<T> {
  (node: T | null): void
}

/**
 * Makes the referenced element spatially focusable and reports focus state.
 * Spatial focus is real DOM focus, so plain `focus`/`blur` track it.
 */
export function useFocusable<T extends HTMLElement = HTMLElement>(
  options: UseFocusableOptions = {},
): UseFocusableResult<T> {
  const [focused, setFocused] = useState(false)
  const latest = useRef(options)
  latest.current = options
  const node = useRef<T | null>(null)
  const owned = useRef<OwnedAttributes>(new Map())
  const detach = useRef<(() => void) | null>(null)
  const ref = useRef<SpatialRef<T> | null>(null)

  if (!ref.current) {
    // A callback ref rather than effects over a static object ref: effects
    // run once and bail when `.current` is still null, so an element that
    // mounts later — or a ref pointed at a different node — was silently
    // never wired. React calls this on every attach and detach instead.
    const attach = (next: T | null): void => {
      if (node.current === next) return
      detach.current?.()
      detach.current = null
      node.current = next
      if (!next) {
        setFocused(false)
        return
      }
      applyFocusableAttributes(next, latest.current, owned.current)
      const onFocus = () => setFocused(true)
      const onBlur = () => setFocused(false)
      const onSpatialFocus = (e: Event) => latest.current.onFocus?.(e as SpatialEvent)
      const onActivate = (e: Event) => latest.current.onActivate?.(e as SpatialEvent)
      next.addEventListener('focus', onFocus)
      next.addEventListener('blur', onBlur)
      next.addEventListener('spatial:focus', onSpatialFocus)
      next.addEventListener('spatial:activate', onActivate)
      detach.current = () => {
        next.removeEventListener('focus', onFocus)
        next.removeEventListener('blur', onBlur)
        next.removeEventListener('spatial:focus', onSpatialFocus)
        next.removeEventListener('spatial:activate', onActivate)
        releaseOwnedAttributes(next, owned.current)
      }
      // The node can arrive already focused (late mount, swapped target).
      setFocused(next.ownerDocument.activeElement === next)
    }
    ref.current = Object.defineProperty(attach, 'current', {
      get: () => node.current,
    }) as SpatialRef<T>
  }

  const { autofocus, navUp, navDown, navLeft, navRight } = options
  useEffect(() => {
    const el = node.current
    if (el) {
      applyFocusableAttributes(el, { autofocus, navUp, navDown, navLeft, navRight }, owned.current)
    }
  }, [autofocus, navUp, navDown, navLeft, navRight])

  return { ref: ref.current, focused }
}

export interface SpatialContainerProps {
  /** Element type to render. Default 'div'. */
  as?: string
  /** Focus may not leave this container via spatial navigation. */
  contain?: boolean
  /** Navigation wraps around edges inside this container. */
  wrap?: boolean
  /** Restore the last focused child when re-entering. */
  remember?: boolean
  children?: ReactNode
  [prop: string]: unknown
}

/** Renders an element marked as a spatial container (focus group / zone). */
export function SpatialContainer(props: SpatialContainerProps): ReactElement {
  const { as = 'div', contain, wrap, remember, children, ...rest } = props
  const tokens = [contain && 'contain', wrap && 'wrap', remember && 'remember'].filter(Boolean).join(' ')
  return createElement(as, { ...rest, 'data-spatial-container': tokens }, children)
}

/** Subscribe to a spatial event for the lifetime of the component. */
export function useSpatialEvent(
  type: SpatialEventType,
  handler: (event: SpatialEvent) => void,
  target: EventTarget | null = typeof document !== 'undefined' ? document : null,
): void {
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    if (!target) return
    const listener = (e: Event) => latest.current(e as SpatialEvent)
    target.addEventListener(type, listener)
    return () => target.removeEventListener(type, listener)
  }, [type, target])
}
