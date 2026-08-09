/**
 * Pure guide geometry.
 *
 * An EPG is the one screen where "where am I?" is a time, not a column index:
 * a 2-hour block spans four 30-minute slots, so rows never line up. Every
 * pixel the components draw comes from the functions below, and the test
 * reuses them to build the jsdom rects — so the geometry the engine navigates
 * is the geometry the browser paints, not a second guess at it.
 */
import type { Channel, Programme } from '../shared/api/db'

export const DAY_MIN = 24 * 60
/** Sticky channel column, px. */
export const CHANNEL_W = 200
/** Timeline scale: a 30-minute programme is 60px wide. */
export const PX_PER_MIN = 2
/** One channel row, px. Fixed height, so the virtualizer never has to measure. */
export const ROW_H = 64
/** Vertical inset of a block inside its row, px. */
export const ROW_PAD = 4

export interface TimeWindow {
  from: number
  to: number
}

export interface Lane {
  channel: Channel
  programmes: Programme[]
}

/** The part of a programme the geometry helpers actually need. */
export interface Span {
  startMin: number
  durationMin: number
}

/** One row per channel, programmes in time order. */
export function toLanes(channels: Channel[], programmes: Programme[]): Lane[] {
  const byChannel = new Map<string, Programme[]>()
  for (const programme of programmes) {
    const list = byChannel.get(programme.channelId)
    if (list) list.push(programme)
    else byChannel.set(programme.channelId, [programme])
  }
  return channels.map((channel) => ({
    channel,
    programmes: [...(byChannel.get(channel.id) ?? [])].sort((a, b) => a.startMin - b.startMin),
  }))
}

/** Visible span of a programme, clipped to the guide window. */
export function clipToWindow(span: Span, win: TimeWindow): { start: number; end: number } {
  return {
    start: Math.max(span.startMin, win.from),
    end: Math.min(span.startMin + span.durationMin, win.to),
  }
}

/** Left edge and width of a block, px relative to the lane's origin. */
export function blockBox(span: Span, win: TimeWindow): { left: number; width: number } {
  const { start, end } = clipToWindow(span, win)
  return { left: (start - win.from) * PX_PER_MIN, width: Math.max(end - start, 0) * PX_PER_MIN }
}

export function laneWidth(win: TimeWindow): number {
  return (win.to - win.from) * PX_PER_MIN
}

/**
 * The minute under a block's horizontal centre — the "cursor column" a
 * vertical move should stay in. Clipped, so a block half outside the window
 * reports the centre of what is actually drawn.
 */
export function cursorMinute(span: Span, win: TimeWindow): number {
  const { start, end } = clipToWindow(span, win)
  return (start + end) / 2
}

/** The programme on air at `minute`, if any. */
export function programmeAt(lane: Lane, minute: number): Programme | undefined {
  return lane.programmes.find(
    (programme) => minute >= programme.startMin && minute < programme.startMin + programme.durationMin,
  )
}

/** Hour marks inside the window, for the time-of-day header. */
export function hourTicks(win: TimeWindow): number[] {
  const ticks: number[] = []
  for (let min = Math.ceil(win.from / 60) * 60; min < win.to; min += 60) ticks.push(min)
  return ticks
}

export function formatTime(min: number): string {
  const wrapped = ((Math.round(min) % DAY_MIN) + DAY_MIN) % DAY_MIN
  const hh = String(Math.floor(wrapped / 60)).padStart(2, '0')
  const mm = String(wrapped % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Minutes since local midnight — only used for the live "now" marker. */
export function minuteOfDay(at: Date = new Date()): number {
  return at.getHours() * 60 + at.getMinutes()
}
