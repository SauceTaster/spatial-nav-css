/**
 * Settings — a category rail on the left, a panel on the right.
 *
 * The classic two-pane layout is also the one that most needs focus memory on
 * *both* sides: you go rail → panel → change three things → back to the rail →
 * next category, and every one of those crossings should land where you left.
 * Both zones are `remember`; neither is `contain`, because this is a view and
 * not an overlay — containment here would trap the user inside Settings.
 *
 * Getting *out* of the panel is the interesting problem on a D-pad:
 *
 *  - value controls own left/right, so the leftward door is not free. B/Escape
 *    inside the panel therefore returns to the rail (below), and only a second
 *    press leaves Settings — the shell owns that one.
 *  - a focused text input swallows every arrow *and* Escape (the keyboard
 *    adapter ignores mapped keys while the target is editable, by design), so
 *    Escape is delegated at the panel, exactly as the library's recipes
 *    describe. That handler needs no nav instance: spatial focus is real DOM
 *    focus, so `.focus()` on the rail is enough for the engine to adopt it.
 */
import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { isEditable } from 'spatial-nav-css'
import { normalizeSection, SECTIONS, sectionLabel, type SectionId } from './sections'
import {
  AboutPanel,
  AudioPanel,
  DeveloperPanel,
  DisplayPanel,
  NetworkPanel,
  PerformancePanel,
  StoragePanel,
  SystemPanel,
} from './panels'
import './settings.css'

export default function SettingsView({ section }: { section?: string }) {
  const [current, setCurrent] = useState<SectionId>(() => normalizeSection(section))
  const railRef = useRef<HTMLElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  // A deep link that arrives while the view is already open (a notification
  // tapping through to Storage) still moves the selection.
  useEffect(() => {
    if (section !== undefined) setCurrent(normalizeSection(section))
  }, [section])

  const focusRail = (): boolean => {
    const target = railRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!target) return false
    target.focus()
    return true
  }

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const onBack = (event: Event) => {
      if (!focusRail()) return
      // preventDefault marks the back as handled (so the input adapter eats the
      // key); stopPropagation keeps it away from the shell's document-level
      // handler, which would otherwise pop the whole view on the same press.
      event.preventDefault()
      event.stopPropagation()
    }
    panel.addEventListener('spatial:back', onBack)
    return () => panel.removeEventListener('spatial:back', onBack)
  }, [])

  return (
    <div className="sv-root" data-testid="settings">
      <nav
        className="sv-rail"
        ref={railRef}
        aria-label="Settings sections"
        data-spatial-container="remember"
        data-testid="settings-rail"
      >
        {SECTIONS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={clsx('sv-rail-item', entry.id === current && 'is-current')}
            data-testid="settings-section"
            data-section={entry.id}
            aria-current={entry.id === current ? 'page' : undefined}
            // The preferred entry follows the selection rather than sitting on
            // the first item: a deep link into Storage should not hand focus
            // back to Display when the rail's memory is cold.
            {...(entry.id === current ? { 'data-spatial-autofocus': '' } : {})}
            onClick={() => setCurrent(entry.id)}
          >
            <span className="sv-rail-glyph" aria-hidden="true">
              {entry.glyph}
            </span>
            {entry.label}
          </button>
        ))}
      </nav>

      <section
        className="sv-panel"
        ref={panelRef}
        aria-label={sectionLabel(current)}
        data-spatial-container="remember"
        data-testid="settings-panel"
        data-section={current}
        onKeyDown={(event) => {
          // Escape delegation, per docs/recipes.md. Touch only Escape so the
          // arrow keys stay native inside the field.
          if (event.key !== 'Escape') return
          if (!isEditable(event.target)) return
          if (!focusRail()) return
          event.preventDefault()
        }}
      >
        <h1 className="sv-panel-title">{sectionLabel(current)}</h1>
        {current === 'display' ? <DisplayPanel /> : null}
        {current === 'performance' ? <PerformancePanel /> : null}
        {current === 'audio' ? <AudioPanel /> : null}
        {current === 'network' ? <NetworkPanel /> : null}
        {current === 'storage' ? <StoragePanel /> : null}
        {current === 'system' ? <SystemPanel /> : null}
        {current === 'developer' ? <DeveloperPanel /> : null}
        {current === 'about' ? <AboutPanel /> : null}
      </section>
    </div>
  )
}
