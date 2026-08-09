/**
 * Home — recent games as a horizontal rail, plus the system destinations.
 *
 * The rail is `remember` so returning from a game lands on the tile you
 * launched, which is the single most-noticed piece of polish in a console UI.
 */
import { useQuery } from '@tanstack/react-query'
import { osQueries } from '../../services/api'
import { formatPlaytime } from '../../services/device'
import { useShell } from '../../state/shell'
import './home.css'

const DESTINATIONS = [
  { id: 'library', label: 'Library', glyph: '▤', hint: 'All games' },
  { id: 'downloads', label: 'Downloads', glyph: '↓', hint: 'Queue & updates' },
  { id: 'media', label: 'Media', glyph: '♪', hint: 'Music & captures' },
  { id: 'storage', label: 'Storage', glyph: '◱', hint: 'What is using space' },
  { id: 'files', label: 'Files', glyph: '⌸', hint: 'Browse the disk' },
  { id: 'settings', label: 'Settings', glyph: '⚙', hint: 'System' },
] as const

export default function HomeView() {
  const push = useShell((s) => s.push)
  const recent = useQuery(osQueries.games({ sort: 'recent', installed: true }))
  const games = (recent.data?.items ?? []).slice(0, 14)

  return (
    <div className="hv-root" data-testid="home">
      <section className="hv-section">
        <h1 className="hv-heading">Recent</h1>
        <div className="hv-rail" data-spatial-container="remember" data-testid="home-rail">
          {recent.isPending
            ? Array.from({ length: 6 }, (_, i) => <div key={i} className="hv-tile hv-skeleton" />)
            : games.map((game, i) => (
                <button
                  key={game.id}
                  type="button"
                  className="hv-tile os-lift"
                  data-testid="home-tile"
                  data-game-id={game.id}
                  style={{ '--hue': game.hue } as React.CSSProperties}
                  {...(i === 0 ? { 'data-spatial-autofocus': '' } : {})}
                  onClick={() => push({ id: 'game', gameId: game.id })}
                >
                  <span className="hv-tile-art" aria-hidden="true" />
                  <span className="hv-tile-title">{game.title}</span>
                  <span className="hv-tile-meta">{formatPlaytime(game.playedMinutes)}</span>
                </button>
              ))}
        </div>
      </section>

      <section className="hv-section">
        <h2 className="hv-heading">System</h2>
        <div className="hv-dests" data-spatial-container="remember" data-testid="home-dests">
          {DESTINATIONS.map((dest) => (
            <button
              key={dest.id}
              type="button"
              className="hv-dest os-lift"
              data-testid="home-dest"
              data-dest={dest.id}
              onClick={() =>
                push(
                  dest.id === 'settings'
                    ? { id: 'settings' }
                    : dest.id === 'files'
                      ? { id: 'files' }
                      : ({ id: dest.id } as never),
                )
              }
            >
              <span className="hv-dest-glyph" aria-hidden="true">
                {dest.glyph}
              </span>
              <span>
                <strong>{dest.label}</strong>
                <small>{dest.hint}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <p className="hv-hint os-dim">
        <kbd>←↑↓→</kbd> move · <kbd>Enter</kbd> select · <kbd>Esc</kbd> back · <kbd>Q</kbd> quick
        access
      </p>
    </div>
  )
}
