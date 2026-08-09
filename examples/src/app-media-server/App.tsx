/**
 * Media server admin — a Jellyfin/Plex-style operations screen.
 *
 * What it stresses in the engine:
 *  - four sibling zones on one page: a library row, a data grid, a user list
 *    and a storage summary. Crossing between them has to feel like moving
 *    between panels, not like landing on whatever control happens to be
 *    diagonally nearest.
 *  - a TanStack Table where every cell is a stop and sorting reorders the DOM
 *    under the highlight.
 *  - row-level mutations (role, active) that re-render the exact control the
 *    user is standing on.
 *  - a destructive action routed through the library's own spatialConfirm(),
 *    which is the one place `contain` belongs.
 */
import { useState } from 'react'
import { spatialConfirm } from 'spatial-nav-css/dialogs'
import {
  useLibraries,
  useMediaUsers,
  useScanLibrary,
  useSessions,
  useStopSession,
  useStoragePools,
  useUpdateUser,
} from './api'
import { LibraryCard, PoolCard, Skeleton, UserRow } from './components'
import { StreamsTable } from './streams-table'
import type { MediaUser, StreamSession } from '../shared/api/db'

export function App() {
  const libraries = useLibraries()
  const sessions = useSessions()
  const users = useMediaUsers()
  const pools = useStoragePools()

  const scan = useScanLibrary()
  const stop = useStopSession()
  const updateUser = useUpdateUser()

  const [notice, setNotice] = useState('Arrow keys move · Enter activates · Esc/B backs out')

  /**
   * Destructive actions never fire straight off a d-pad press: a stray Enter
   * on a couch remote would kill someone's film. spatialConfirm() renders a
   * native <dialog> (showModal where available), keeps the engine polling —
   * unlike window.confirm(), which freezes all page JS including gamepad
   * polling — and restores focus to this button when it settles.
   */
  const confirmStop = async (session: StreamSession): Promise<void> => {
    const stopIt = await spatialConfirm(
      `Stop ${session.user}'s stream of “${session.title}” on ${session.device}?`,
      {
        title: 'Stop stream',
        okLabel: 'Stop stream',
        cancelLabel: 'Keep playing',
        className: 'ms-dialog',
      },
    )
    if (!stopIt) {
      setNotice(`Left ${session.user} playing.`)
      return
    }
    stop.mutate(session.id)
    setNotice(`Stopped ${session.user}'s stream.`)
  }

  return (
    <div className="ms-root">
      <header className="ms-head">
        <h1>mediavault · admin</h1>
        <p className="ms-muted" data-testid="summary">
          {sessions.isPending
            ? 'Loading…'
            : `${sessions.data?.items.length ?? 0} active streams · ` +
              `${libraries.data?.items.length ?? 0} libraries`}
        </p>
      </header>

      {/*
        Every section below is a zone (`data-spatial-container`), so a
        directional press first picks a *section* by its union rect and then
        descends into it. That is what makes "down from a library card" land in
        the streams table instead of on some diagonally-closer control.

        `remember` everywhere, because an operator leaves and re-enters these
        constantly (stop a stream, come back to the same row).

        No `contain` on any of them — containment on a page section is a
        one-way door: focus can get in and never out. It belongs only to
        modal UI, which is exactly where spatialConfirm() applies it.
      */}
      <section
        className="ms-section"
        // `wrap` is safe here only because the CSS pins this to a single row
        // (see .ms-lib-row): wrap engages on whichever axis has items behind
        // the focused element, so the moment the row reflows into a grid,
        // "down" from the bottom row wraps to the top instead of leaving for
        // the streams table — containment by accident. As one row, the only
        // ways out are up/down and left at the first card cycles to the last.
        data-spatial-container="remember wrap"
        data-testid="libraries"
        aria-label="Libraries"
      >
        <h2 className="ms-section-title">Libraries</h2>
        <div className="ms-lib-row">
          {libraries.isPending ? (
            <Skeleton testid="lib-skeleton" count={4} className="ms-skeleton-lib" />
          ) : (
            libraries.data?.items.map((library) => (
              <LibraryCard key={library.id} library={library} onScan={(lib) => scan.mutate(lib.id)} />
            ))
          )}
        </div>
      </section>

      <section
        className="ms-section"
        data-spatial-container="remember"
        data-testid="streams"
        aria-label="Active streams"
      >
        <h2 className="ms-section-title">Active streams</h2>
        {sessions.isPending ? (
          <Skeleton testid="stream-skeleton" count={5} className="ms-skeleton-row" />
        ) : (
          <StreamsTable
            sessions={sessions.data?.items ?? []}
            onStop={(session) => void confirmStop(session)}
          />
        )}
        {!sessions.isPending && sessions.data?.items.length === 0 ? (
          <p className="ms-muted" data-testid="streams-empty">
            Nothing is playing.
          </p>
        ) : null}
      </section>

      <div className="ms-split">
        <section
          className="ms-section"
          data-spatial-container="remember"
          data-testid="users"
          aria-label="Users"
        >
          <h2 className="ms-section-title">Users</h2>
          {users.isPending ? (
            <Skeleton testid="user-skeleton" count={6} className="ms-skeleton-row" />
          ) : (
            users.data?.items.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                onRoleChange={(target: MediaUser, role) =>
                  updateUser.mutate({ id: target.id, patch: { role } })
                }
                onToggleActive={(target: MediaUser) =>
                  updateUser.mutate({ id: target.id, patch: { active: !target.active } })
                }
              />
            ))
          )}
        </section>

        <section
          className="ms-section"
          data-spatial-container="remember"
          data-testid="storage"
          aria-label="Storage pools"
        >
          <h2 className="ms-section-title">Storage</h2>
          {pools.isPending ? (
            <Skeleton testid="pool-skeleton" count={3} className="ms-skeleton-row" />
          ) : (
            pools.data?.items.map((pool) => <PoolCard key={pool.id} pool={pool} />)
          )}
        </section>
      </div>

      <footer className="ms-foot" data-testid="notice">
        {notice}
      </footer>
    </div>
  )
}
