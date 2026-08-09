/**
 * Game launcher — a Steam-style library screen.
 *
 * What it stresses in the engine:
 *  - a filter rail and a card grid as sibling zones (left/right crosses them)
 *  - async data: the grid is skeletons first, then real cards. Focus has to
 *    end up somewhere sensible once the real content lands.
 *  - live filtering: the result set changes under the focused element, which
 *    is exactly what `autoRestoreFocus` exists for.
 *  - an optimistic mutation re-rendering the focused card in place.
 */
import { useState } from 'react'
import { useSpatialEvent } from 'spatial-nav-css/react'
import { useContentFocus } from '../shared/useContentFocus'
import { useGame, useGames, useInstall, useToggleFavorite } from './api'
import { CardSkeleton, DetailPanel, FilterButton, GameCard } from './components'
import type { Game } from '../shared/api/db'
import type { GameQuery } from '../shared/api/client'

const FILTERS: Array<{ id: NonNullable<GameQuery['filter']>; label: string }> = [
  { id: 'all', label: 'All games' },
  { id: 'installed', label: 'Installed' },
  { id: 'favorites', label: 'Favorites' },
]

const SORTS: Array<{ id: NonNullable<GameQuery['sort']>; label: string }> = [
  { id: 'title', label: 'A–Z' },
  { id: 'playtime', label: 'Playtime' },
  { id: 'size', label: 'Size' },
]

export function App() {
  const [filter, setFilter] = useState<NonNullable<GameQuery['filter']>>('all')
  const [sort, setSort] = useState<NonNullable<GameQuery['sort']>>('title')
  const [selected, setSelected] = useState<string | null>(null)
  const [edge, setEdge] = useState<string | null>(null)

  const games = useGames({ filter, sort })
  const detail = useGame(selected)
  const favorite = useToggleFavorite()
  const install = useInstall()

  // Pressing right at the last card is where a real launcher would page in
  // more results; here it just reports, so the behavior is observable.
  useSpatialEvent('spatial:nofocustarget', (event) => {
    setEdge(event.detail.direction)
  })

  // Provider `autofocus` fires at start(), while this screen is still
  // skeletons — it would strand focus on the page header. Hand focus to the
  // first card when the data actually arrives.
  useContentFocus(!games.isPending, '[data-testid="game-card"]')

  const items = games.data?.items ?? []

  return (
    <div className="gl-root">
      <header className="gl-head">
        <h1>Library</h1>
        <p className="gl-muted" data-testid="count">
          {games.isPending ? 'Loading…' : `${games.data?.total ?? 0} games`}
        </p>
      </header>

      <div className="gl-body">
        {/*
          `remember` only — deliberately NOT `contain`. Containment on a
          filter rail traps focus inside it: you could enter from the grid
          but never navigate back out. Regression-pinned below.
        */}
        <nav className="gl-rail" data-spatial-container="remember" data-testid="rail">
          <h2 className="gl-rail-heading">Show</h2>
          {FILTERS.map((entry) => (
            <FilterButton
              key={entry.id}
              label={entry.label}
              active={filter === entry.id}
              onSelect={() => setFilter(entry.id)}
            />
          ))}
          <h2 className="gl-rail-heading">Sort</h2>
          {SORTS.map((entry) => (
            <FilterButton
              key={entry.id}
              label={entry.label}
              active={sort === entry.id}
              onSelect={() => setSort(entry.id)}
            />
          ))}
        </nav>

        <main className="gl-grid" data-spatial-container="remember" data-testid="grid">
          {games.isPending
            ? Array.from({ length: 8 }, (_, i) => <CardSkeleton key={i} />)
            : items.map((game: Game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  onOpen={setSelected}
                  onToggleFavorite={(target) =>
                    favorite.mutate({ id: target.id, favorite: !target.favorite })
                  }
                />
              ))}
          {!games.isPending && items.length === 0 ? (
            <p className="gl-muted" data-testid="empty">
              Nothing matches this filter.
            </p>
          ) : null}
        </main>

        <DetailPanel
          game={detail.data}
          loading={detail.isPending && selected !== null}
          onInstall={(game) => install.mutate({ id: game.id, install: !game.installed })}
          onClose={() => setSelected(null)}
        />
      </div>

      <footer className="gl-foot">
        <span data-testid="edge">{edge ? `Edge: ${edge}` : 'Arrow keys move · Enter opens · F favorites'}</span>
      </footer>
    </div>
  )
}
