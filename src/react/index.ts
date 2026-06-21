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
 *     const { ref, focused } = useFocusable<HTMLDivElement>({ onActivate: open })
 *     return <div ref={ref} className={focused ? 'card focused' : 'card'} />
 *   }
 */
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createSpatialNavigation, type SpatialNavigation, type SpatialNavigationOptions } from '../index'
import type { SpatialEvent, SpatialEventType } from '../events'

const SpatialContext = createContext<SpatialNavigation | null>(null)

export interface SpatialNavigationProviderProps extends SpatialNavigationOptions {
  children?: ReactNode
}

/**
 * Creates a SpatialNavigation instance, starts it on mount, destroys it on
 * unmount, and provides it via context. Options are captured on first render.
 */
export function SpatialNavigationProvider(props: SpatialNavigationProviderProps): ReactNode {
  const { children, ...options } = props
  const [nav] = useState(() => createSpatialNavigation(options))
  useEffect(() => {
    nav.start()
    // Clean up with stop(), not destroy(): the nav instance is created once
    // (useState) and reused across React's mount/unmount/remount cycles —
    // notably StrictMode's intentional double-invoke in dev. destroy() clears
    // the input adapters permanently, so the remount's start() would have none
    // and keyboard/gamepad input would silently stop working. stop() removes
    // every global listener (focusin, mutation observer, adapter listeners)
    // but keeps the adapters, so a remount fully re-arms. On a genuine unmount
    // the whole tree is gone, so there is nothing left to leak.
    return () => nav.stop()
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
  ref: RefObject<T | null>
  /** True while this element is the spatially focused element. */
  focused: boolean
}

/**
 * Makes the referenced element spatially focusable and reports focus state.
 * Spatial focus is real DOM focus, so plain `focus`/`blur` track it.
 */
export function useFocusable<T extends HTMLElement = HTMLElement>(
  options: UseFocusableOptions = {},
): UseFocusableResult<T> {
  const ref = useRef<T | null>(null)
  const [focused, setFocused] = useState(false)
  const latest = useRef(options)
  latest.current = options

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.setAttribute('data-focusable', '')
    if (latest.current.autofocus) el.setAttribute('data-spatial-autofocus', '')
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      const key = `nav${dir[0]!.toUpperCase()}${dir.slice(1)}` as keyof UseFocusableOptions
      const value = latest.current[key]
      if (typeof value === 'string') el.setAttribute(`data-nav-${dir}`, value)
    }
    const onFocus = () => setFocused(true)
    const onBlur = () => setFocused(false)
    const onSpatialFocus = (e: Event) => latest.current.onFocus?.(e as SpatialEvent)
    const onActivate = (e: Event) => latest.current.onActivate?.(e as SpatialEvent)
    el.addEventListener('focus', onFocus)
    el.addEventListener('blur', onBlur)
    el.addEventListener('spatial:focus', onSpatialFocus)
    el.addEventListener('spatial:activate', onActivate)
    return () => {
      el.removeEventListener('focus', onFocus)
      el.removeEventListener('blur', onBlur)
      el.removeEventListener('spatial:focus', onSpatialFocus)
      el.removeEventListener('spatial:activate', onActivate)
    }
  }, [])

  return { ref, focused }
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
export function SpatialContainer(props: SpatialContainerProps): ReactNode {
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
