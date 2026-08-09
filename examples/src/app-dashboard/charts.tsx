/**
 * Charts — and the reason a chart is never a spatial stop.
 *
 * Recharts renders one <svg> per chart. The bars and points inside it are not
 * focusable elements, and making the wrapper focusable would give the user a
 * single dead stop the size of the panel. So the chart surface carries no
 * `data-focusable`; a row of real <button>s above it is the spatial surface,
 * and the chart is what those buttons render. Same house rule as the ECharts
 * remix (src/remix-echarts/Example.tsx).
 *
 * The gotcha that is *not* obvious: recharts >= 3 defaults
 * `accessibilityLayer` to true, which renders the root
 * `<svg role="application" tabindex="0">` and binds its own arrow-key cursor
 * to it. That makes the canvas a real spatial stop after all, and puts two
 * systems on the same arrow keys. `accessibilityLayer={false}` turns both off;
 * the labelled wrapper plus the controls carry the semantics instead. Pinned
 * by a test, because a recharts upgrade could quietly re-enable it.
 */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import type { MetricPoint, StoragePool } from '../shared/api/db'

export const RANGES = [
  { id: '6h', label: 'Last 6h', points: 6 },
  { id: '24h', label: 'Last 24h', points: 24 },
  { id: '48h', label: 'Last 48h', points: 48 },
] as const

export type RangeId = (typeof RANGES)[number]['id']

export const SERIES = [
  { id: 'cpu', label: 'CPU', color: '#1a9fff', unit: '%' },
  { id: 'memory', label: 'Memory', color: '#4ad991', unit: '%' },
  { id: 'networkMbps', label: 'Network', color: '#f0a24b', unit: 'Mbps' },
] as const

export type SeriesId = (typeof SERIES)[number]['id']

const AXIS = { stroke: '#4a6076', fontSize: 10 }

/**
 * Recharts needs pixel dimensions. `ResponsiveContainer` would do it, but it
 * depends on a live ResizeObserver, so the width is measured here with an
 * explicit fallback instead: the fallback is what renders during SSR, before
 * first measure, and under jsdom — none of which have layout.
 */
function useMeasuredWidth(fallback: number): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(() => {
      const next = Math.round(el.getBoundingClientRect().width)
      if (next > 0) setWidth(next)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

export function ChartControls({
  range,
  series,
  onRange,
  onToggleSeries,
}: {
  range: RangeId
  series: readonly SeriesId[]
  onRange: (id: RangeId) => void
  onToggleSeries: (id: SeriesId) => void
}) {
  return (
    // A plain row of stops. No `contain` — the user has to be able to leave a
    // toolbar in every direction, and containment here would be a one-way door.
    <div className="dash-controls">
      {RANGES.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={clsx('dash-control', range === entry.id && 'is-active')}
          data-testid="chart-control"
          data-control={`range-${entry.id}`}
          aria-pressed={range === entry.id}
          onClick={() => onRange(entry.id)}
        >
          {entry.label}
        </button>
      ))}
      {SERIES.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={clsx('dash-control', series.includes(entry.id) && 'is-active')}
          data-testid="chart-control"
          data-control={`series-${entry.id}`}
          aria-pressed={series.includes(entry.id)}
          style={{ '--series': entry.color } as React.CSSProperties}
          onClick={() => onToggleSeries(entry.id)}
        >
          {entry.label}
        </button>
      ))}
    </div>
  )
}

export function MetricsChart({
  points,
  series,
}: {
  points: MetricPoint[]
  series: readonly SeriesId[]
}) {
  const [ref, width] = useMeasuredWidth(520)
  return (
    <div
      className="dash-canvas"
      ref={ref}
      data-testid="metrics-chart"
      role="img"
      aria-label={`Utilization over the last ${points.length} samples: ${SERIES.filter((entry) => series.includes(entry.id))
        .map((entry) => entry.label)
        .join(', ')}`}
    >
      <AreaChart
        width={width}
        height={190}
        data={points}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        accessibilityLayer={false}
      >
        <CartesianGrid stroke="#243244" strokeDasharray="2 4" />
        <XAxis dataKey="t" tickLine={false} axisLine={false} tick={AXIS} />
        <YAxis width={34} tickLine={false} axisLine={false} tick={AXIS} />
        <Tooltip contentStyle={{ background: '#131a24', border: '1px solid #24384e', fontSize: 12 }} />
        {SERIES.filter((entry) => series.includes(entry.id)).map((entry) => (
          <Area
            key={entry.id}
            type="monotone"
            dataKey={entry.id}
            name={entry.label}
            stroke={entry.color}
            fill={entry.color}
            fillOpacity={0.16}
            strokeWidth={2}
            // Animation would keep a requestAnimationFrame loop alive across
            // assertions; the data is already live-updating from the query.
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </div>
  )
}

export function StorageChart({ pools }: { pools: StoragePool[] }) {
  const [ref, width] = useMeasuredWidth(520)
  const data = pools.map((pool) => ({
    name: pool.name,
    used: pool.usedGB,
    free: pool.totalGB - pool.usedGB,
  }))
  return (
    <div
      className="dash-canvas"
      ref={ref}
      data-testid="storage-chart"
      role="img"
      aria-label={`Storage per pool: ${pools
        .map((pool) => `${pool.name} ${Math.round((pool.usedGB / pool.totalGB) * 100)}% used`)
        .join(', ')}`}
    >
      <BarChart
        width={width}
        height={150}
        data={data}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        accessibilityLayer={false}
      >
        <CartesianGrid stroke="#243244" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} tick={AXIS} />
        <YAxis width={44} tickLine={false} axisLine={false} tick={AXIS} />
        <Tooltip contentStyle={{ background: '#131a24', border: '1px solid #24384e', fontSize: 12 }} />
        <Bar dataKey="used" stackId="pool" fill="#1a9fff" isAnimationActive={false} />
        <Bar dataKey="free" stackId="pool" fill="#24384e" isAnimationActive={false} />
      </BarChart>
    </div>
  )
}
