/**
 * EPG — a 2D virtualized time × channel guide.
 *
 * This is the hardest shape spatial navigation has to handle, and every hard
 * part is here on purpose:
 *
 *  - Blocks are sized by duration, so rows do not line up into a grid. "Down"
 *    cannot be `index + columns`; it has to be geometry, and it has to land on
 *    whatever is actually below the cursor's time column.
 *  - Rows are windowed by @tanstack/react-virtual, so the focused element can
 *    be unmounted by a scroll (autoRestoreFocus) and navigation can run off
 *    the end of the mounted range (`attachVirtualEdges`).
 *  - The channel column is sticky and lives inside each row, so crossing
 *    between the list and the grid is a plain horizontal move, not a mode.
 *  - The detail panel is driven by one document-level `spatial:focus`
 *    listener rather than per-block React state.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from 'react'
import { useVirtualizer, type VirtualizerOptions } from '@tanstack/react-virtual'
import { useSpatialEvent, useSpatialNavigation } from 'spatial-nav-css/react'
import { attachVirtualEdges } from 'spatial-nav-css/virtual'
import { useChannels, useProgrammes } from './api'
import { DetailPanel, GuideRow, NowLine, RangeButton, RowSkeleton, TimeBar } from './components'
import type { Programme } from '../shared/api/db'
import {
  CHANNEL_W,
  DAY_MIN,
  ROW_H,
  cursorMinute,
  laneWidth,
  minuteOfDay,
  programmeAt,
  toLanes,
  type TimeWindow,
} from './guide'

const RANGES: Array<{ id: string; label: string; window: TimeWindow }> = [
  { id: 'all', label: 'All day', window: { from: 0, to: DAY_MIN } },
  { id: 'daytime', label: 'Daytime', window: { from: 6 * 60, to: 18 * 60 } },
  { id: 'evening', label: 'Evening', window: { from: 17 * 60, to: DAY_MIN } },
]

const SKELETON_ROWS = 6

/** Where the viewer is standing: which minute column, and in which half of the row. */
interface Cursor {
  minute: number
  inGrid: boolean
}

/**
 * The row element a virtual advance should land on.
 *
 * `attachVirtualEdges`' default `findElement` returns the first
 * `[data-index="i"]` in the zone, which in a guide is always the midnight
 * programme — pressing down would silently teleport the viewer to 00:00. A
 * guide has to keep its time column, so resolve the block that covers the
 * cursor minute instead (and the channel cell when that is where focus was).
 */
function findAtCursor(zone: HTMLElement, index: number, cursor: Cursor): HTMLElement | null {
  if (!cursor.inGrid) {
    return zone.querySelector<HTMLElement>(`[data-channel-id]:not([data-programme-id])[data-index="${index}"]`)
  }
  const blocks = zone.querySelectorAll<HTMLElement>(`[data-programme-id][data-index="${index}"]`)
  for (const block of blocks) {
    const start = Number(block.dataset.startMin)
    const end = start + Number(block.dataset.durationMin)
    if (cursor.minute >= start && cursor.minute < end) return block
  }
  return blocks[0] ?? null
}

export interface AppProps {
  /** Minute-of-day for the "now" marker. Defaults to the wall clock. */
  nowMin?: number
  /**
   * TanStack Virtual's documented headless hooks. jsdom performs no layout and
   * ignores `scrollTo`, so the test injects rect/offset observation and
   * scrolling; the browser uses the library defaults.
   */
  virtual?: Partial<VirtualizerOptions<HTMLDivElement, Element>>
}

