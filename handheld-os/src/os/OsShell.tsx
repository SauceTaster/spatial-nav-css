/**
 * The shell: status bar, the view stack, the overlay layer, and the one place
 * that owns "back".
 *
 * Containment policy, in one place so it can be reasoned about:
 *  - Exactly one layer is interactive at a time. When an overlay is open, the
 *    view stack beneath it is `inert` — which the engine honours
 *    unconditionally, so directional navigation cannot reach it, and neither
 *    can Tab or a pointer.
 *  - `contain` on the overlay itself is belt-and-braces for the directional
 *    search; `inert` is what makes it true for everything else.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useSpatialEvent, useSpatialNavigation } from 'spatial-nav-css/react'
import { activeOverlay, currentView, useShell } from '../state/shell'
import { StatusBar } from './StatusBar'
import { QuickAccess } from './QuickAccess'
import { OverlaySheet } from './OverlaySheet'
import { ConfirmDialog } from './ConfirmDialog'
import { ViewRouter } from './ViewRouter'
import './shell.css'

export function OsShell() {
  const nav = useSpatialNavigation()
  const views = useShell((s) => s.views)
  const overlays = useShell((s) => s.overlays)
  const overlay = useShell(activeOverlay)
  const view = useShell(currentView)
  const back = useShell((s) => s.back)
  const openQuickAccess = useShell((s) => s.openQuickAccess)
  const notice = useShell((s) => s.notice)
  const stageRef = useRef<HTMLDivElement>(null)

  const overlayOpen = overlays.length > 0

  // B / Escape: pop the overlay, then the view. Handled once, here.
  useSpatialEvent('spatial:back', (event) => {
    if (back()) event.preventDefault()
  })

  // The quick-access menu has a dedicated button on the device, mapped here to
  // the keyboard's Q and the gamepad's Select via the keymap in main.tsx.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'q' || event.repeat) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable]')) return
      event.preventDefault()
      if (overlayOpen) back()
      else openQuickAccess()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overlayOpen, back, openQuickAccess])

  /**
   * Each view is a `remember` zone keyed by its position in the stack, so
   * popping back to Library returns to the card you left. The engine holds
   * that memory against the container element; keeping the key stable across
   * a push/pop is what makes it survive.
   */
  const stageKey = useMemo(() => views.map((v) => v.id).join('/'), [views])

  // When the overlay closes, hand focus back to the view underneath. The
  // engine restores within a zone; crossing layers is the shell's job.
  const previousOverlayOpen = useRef(overlayOpen)
  const restoreToStage = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    // Prefer the element the engine still remembers for this view.
    const remembered = stage.querySelector<HTMLElement>('[data-spatial-focused]')
    if (remembered) {
      remembered.focus()
      return
    }
    nav.claimFocus(stage.querySelector<HTMLElement>('[data-spatial-autofocus]') ?? undefined)
  }, [nav])

  useEffect(() => {
    if (previousOverlayOpen.current && !overlayOpen) restoreToStage()
    previousOverlayOpen.current = overlayOpen
  }, [overlayOpen, restoreToStage])

  return (
    <div className="os-root" data-testid="os-root">
      <StatusBar />

      {/*
        `inert` while an overlay is up. This is the load-bearing line for
        containment: the engine excludes inert subtrees unconditionally, so no
        custom visibility filter or container marker can accidentally re-expose
        the screen behind the quick-access menu.
      */}
      <div
        className="os-stage"
        ref={stageRef}
        data-testid="os-stage"
        // React 19 renders the inert attribute from a boolean.
        inert={overlayOpen}
        aria-hidden={overlayOpen || undefined}
      >
        <div key={stageKey} className="os-view" data-spatial-container="remember">
          <ViewRouter view={view} />
        </div>
      </div>

      {overlay?.kind === 'quick-access' ? <QuickAccess overlay={overlay} /> : null}
      {overlay?.kind === 'sheet' ? <OverlaySheet spec={overlay.sheet} /> : null}
      {overlay?.kind === 'confirm' ? <ConfirmDialog spec={overlay.confirm} /> : null}

      <div className="os-notice" role="status" data-testid="notice">
        {notice}
      </div>
    </div>
  )
}
