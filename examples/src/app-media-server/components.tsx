/**
 * Presentational pieces of the admin screen. Split out of App.tsx so the test
 * can mount the whole page and reason about it the way an operator would.
 *
 * The streams table lives in streams-table.tsx — it owns enough TanStack Table
 * wiring to deserve its own file.
 */
import { useFocusable } from 'spatial-nav-css/react'
import type { MediaLibrary, MediaUser, StoragePool } from '../shared/api/db'

const ROLES: MediaUser['role'][] = ['admin', 'user', 'guest']

const KIND_LABEL: Record<MediaLibrary['kind'], string> = {
  movies: '🎬',
  shows: '📺',
  music: '🎵',
  photos: '🖼',
}

export function LibraryCard({
  library,
  onScan,
}: {
  library: MediaLibrary
  onScan: (library: MediaLibrary) => void
}) {
  // The React adapter reports focus as state, so the card can react to its
  // button being the current stop without a CSS-only :focus-within rule.
  const { ref, focused } = useFocusable<HTMLButtonElement>()
  return (
    // The card is a plain <article>: it has exactly one action, and turning
    // both the card and its button into stops would make the user press right
    // twice to cross one card.
    <article
      className={`ms-lib${focused ? ' is-focused' : ''}`}
      data-testid="library"
      data-library-id={library.id}
    >
      <h3 className="ms-lib-name">
        <span aria-hidden="true">{KIND_LABEL[library.kind]}</span> {library.name}
      </h3>
      <p className="ms-muted">
        {library.itemCount.toLocaleString('en-US')} items ·{' '}
        {library.sizeGB.toLocaleString('en-US')} GB
      </p>
      <button
        ref={ref}
        type="button"
        className="ms-action"
        data-testid="scan"
        data-library-id={library.id}
        // Deliberately aria-disabled, never `disabled`: a disabled element
        // drops out of the focusable set, so disabling the control the user is
        // standing on strands the highlight (auto-restore only fires on
        // removal). aria-disabled keeps it a stop; the handler is the guard.
        aria-disabled={library.scanning}
        onClick={() => {
          if (!library.scanning) onScan(library)
        }}
      >
        {library.scanning ? 'Scanning…' : 'Scan library'}
      </button>
    </article>
  )
}

export function UserRow({
  user,
  onRoleChange,
  onToggleActive,
}: {
  user: MediaUser
  onRoleChange: (user: MediaUser, role: MediaUser['role']) => void
  onToggleActive: (user: MediaUser) => void
}) {
  const toggleId = `user-toggle-${user.id}`
  return (
    <div className="ms-user" data-testid="user-row" data-user-id={user.id}>
      <span className="ms-user-name">
        {user.name}
        <small className="ms-muted">{user.email}</small>
      </span>

      <select
        className="ms-select"
        data-testid="user-role"
        data-user-id={user.id}
        aria-label={`Role for ${user.name}`}
        value={user.role}
        // The engine's own escape route, honored by adapters that dispatch
        // directional intents while a <select> holds focus (gamepad, custom).
        data-nav-right={`#${toggleId}`}
        onChange={(event) => onRoleChange(user, event.target.value as MediaUser['role'])}
        onKeyDown={(event) => {
          // …but the bundled keyboard adapter classifies SELECT as editable
          // (core/dom.ts isEditable) and drops every mapped key while it has
          // focus, so no intent is ever dispatched and data-nav-right above
          // never runs on a keyboard/IR remote. Up/down stay native — they are
          // what changes the value — and right is the app-level way out.
          // Spatial focus is real DOM focus, so the engine adopts the move.
          if (event.key !== 'ArrowRight') return
          const route = event.currentTarget.dataset.navRight
          const target = route ? document.querySelector<HTMLElement>(route) : null
          if (!target) return
          event.preventDefault()
          target.focus()
        }}
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>

      <button
        type="button"
        id={toggleId}
        className={`ms-toggle${user.active ? ' is-on' : ''}`}
        data-testid="user-toggle"
        data-user-id={user.id}
        aria-pressed={user.active}
        onClick={() => onToggleActive(user)}
      >
        {user.active ? 'Active' : 'Suspended'}
      </button>
    </div>
  )
}

export function PoolCard({ pool }: { pool: StoragePool }) {
  const used = Math.round((pool.usedGB / pool.totalGB) * 100)
  return (
    // Read-only, but still a stop: on a 10-foot UI the only way to bring a
    // panel into view (and to read it with the highlight) is to be able to
    // move onto it. data-focusable is the explicit opt-in; the engine adds
    // tabindex="-1" on first focus so it never joins the Tab order.
    <article
      className="ms-pool"
      data-focusable
      data-testid="pool"
      data-pool-id={pool.id}
      role="group"
      aria-label={`Pool ${pool.name}, ${used}% used, ${pool.health}`}
    >
      <h3 className="ms-pool-name">
        {pool.name}
        <span className={`ms-health is-${pool.health}`}>{pool.health}</span>
      </h3>
      <div className="ms-bar" aria-hidden="true">
        <span style={{ width: `${used}%` }} data-testid="pool-bar" />
      </div>
      <p className="ms-muted">
        {pool.usedGB.toLocaleString('en-US')} / {pool.totalGB.toLocaleString('en-US')} GB ·{' '}
        {pool.filesystem} · {pool.disks} disks
      </p>
    </article>
  )
}

export function Skeleton({
  testid,
  count,
  className,
}: {
  testid: string
  count: number
  className: string
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`ms-skeleton ${className}`} data-testid={testid} aria-hidden="true" />
      ))}
    </>
  )
}
