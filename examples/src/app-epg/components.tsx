/**
 * Presentational pieces of the guide. Split from App.tsx so the test can mount
 * the whole screen and reason about it the way a viewer would.
 *
 * None of these use `useFocusable`. A guide keeps hundreds of blocks mounted
 * and re-windows them on every scroll; one document-level `spatial:focus`
 * listener in App.tsx costs one subscription instead of one per block, and the
 * focus ring comes from the engine's `.spatial-focused` class, which needs no
 * React state at all.
 */
import { memo, type CSSProperties, type Ref } from 'react'
import type { Channel, Programme } from '../shared/api/db'
import {
  CHANNEL_W,
  PX_PER_MIN,
  ROW_H,
  ROW_PAD,
  blockBox,
  formatTime,
  hourTicks,
  laneWidth,
  type Lane,
  type TimeWindow,
} from './guide'

export function TimeBar({
  win,
  viewportRef,
}: {
  win: TimeWindow
  viewportRef: Ref<HTMLDivElement>
}) {
  return (
    <div className="epg-timebar" data-testid="epg-timebar">
      <div className="epg-timebar-corner" style={{ width: CHANNEL_W }}>
        Channel
      </div>
      {/* Its own clipped viewport, scrolled from the grid's onScroll. Putting
          it inside the grid instead would make it a virtualizer row and force
          a scrollMargin; this stays two independent boxes. */}
      <div className="epg-timebar-viewport" ref={viewportRef}>
        <div className="epg-timebar-track" style={{ width: laneWidth(win) }}>
          {hourTicks(win).map((min) => (
            <span key={min} className="epg-tick" style={{ left: (min - win.from) * PX_PER_MIN }}>
              {formatTime(min)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function NowLine({ win, nowMin }: { win: TimeWindow; nowMin: number }) {
  if (nowMin < win.from || nowMin >= win.to) return null
  return (
    <div
      className="epg-now"
      data-testid="epg-now"
      aria-hidden="true"
      style={{ left: CHANNEL_W + (nowMin - win.from) * PX_PER_MIN }}
    />
  )
}

function ChannelCell({ channel, index }: { channel: Channel; index: number }) {
  return (
    <button
      type="button"
      className="epg-channel"
      data-testid="epg-channel"
      data-channel-id={channel.id}
      // The row index attachVirtualEdges reads to continue past the mounted
      // window. Blocks in this row carry the same value.
      data-index={index}
      // Nothing exists to the left of the channel column, and saying so beats
      // letting geometry answer: the cell is `position: sticky`, so once the
      // guide is scrolled right, programmes hidden *underneath* it still report
      // rects further left. The engine has no notion of occlusion and would
      // move focus to a block the viewer cannot see.
      data-nav-left="none"
      // The height must match a programme block's exactly. The engine's
      // "overlapping" tier asks whether a candidate reaches further in the
      // direction of travel (candidate.bottom > origin.bottom for down), so a
      // full-row-height cell beside inset blocks counts as being *below* every
      // block in its own row — and "down" from a programme lands on its own
      // channel cell.
      style={{ width: CHANNEL_W, height: ROW_H - ROW_PAD * 2, alignSelf: 'center' }}
    >
      <span className="epg-channel-number">{channel.number}</span>
      <span className="epg-channel-name">{channel.name}</span>
    </button>
  )
}

function ProgrammeBlock({
  programme,
  index,
  win,
  nowMin,
  recorded,
  onActivate,
}: {
  programme: Programme
  index: number
  win: TimeWindow
  nowMin: number
  recorded: boolean
  onActivate: (programme: Programme) => void
}) {
  const box = blockBox(programme, win)
  const end = programme.startMin + programme.durationMin
  const onAir = nowMin >= programme.startMin && nowMin < end
  return (
    <button
      type="button"
      className={`epg-programme${onAir ? ' is-onair' : ''}${recorded ? ' is-recorded' : ''}`}
      data-testid="epg-programme"
      data-programme-id={programme.id}
      data-channel-id={programme.channelId}
      data-index={index}
      data-start-min={programme.startMin}
      data-duration-min={programme.durationMin}
      style={{ left: box.left, width: box.width, top: ROW_PAD, height: ROW_H - ROW_PAD * 2 }}
      onClick={() => onActivate(programme)}
    >
      <span className="epg-programme-title">{programme.title}</span>
      <span className="epg-programme-time">
        {formatTime(programme.startMin)}
        {recorded ? ' · ●' : ''}
      </span>
    </button>
  )
}

/**
 * Memoized: the detail panel re-renders on every focus move, and without this
 * that would re-render every mounted block (hundreds of buttons) each time the
 * viewer presses an arrow key.
 */
export const GuideRow = memo(function GuideRow({
  lane,
  index,
  top,
  win,
  nowMin,
  recorded,
  onActivate,
}: {
  lane: Lane
  index: number
  top: number
  win: TimeWindow
  nowMin: number
  recorded: ReadonlySet<string>
  onActivate: (programme: Programme) => void
}) {
  return (
    /*
      Each row is a spatial zone, and the two omissions matter more than the
      attribute itself:

      - no `contain`: containment on a row would trap the viewer in one
        channel forever. `contain` is for modal UI only.
      - no `remember`: a row that remembered its last block would make "down"
        land on wherever you were last on that channel instead of on what is
        on at the time you are looking at — the opposite of an EPG.

      What the plain zone buys: left/right resolve inside the row first, so a
      rightward move can never drift diagonally into another channel, and a
      vertical move picks the *row* first and only then the block inside it
      that overlaps the cursor column.
    */
    <div
      className="epg-row"
      data-testid="epg-row"
      data-row={index}
      data-spatial-container=""
      style={{ transform: `translateY(${top}px)`, height: ROW_H, width: CHANNEL_W + laneWidth(win) }}
    >
      <ChannelCell channel={lane.channel} index={index} />
      <div className="epg-lane" style={{ width: laneWidth(win) }}>
        {lane.programmes.map((programme) => (
          <ProgrammeBlock
            key={programme.id}
            programme={programme}
            index={index}
            win={win}
            nowMin={nowMin}
            recorded={recorded.has(programme.id)}
            onActivate={onActivate}
          />
        ))}
      </div>
    </div>
  )
})

export function RangeButton({
  label,
  active,
  onSelect,
}: {
  label: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`epg-range${active ? ' is-active' : ''}`}
      aria-pressed={active}
      data-testid="epg-range"
      onClick={onSelect}
    >
      {label}
    </button>
  )
}

export function DetailPanel({
  channel,
  programme,
  nowMin,
  recorded,
  onToggleRecord,
}: {
  channel: Channel | undefined
  programme: Programme | undefined
  nowMin: number
  recorded: boolean
  onToggleRecord: (programme: Programme) => void
}) {
  if (!channel || !programme) {
    return (
      <aside className="epg-detail is-empty" data-testid="epg-detail-empty">
        <p className="epg-muted">Move the focus into the guide to see what is on.</p>
      </aside>
    )
  }
  const end = programme.startMin + programme.durationMin
  const onAir = nowMin >= programme.startMin && nowMin < end
  return (
    // `remember` so leaving the panel and coming back lands on the control you
    // left. Never `contain`: the viewer has to get back to the guide.
    <aside className="epg-detail" data-spatial-container="remember" data-testid="epg-detail">
      <p className="epg-detail-channel" data-testid="epg-detail-channel">
        {channel.number} · {channel.name}
      </p>
      <h2 className="epg-detail-title" data-testid="epg-detail-title">
        {programme.title}
      </h2>
      <p className="epg-detail-time" data-testid="epg-detail-time">
        {formatTime(programme.startMin)}–{formatTime(end)} · {programme.durationMin} min
        {onAir ? ' · on now' : ''}
        {programme.isLive ? ' · live' : ''}
      </p>
      <p className="epg-muted">{programme.category}</p>
      <div className="epg-detail-actions">
        <button
          type="button"
          className="epg-primary"
          data-spatial-autofocus
          data-testid="epg-record"
          onClick={() => onToggleRecord(programme)}
        >
          {recorded ? 'Cancel recording' : 'Record'}
        </button>
        <button type="button" data-testid="epg-remind">
          Remind me
        </button>
      </div>
    </aside>
  )
}

export function RowSkeleton({ top, win }: { top: number; win: TimeWindow }) {
  const style: CSSProperties = {
    transform: `translateY(${top}px)`,
    height: ROW_H,
    width: CHANNEL_W + laneWidth(win),
  }
  return <div className="epg-row epg-row-skeleton" data-testid="epg-row-skeleton" style={style} />
}
