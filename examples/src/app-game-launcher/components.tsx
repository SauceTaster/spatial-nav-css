/**
 * Presentational components for the launcher. Split from App.tsx so the test
 * can mount the whole screen and reason about it the way a user would.
 */
import { useFocusable } from 'spatial-nav-css/react'
import type { Game } from '../shared/api/db'

export function GameCard({
  game,
  onOpen,
  onToggleFavorite,
}: {
  game: Game
  onOpen: (id: string) => void
  onToggleFavorite: (game: Game) => void
}) {
  const { ref, focused } = useFocusable<HTMLButtonElement>({
    onActivate: () => onOpen(game.id),
  })
  return (
    <button
      ref={ref}
      type="button"
      className={`gl-card${focused ? ' is-focused' : ''}`}
      data-testid="game-card"
      data-game-id={game.id}
      style={{ '--hue': game.hue } as React.CSSProperties}
      onClick={() => onOpen(game.id)}
      onKeyDown={(event) => {
        // A secondary action on the same control: the spatial engine only
        // synthesizes a click, so extra keys stay the app's business.
        if (event.key === 'f') {
          event.preventDefault()
          onToggleFavorite(game)
        }
      }}
    >
      <span className="gl-card-art" aria-hidden="true" />
      <span className="gl-card-title">{game.title}</span>
      <span className="gl-card-meta">
        {game.installed ? 'Installed' : `${game.sizeGB} GB`}
        {game.favorite ? ' · ★' : ''}
      </span>
    </button>
  )
}

export function CardSkeleton() {
  return <div className="gl-card gl-card-skeleton" data-testid="card-skeleton" aria-hidden="true" />
}

export function FilterButton({
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
      className={`gl-filter${active ? ' is-active' : ''}`}
      aria-pressed={active}
      data-testid="filter"
      onClick={onSelect}
    >
      {label}
    </button>
  )
}

export function DetailPanel({
  game,
  loading,
  onInstall,
  onClose,
}: {
  game: Game | undefined
  loading: boolean
  onInstall: (game: Game) => void
  onClose: () => void
}) {
  if (loading) {
    return (
      <aside className="gl-detail" data-testid="detail-loading">
        <p className="gl-muted">Loading…</p>
      </aside>
    )
  }
  if (!game) return null
  return (
    // `remember` so returning to the panel lands on the control you left,
    // and the panel is a zone so "left" from the grid enters it as a unit.
    <aside className="gl-detail" data-spatial-container="remember" data-testid="detail">
      <h2 className="gl-detail-title">{game.title}</h2>
      <p className="gl-muted">
        {game.developer} · {game.genres.join(', ')}
      </p>
      <dl className="gl-stats">
        <div>
          <dt>Playtime</dt>
          <dd>{game.playtimeHours} h</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{game.sizeGB} GB</dd>
        </div>
      </dl>
      <div className="gl-detail-actions">
        <button
          type="button"
          className="gl-primary"
          data-spatial-autofocus
          data-testid="install-toggle"
          onClick={() => onInstall(game)}
        >
          {game.installed ? 'Uninstall' : 'Install'}
        </button>
        <button type="button" data-testid="detail-close" onClick={onClose}>
          Close
        </button>
      </div>
    </aside>
  )
}
