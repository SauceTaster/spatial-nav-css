/**
 * Event stream — a windowed list, so most of the rows do not exist in the DOM.
 *
 * Two things break naive spatial navigation here:
 *  1. past the mounted window there is nothing to navigate to, so the engine
 *     fires `spatial:nofocustarget` at the edge;
 *  2. scrolling can unmount the row that currently holds focus.
 *
 * `attachVirtualEdges` from spatial-nav-css/virtual closes (1) — compute the
 * next index, ask the virtualizer to scroll, wait for the row to mount, focus
 * it. (2) is handled by the engine's auto-restore plus `remember` on the
 * scroller, which prefers the last focused row when it is still mounted.
 *
 * Constraint worth knowing: `spatial:nofocustarget` only fires when the
 * direction finds nothing *anywhere*, not just inside this zone. The panel is
 * therefore the last thing on the page, so "down" at the mounted edge is a
 * genuine page edge rather than a jump into a lower zone.
 */
import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { format, parseISO } from 'date-fns'
import clsx from 'clsx'
import { useSpatialNavigation } from 'spatial-nav-css/react'
import { attachVirtualEdges } from 'spatial-nav-css/virtual'
import type { LogEntry } from '../shared/api/db'

const ROW_HEIGHT = 34
/** Must match `.dash-log-scroll { height }` in dashboard.css. */
const VIEWPORT_HEIGHT = 238

export function EventStream({ entries }: { entries: LogEntry[] }) {
  const nav = useSpatialNavigation()
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    // Fixed rows, so no measureElement ref: the estimate is exact, and dynamic
    // measurement would collapse every row to 0 in any environment without
    // layout. Overscan keeps a mounted candidate just past the viewport, which
    // is what makes ordinary geometric moves feel continuous.
    overscan: 4,
    // TanStack measures the scroller with offsetHeight. Anywhere without
    // layout — SSR, jsdom, a display:none tab — that is 0, and a virtualizer
    // whose viewport is 0 renders *no* rows at all, so the spatial engine
    // would find nothing to focus in this zone. The panel's height is fixed
    // in CSS, so fall back to it rather than rendering an empty list.
    observeElementRect: (instance, cb) => {
      const el = instance.scrollElement
      if (!el) return
      const emit = (): void => cb({ width: el.offsetWidth, height: el.offsetHeight || VIEWPORT_HEIGHT })
      emit()
      if (typeof ResizeObserver !== 'function') return
      const observer = new ResizeObserver(emit)
      observer.observe(el)
      return () => observer.disconnect()
    },
  })

  useEffect(() => {
    const zone = scrollRef.current
    if (!zone) return
    return attachVirtualEdges(nav, {
      zone,
      count: () => entries.length,
      scrollToIndex: (index) => virtualizer.scrollToIndex(index),
    })
  }, [nav, virtualizer, entries.length])

  return (
    <section className="dash-panel dash-log" data-testid="log-panel">
      <div className="dash-panel-head">
        <h2>Event stream</h2>
        <span className="dash-muted" data-testid="log-count">
          {entries.length} events
        </span>
      </div>
      {/*
        The scroller is the zone. `remember` so returning from the grid lands
        on the event you were reading; no `contain`, because a log panel you
        cannot navigate out of is a dead end.
      */}
      <div
        className="dash-log-scroll"
        ref={scrollRef}
        data-spatial-container="remember"
        data-testid="log-scroller"
      >
        <div className="dash-log-inner" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const entry = entries[item.index]
            if (!entry) return null
            return (
              <div
                key={item.key}
                className={clsx('dash-log-row', `is-${entry.level}`)}
                data-focusable
                data-testid="log-row"
                // TanStack's own measurement convention already puts the index
                // here; attachVirtualEdges reads it to continue past the edge.
                data-index={item.index}
                data-log-id={entry.id}
                style={{ height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }}
              >
                <span className="dash-log-time">{format(parseISO(entry.at), 'HH:mm:ss')}</span>
                <span className="dash-log-level">{entry.level}</span>
                <span className="dash-log-service">{entry.service}</span>
                <span className="dash-log-message">{entry.message}</span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
