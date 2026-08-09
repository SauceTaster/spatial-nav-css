/**
 * Library — 420 games, virtualized, driven by a D-pad.
 *
 * Three zones, all `remember`, none `contain`: the filter rail, the grid, and
 * the section rail. Containment belongs to modal overlays; a zone the user is
 * expected to leave must never have it, or the highlight simply stops moving
 * and the device looks broken.
 *
 * The interesting part is the interaction between virtualization and spatial
 * focus. The engine navigates by measuring real elements, so it can only ever
 * reach *mounted* rows. Three things keep that honest:
 *
 *  1. a generous overscan, so an ordinary one-row step always has a tile;
 *  2. `attachVirtualEdges`, for the step that still falls off the window;
 *  3. `focusItem()`, which scrolls the virtualizer and then focuses once the
 *     row has mounted — the path every accelerated jump takes.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { observeElementRect as observeRect, useVirtualizer } from '@tanstack/react-virtual'
import { isEditable } from 'spatial-nav-css'
import { useSpatialNavigation } from 'spatial-nav-css/react'
import { attachVirtualEdges } from 'spatial-nav-css/virtual'
import { sectionEdgeFor, useFastScroll, type FastScrollStage } from '../../nav/useFastScroll'
import { osQueries } from '../../services/api'
import { formatBytes, formatPlaytime, type Game } from '../../services/device'
import { useShell } from '../../state/shell'
import { DEFAULT_FILTERS, FilterRail, type LibraryFilters } from './FilterRail'
import { SectionRail, type Section } from './SectionRail'
import { COLUMNS, GRID_FALLBACK_SIZE, OVERSCAN, ROW_HEIGHT, STRIDE_ROWS } from './constants'
import './library.css'

const COMPAT_GLYPH: Record<Game['compat'], string> = {
  verified: '✓',
  playable: '!',
  unsupported: '✕',
  unknown: '?',
}

export default function LibraryView() {
  const nav = useSpatialNavigation()
  const push = useShell((s) => s.push)
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS)
  const [stage, setStage] = useState<FastScrollStage>('item')
  const [activeLetter, setActiveLetter] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)

  const query = useQuery({
    ...osQueries.games({
      search: filters.search || undefined,
      installed: filters.installed || undefined,
      genre: filters.genre || undefined,
      compat: filters.compat || undefined,
      sort: filters.sort,
    }),
    // Keep the previous page mounted while the next one loads. Without it a
    // keystroke in the search field empties the grid for a frame, focus falls
    // to the body, and the D-pad stops responding until something re-claims
    // it — the single most jarring failure mode in a filtered console list.
    placeholderData: keepPreviousData,
  })

  const games = useMemo(() => query.data?.items ?? [], [query.data])
  const sections = useMemo(() => games.map((game) => game.sortKey[0] ?? '#'), [games])

  // Read inside DOM event handlers, which must not re-subscribe per render.
  const gamesRef = useRef(games)
  gamesRef.current = games
  const sectionsRef = useRef(sections)
  sectionsRef.current = sections

  const sectionList = useMemo<Section[]>(() => {
    const out: Section[] = []
    sections.forEach((letter, index) => {
      if (out.at(-1)?.letter !== letter) out.push({ letter, index })
    })
    return out
  }, [sections])

  const rowCount = Math.ceil(games.length / COLUMNS)
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    // Keep the real ResizeObserver, but never let a 0×0 measurement through:
    // TanStack bails out of `calculateRange` at size 0 and renders no rows,
    // which is what SSR, a background tab and jsdom all report.
    observeElementRect: (instance, cb) =>
      observeRect(instance, (rect) =>
        cb({
          width: rect.width || GRID_FALLBACK_SIZE.width,
          height: rect.height || GRID_FALLBACK_SIZE.height,
        }),
      ),
  })

  /**
   * Focus a game by index, mounting its row first if need be.
   *
   * The row is always centred rather than merely scrolled into view: every
   * caller is a *jump*, and landing on the last mounted row would leave the
   * engine with nothing below it on the very next press — which, during a
   * held D-pad, stalls the escalation entirely (no move, no
   * `spatial:beforefocus`, no repeat counted).
   *
   * Two things own this scroller's `scrollTop`: the virtualizer here and the
   * engine's scroll-into-view. They coexist because the shell configures
   * `scrollBehavior: 'instant'` — a smooth animation would still be running
   * when the next jump arrives.
   */
  const pendingFocus = useRef<number | null>(null)
  const focusItem = useCallback(
    (index: number): boolean => {
      if (index < 0 || index >= gamesRef.current.length) return false
      virtualizer.scrollToIndex(Math.floor(index / COLUMNS), { align: 'center' })
      // The scroll has not re-rendered anything yet (a browser dispatches the
      // scroll event on the next frame), so this only succeeds when the row
      // was already mounted. The layout effect below covers the other case.
      const mounted = scrollerRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      if (mounted) {
        pendingFocus.current = null
        mounted.focus()
        return true
      }
      pendingFocus.current = index
      return true
    },
    [virtualizer],
  )

  useLayoutEffect(() => {
    const index = pendingFocus.current
    if (index === null) return
    const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)
    if (!el) return
    pendingFocus.current = null
    el.focus()
  })

  // The section indicator and the pending-jump bookkeeping both key off real
  // DOM focus rather than the engine's events: `focusItem` moves focus
  // directly, and focusin is the one signal that covers every path into a
  // tile — engine, pointer, and our own jump.
  useEffect(() => {
    const zone = scrollerRef.current
    if (!zone) return
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const raw = target.dataset.index
      if (raw === undefined) return
      const index = Number(raw)
      // The user landed somewhere else while a jump was in flight; drop it
      // rather than yanking them back when that row eventually mounts.
      if (pendingFocus.current !== null && pendingFocus.current !== index) pendingFocus.current = null
      // Setting the same letter bails out inside React, so this re-renders
      // once per *section* crossed, not once per press.
      setActiveLetter(sectionsRef.current[index] ?? null)
    }
    zone.addEventListener('focusin', onFocusIn)
    return () => zone.removeEventListener('focusin', onFocusIn)
  }, [])

  useFastScroll({
    containerRef: scrollerRef,
    axis: 'vertical',
    count: () => gamesRef.current.length,
    indexOf: (el) => Number(el.dataset.index ?? -1),
    focusIndex: focusItem,
    sectionEdge: (index, delta) => sectionEdgeFor(sectionsRef.current, index, delta),
    // A grid stride has to be whole rows, or a held press walks diagonally.
    stride: COLUMNS * STRIDE_ROWS,
    onStageChange: setStage,
  })

  // The step that overscan did not cover: continue past the mounted edge by a
  // whole row. `spatial:nofocustarget` only fires when the search found
  // nothing anywhere, which is true here because the two rails sit beside the
  // grid rather than below it.
  useEffect(() => {
    const zone = scrollerRef.current
    if (!zone) return
    return attachVirtualEdges(nav, {
      zone,
      count: () => gamesRef.current.length,
      step: (index, direction) =>
        direction === 'down' ? index + COLUMNS : direction === 'up' ? index - COLUMNS : null,
      scrollToIndex: (index) =>
        virtualizer.scrollToIndex(Math.floor(index / COLUMNS), { align: 'center' }),
    })
  }, [nav, virtualizer])

  // `autofocus` is a one-shot inside start(), when this screen is still a
  // skeleton. claimFocus places focus when the data lands, and does nothing
  // if the user already moved.
  useEffect(() => {
    const first = scrollerRef.current?.querySelector<HTMLElement>('[data-index="0"]')
    if (first) nav.claimFocus(first)
  }, [nav, query.isPending])

  const patchFilters = useCallback((patch: Partial<LibraryFilters>) => {
    setFilters((current) => ({ ...current, ...patch }))
  }, [])

  /**
   * The way out of the search field.
   *
   * A focused text input keeps its arrow keys — the keyboard adapter ignores
   * every mapped key while the target is editable, Escape included — so
   * without this the field is a dead end for a device that has no Tab. One
   * delegated handler, touching only Escape, leaves typing untouched.
   */
  const onRootKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    const target = event.target
    if (!(target instanceof HTMLElement) || !isEditable(target)) return
    event.preventDefault()
    const grid = scrollerRef.current?.querySelector<HTMLElement>('[data-index]')
    // Spatial focus is real DOM focus, so this is all it takes — the engine
    // adopts the move through its own focusin listener.
    if (grid) grid.focus()
  }

  const rows = virtualizer.getVirtualItems()
  const isEmpty = games.length === 0 && !query.isPending

  return (
    <div className="lv-root" data-testid="library" onKeyDown={onRootKeyDown}>
      <FilterRail filters={filters} total={games.length} onChange={patchFilters} />

      <div
        className="lv-grid"
        ref={scrollerRef}
        data-testid="lib-grid"
        // `remember` gives the "come back to the tile you launched" feel that
        // every console library has. It is also what re-entry from the filter
        // rail relies on, since the geometric nearest tile may have scrolled
        // out of the mounted window entirely.
        data-spatial-container="remember"
      >
        {isEmpty ? (
          <div className="lv-empty">
            <p>No games match these filters.</p>
            {/* A focusable escape hatch: an empty zone would otherwise leave
                the highlight nowhere to go. */}
            <button
              type="button"
              className="os-btn os-btn-primary"
              data-testid="lib-clear"
              data-spatial-autofocus=""
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="lv-grid-total" style={{ height: virtualizer.getTotalSize() }}>
            {rows.map((row) => (
              <div
                key={row.key}
                className="lv-row"
                data-row-index={row.index}
                style={{ height: row.size, transform: `translateY(${row.start}px)` }}
              >
                {games
                  .slice(row.index * COLUMNS, row.index * COLUMNS + COLUMNS)
                  .map((game, column) => {
                    const index = row.index * COLUMNS + column
                    return (
                      <button
                        key={game.id}
                        type="button"
                        className="lv-tile os-lift"
                        data-testid="lib-tile"
                        // The flat index, read back by useFastScroll and by
                        // attachVirtualEdges (both default to data-index).
                        data-index={index}
                        data-game-id={game.id}
                        style={{ '--hue': game.hue } as CSSProperties}
                        {...(index === 0 ? { 'data-spatial-autofocus': '' } : {})}
                        onClick={() => push({ id: 'game', gameId: game.id })}
                      >
                        <span className="lv-tile-art" aria-hidden="true">
                          <span className={`lv-compat is-${game.compat}`}>
                            {COMPAT_GLYPH[game.compat]}
                          </span>
                        </span>
                        <span className="lv-tile-title">{game.title}</span>
                        <span className="lv-tile-meta">
                          {game.install === 'installed'
                            ? formatPlaytime(game.playedMinutes)
                            : formatBytes(game.sizeBytes)}
                        </span>
                      </button>
                    )
                  })}
              </div>
            ))}
          </div>
        )}
      </div>

      <SectionRail
        sections={sectionList}
        activeLetter={activeLetter}
        stage={stage}
        onJump={focusItem}
      />
    </div>
  )
}
