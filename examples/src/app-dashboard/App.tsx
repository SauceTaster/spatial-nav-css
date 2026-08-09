/**
 * Ops dashboard — the "can spatial navigation actually drive admin tooling?"
 * screen: KPI tiles, charts, a dense sortable/filterable/selectable data grid,
 * and a virtualized event stream.
 *
 * What it stresses in the engine:
 *  - five sibling zones stacked in two axes, none of them containing focus
 *  - a 2D field of ~50 cell-stops whose identity changes under the highlight
 *    on every sort, filter and page change
 *  - a chart that is deliberately *not* a stop, driven by controls that are
 *  - a windowed list where the focused row can stop existing
 *
 * Zone layout (top to bottom):
 *   tiles            ── overview, read-only stops
 *   charts | services ── side by side, so ←→ crosses between them
 *   grid             ── the dense one
 *   event stream     ── virtualized, last on the page on purpose
 */
import { useState } from 'react'
import { useContentFocus } from '../shared/useContentFocus'
import { useCatalog, useEventLog, useMetrics, useServiceAction, useServices, useStorage } from './api'
import { ChartControls, MetricsChart, RANGES, SERIES, StorageChart, type RangeId, type SeriesId } from './charts'
import { CatalogGrid } from './grid'
import { EventStream } from './log-stream'
import { ServiceRow, StatTile, StatTileSkeleton, type Stat } from './tiles'

const round = (n: number): string => (Math.round(n * 10) / 10).toFixed(1)

export function App() {
  const metrics = useMetrics()
  const services = useServices()
  const storage = useStorage()
  const catalog = useCatalog()
  const log = useEventLog()
  const action = useServiceAction()

  const [range, setRange] = useState<RangeId>('24h')
  const [series, setSeries] = useState<SeriesId[]>(['cpu', 'memory'])

  const points = metrics.data?.items ?? []
  const pools = storage.data?.items ?? []
  const running = services.data?.items ?? []
  const games = catalog.data?.items ?? []

  const ready = points.length > 0 && pools.length > 0 && running.length > 0 && games.length > 0

  // Provider `autofocus` fires at start(), when every panel is still a
  // skeleton — it would leave focus on page chrome. Claim the first tile once
  // the real numbers exist; claimFocus is a no-op if the user already moved.
  useContentFocus(ready, '[data-testid="stat-tile"]')

  const healthy = running.filter((service) => service.state === 'running').length
  const usedGB = pools.reduce((total, pool) => total + pool.usedGB, 0)
  const totalGB = pools.reduce((total, pool) => total + pool.totalGB, 0)
  const deployed = games.filter((game) => game.installed).length

  const stats: Stat[] = ready
    ? [
        {
          id: 'cpu',
          label: 'Peak CPU',
          value: `${round(Math.max(...points.map((point) => point.cpu)))}%`,
          detail: `avg ${round(points.reduce((n, p) => n + p.cpu, 0) / points.length)}% over ${points.length}h`,
        },
        {
          id: 'services',
          label: 'Services up',
          value: `${healthy}/${running.length}`,
          detail: healthy === running.length ? 'all healthy' : `${running.length - healthy} need attention`,
          tone: healthy === running.length ? 'ok' : 'warn',
        },
        {
          id: 'storage',
          label: 'Storage used',
          value: `${Math.round((usedGB / totalGB) * 100)}%`,
          detail: `${round(usedGB / 1000)} TB of ${round(totalGB / 1000)} TB`,
          tone: pools.some((pool) => pool.health !== 'healthy') ? 'warn' : 'ok',
        },
        {
          id: 'catalog',
          label: 'Deployed titles',
          value: `${deployed}/${games.length}`,
          detail: `${round(games.reduce((n, g) => n + g.sizeGB, 0) / 1000)} TB on disk`,
        },
      ]
    : []

  const windowed = points.slice(-(RANGES.find((entry) => entry.id === range)?.points ?? 24))
  const visible = SERIES.filter((entry) => series.includes(entry.id))

  return (
    <div className="dash-root">
      <header className="dash-head">
        <h1>Fleet operations</h1>
        <p className="dash-muted" data-testid="summary">
          {ready ? `${running.length} services · ${pools.length} pools · ${games.length} titles` : 'Loading…'}
        </p>
      </header>

      {/*
        `remember` only. Containment on an overview strip would let the user in
        from below and never let them back out — the lesson already paid for in
        app-game-launcher's filter rail.
      */}
      <section className="dash-tiles" data-spatial-container="remember" data-testid="tiles">
        {ready
          ? stats.map((stat) => <StatTile key={stat.id} stat={stat} />)
          : Array.from({ length: 4 }, (_, i) => <StatTileSkeleton key={i} />)}
      </section>

      <div className="dash-mid">
        <section className="dash-panel dash-charts" data-spatial-container="remember" data-testid="chart-panel">
          <div className="dash-panel-head">
            <h2>Utilization</h2>
            <span className="dash-muted" data-testid="chart-readout">
              {range} · {visible.length > 0 ? visible.map((entry) => entry.label).join(', ') : 'no series'}
            </span>
          </div>
          <ChartControls
            range={range}
            series={series}
            onRange={setRange}
            onToggleSeries={(id) =>
              setSeries((current) =>
                current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
              )
            }
          />
          <MetricsChart points={windowed} series={series} />
          <StorageChart pools={pools} />
        </section>

        <section
          className="dash-panel dash-services"
          data-spatial-container="remember"
          data-testid="services-panel"
        >
          <div className="dash-panel-head">
            <h2>Services</h2>
            <span className="dash-muted">Enter restarts</span>
          </div>
          {running.map((service) => (
            <ServiceRow
              key={service.id}
              service={service}
              busy={action.isPending && action.variables?.id === service.id}
              onRestart={(target) => action.mutate({ id: target.id, action: 'restart' })}
            />
          ))}
        </section>
      </div>

      <CatalogGrid rows={games} />

      <EventStream entries={log.data?.items ?? []} />

      <footer className="dash-foot">
        <kbd>←↑↓→</kbd> move · <kbd>Enter</kbd> activate · the charts are not stops, their controls are
      </footer>
    </div>
  )
}
