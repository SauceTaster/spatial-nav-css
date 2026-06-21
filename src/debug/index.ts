/**
 * Visual debug overlay — see the engine's world the way it does.
 *
 * Paints outlines over every focusable (cyan), every spatial container
 * (dashed orange, with its tokens), and the current focus (red), refreshing
 * on focus changes, scroll, and resize. The lesson is straight from
 * Norigin's production `visualDebug` mode; this one draws with plain
 * positioned divs so it works everywhere, stays inspectable in devtools,
 * and never intercepts input (pointer-events: none).
 *
 *   import { attachDebugOverlay } from 'spatial-nav-css/debug'
 *   const detach = attachDebugOverlay(nav)   // or attachDebugOverlay(engine)
 *   detach()                                 // remove everything
 *
 * Dev-only by design: ~1 absolutely-positioned div per focusable per refresh.
 */
import type { SpatialEngine } from '../core/engine'
import { DEFAULT_FOCUSABLE_SELECTOR, getFocusables, isElementVisible } from '../core/dom'
import { readNavConfig } from '../core/config'

export interface DebugOverlayOptions {
  /** Selector for focusables; pass your engine's custom one if you set it. */
  focusableSelector?: string
  /** Show index/token labels. Default true. */
  labels?: boolean
  /** Treat everything as visible (matches engines with injected filters). */
  assumeVisible?: boolean
}

export interface DebugOverlayHandle {
  /** Repaint now (e.g. after a programmatic layout change). */
  refresh(): void
  /** Remove the overlay and all listeners. */
  detach(): void
}

interface EngineHost {
  engine: SpatialEngine
}

const STYLE = {
  focusable: 'outline: 1px solid rgba(34, 211, 238, 0.9); background: rgba(34, 211, 238, 0.08);',
  container: 'outline: 2px dashed rgba(251, 146, 60, 0.9); outline-offset: 2px;',
  focused: 'outline: 2px solid rgba(248, 113, 113, 1); background: rgba(248, 113, 113, 0.15);',
  label:
    'position: absolute; top: 0; left: 0; font: 10px/1.6 ui-monospace, monospace; ' +
    'color: #fff; background: rgba(0, 0, 0, 0.75); padding: 0 4px; white-space: nowrap;',
}

/** Attach the overlay for a SpatialNavigation (or a bare engine). */
export function attachDebugOverlay(
  host: SpatialEngine | EngineHost,
  options: DebugOverlayOptions = {},
): DebugOverlayHandle {
  const engine = 'engine' in host ? host.engine : host
  const root = engine.root
  const doc = root.nodeType === 9 ? (root as Document) : (root as HTMLElement).ownerDocument
  const win = doc.defaultView
  const selector = options.focusableSelector ?? DEFAULT_FOCUSABLE_SELECTOR
  const showLabels = options.labels ?? true
  const visible = options.assumeVisible ? () => true : isElementVisible

  const layer = doc.createElement('div')
  layer.setAttribute('data-spatial-debug-overlay', '')
  layer.style.cssText =
    'position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; overflow: visible;'
  doc.body.appendChild(layer)

  const box = (rect: DOMRect, css: string, label?: string): void => {
    const el = doc.createElement('div')
    el.style.cssText =
      `position: absolute; left: ${rect.left}px; top: ${rect.top}px; ` +
      `width: ${rect.width}px; height: ${rect.height}px; box-sizing: border-box; ${css}`
    if (label && showLabels) {
      const tag = doc.createElement('span')
      tag.style.cssText = STYLE.label
      tag.textContent = label
      el.appendChild(tag)
    }
    layer.appendChild(el)
  }

  const refresh = (): void => {
    layer.textContent = ''
    const scope: ParentNode = root
    const focused = engine.getFocused()

    for (const container of scope.querySelectorAll<HTMLElement>('[data-spatial-container]')) {
      const config = readNavConfig(container)
      const tokens = [config.trap && 'contain', config.wrap && 'wrap', config.remember && 'remember']
        .filter(Boolean)
        .join(' ')
      box(container.getBoundingClientRect(), STYLE.container, `⬚ ${tokens || 'group'}`)
    }

    const focusables = getFocusables(scope, selector, visible)
    focusables.forEach((el, index) => {
      const isFocused = el === focused
      box(el.getBoundingClientRect(), isFocused ? STYLE.focused : STYLE.focusable, `${index}`)
    })
  }

  const onMutate = (): void => refresh()
  doc.addEventListener('spatial:focus', onMutate)
  win?.addEventListener('resize', onMutate)
  win?.addEventListener('scroll', onMutate, { capture: true, passive: true })
  refresh()

  return {
    refresh,
    detach() {
      doc.removeEventListener('spatial:focus', onMutate)
      win?.removeEventListener('resize', onMutate)
      win?.removeEventListener('scroll', onMutate, { capture: true })
      layer.remove()
    },
  }
}