export function App({ nowMin = minuteOfDay(), virtual }: AppProps) {
  const [rangeId, setRangeId] = useState(RANGES[0]!.id)
  const [recorded, setRecorded] = useState<ReadonlySet<string>>(() => new Set())
  const [selection, setSelection] = useState<{ channelId: string; programmeId: string | null } | null>(null)
  const [edge, setEdge] = useState<string | null>(null)

  const win = (RANGES.find((range) => range.id === rangeId) ?? RANGES[0]!).window
  const channels = useChannels()
  const programmes = useProgrammes(win)
  const lanes = useMemo(
    () => toLanes(channels.data?.items ?? [], programmes.data?.items ?? []),
    [channels.data, programmes.data],
  )

  const nav = useSpatialNavigation()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const timebarRef = useRef<HTMLDivElement>(null)
  // Read by findAtCursor from inside attachVirtualEdges, which is called
  // outside React's render cycle — a ref, not state, so it is always current
  // and never re-renders the grid.
  const cursor = useRef<Cursor>({ minute: win.from, inGrid: true })

  const rowVirtualizer = useVirtualizer<HTMLDivElement, Element>({
    count: lanes.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => ROW_H,
    // Overscan is what makes ordinary navigation work: with rows mounted past
    // the visible edge, "down" always has a real geometric candidate and the
    // engine's own scrollIntoView re-windows the list. attachVirtualEdges is
    // the fallback for the true boundary of the mounted range.
    overscan: 3,
    ...virtual,
  })
  const rows = rowVirtualizer.getVirtualItems()

  useEffect(() => {
    const zone = scrollerRef.current
    if (!zone || lanes.length === 0) return
    return attachVirtualEdges(nav, {
      zone,
      count: () => lanes.length,
      scrollToIndex: (index) => rowVirtualizer.scrollToIndex(index),
      findElement: (index) => findAtCursor(zone, index, cursor.current),
    })
  }, [nav, rowVirtualizer, lanes.length])

  // One listener for the whole guide. Every focusable in the grid carries its
  // channel (and a block also its programme and time span), so the panel and
  // the cursor can be derived from the event target alone.
  useSpatialEvent('spatial:focus', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const channelId = target.dataset.channelId
    if (channelId === undefined) return // focus went to the toolbar or the panel
    const programmeId = target.dataset.programmeId ?? null
    if (programmeId !== null) {
      const span = {
        startMin: Number(target.dataset.startMin),
        durationMin: Number(target.dataset.durationMin),
      }
      cursor.current = { minute: cursorMinute(span, win), inGrid: true }
    } else {
      // Stepping into the channel list keeps the time column, so coming back
      // out lands where you left rather than at midnight.
      cursor.current = { ...cursor.current, inGrid: false }
    }
    setSelection({ channelId, programmeId })
  })

  useSpatialEvent('spatial:nofocustarget', (event) => {
    setEdge(event.detail.direction)
  })

  // Data lands after the engine started, so `autofocus` would have fired on an
  // empty grid. claimFocus places focus only while nothing holds it — a viewer
  // who already started navigating is never yanked, and re-running it as the
  // window changes costs nothing. Keyed on mounted rows, not on lanes: the
  // virtualizer publishes its first range one render after the count arrives.
  useEffect(() => {
    if (rows.length === 0) return
    const first = scrollerRef.current?.querySelector<HTMLElement>('[data-programme-id]')
    if (first) nav.claimFocus(first)
  }, [nav, rows.length])

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const bar = timebarRef.current
    if (bar) bar.scrollLeft = event.currentTarget.scrollLeft
  }, [])

  const toggleRecord = useCallback((programme: Programme) => {
    setRecorded((previous) => {
      const next = new Set(previous)
      if (!next.delete(programme.id)) next.add(programme.id)
      return next
    })
  }, [])

  const lane = lanes.find((entry) => entry.channel.id === selection?.channelId)
  const selected = selection?.programmeId
    ? lane?.programmes.find((programme) => programme.id === selection.programmeId)
    : lane && programmeAt(lane, nowMin)
  const pending = lanes.length === 0

  return (
    <div className="epg-root">
      <header className="epg-head">
        <h1>TV Guide</h1>
        <p className="epg-muted" data-testid="count">
          {pending
            ? 'Loading…'
            : `${lanes.length} channels · ${programmes.data?.items.length ?? 0} programmes · ${rows.length} rows mounted`}
        </p>
      </header>

      <div className="epg-main">
        <TimeBar win={win} viewportRef={timebarRef} />
        {/*
          The guide is one zone with `remember`, so leaving for the panel or the
          toolbar and coming back returns to the block you were on. Deliberately
          NOT `contain`: containing the grid would make the guide a roach motel —
          you could enter it and never reach the panel again.
        */}
        <div
          className="epg-scroller"
          ref={scrollerRef}
          onScroll={onScroll}
          data-spatial-container="remember"
          data-testid="epg-grid"
        >
          <div
            className="epg-canvas"
            style={{
              height: pending ? SKELETON_ROWS * ROW_H : rowVirtualizer.getTotalSize(),
              width: CHANNEL_W + laneWidth(win),
            }}
          >
            <NowLine win={win} nowMin={nowMin} />
            {pending
              ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <RowSkeleton key={i} top={i * ROW_H} win={win} />
                ))
              : rows.map((row) => (
                  <GuideRow
                    key={lanes[row.index]!.channel.id}
                    lane={lanes[row.index]!}
                    index={row.index}
                    top={row.start}
                    win={win}
                    nowMin={nowMin}
                    recorded={recorded}
                    onActivate={toggleRecord}
                  />
                ))}
          </div>
        </div>
        <p className="epg-foot" data-testid="edge">
          {edge ? `Edge: ${edge}` : '←↑↓→ moves · Enter records · the guide keeps your time column'}
        </p>
      </div>

      <div className="epg-side">
        {/* A toolbar zone above the guide: `remember` so re-entering returns to
            the range you picked, and no `contain` so ↓ goes back to the grid. */}
        <nav className="epg-ranges" data-spatial-container="remember" data-testid="epg-ranges">
          {RANGES.map((range) => (
            <RangeButton
              key={range.id}
              label={range.label}
              active={range.id === rangeId}
              onSelect={() => setRangeId(range.id)}
            />
          ))}
        </nav>
        <DetailPanel
          channel={lane?.channel}
          programme={selected}
          nowMin={nowMin}
          recorded={selected ? recorded.has(selected.id) : false}
          onToggleRecord={toggleRecord}
        />
      </div>
    </div>
  )
}
