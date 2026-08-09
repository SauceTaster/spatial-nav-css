/**
 * Overview strip: KPI tiles and the service list.
 *
 * The tiles carry no action, so they are `data-focusable` <article>s rather
 * than <button>s — a button that does nothing when activated is a lie to
 * assistive technology, but the highlight still has to be able to rest on a
 * number and read it. Service rows are real controls, so they are buttons.
 */
import clsx from 'clsx'
import type { ServiceStatus } from '../shared/api/db'

export interface Stat {
  id: string
  label: string
  value: string
  detail: string
  tone?: 'ok' | 'warn'
}

export function StatTile({ stat }: { stat: Stat }) {
  return (
    <article
      className={clsx('dash-tile', stat.tone && `is-${stat.tone}`)}
      data-focusable
      data-testid="stat-tile"
      data-stat={stat.id}
      aria-label={`${stat.label}: ${stat.value}. ${stat.detail}`}
    >
      <span className="dash-tile-label">{stat.label}</span>
      <strong className="dash-tile-value">{stat.value}</strong>
      <span className="dash-tile-detail">{stat.detail}</span>
    </article>
  )
}

export function StatTileSkeleton() {
  return <div className="dash-tile dash-tile-skeleton" data-testid="tile-skeleton" aria-hidden="true" />
}

export function ServiceRow({
  service,
  busy,
  onRestart,
}: {
  service: ServiceStatus
  busy: boolean
  onRestart: (service: ServiceStatus) => void
}) {
  const failing = service.state !== 'running'
  return (
    <button
      type="button"
      className={clsx('dash-service', failing && 'is-failing')}
      data-testid="service"
      data-service-id={service.id}
      data-state={service.state}
      // aria-disabled, never `disabled`: a disabled control is not focusable,
      // so the highlight would be stranded the instant a restart starts.
      aria-disabled={busy || undefined}
      onClick={() => {
        if (!busy) onRestart(service)
      }}
    >
      <span className="dash-service-name">{service.name}</span>
      <span className="dash-service-state">{busy ? 'restarting…' : service.state}</span>
      <span className="dash-service-cpu">{service.cpuPercent}%</span>
    </button>
  )
}
