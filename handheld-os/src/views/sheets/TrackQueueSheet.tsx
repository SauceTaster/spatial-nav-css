/**
 * The play queue.
 *
 * The queue is shell state (an ordered list of ids); the tracks themselves are
 * server data. Joining them here rather than storing whole tracks in the store
 * is what keeps one source of truth per fact — and it means a queued id whose
 * track has gone away degrades to a placeholder row instead of a crash.
 */
import { useQuery } from '@tanstack/react-query'
import { osQueries } from '../../services/api'
import { formatDuration } from '../../services/device'
import { useShell } from '../../state/shell'
import './sheets.css'

export function TrackQueueSheet() {
  const queue = useShell((s) => s.player.queue)
  const currentId = useShell((s) => s.player.trackId)
  const playTrack = useShell((s) => s.playTrack)
  const tracks = useQuery(osQueries.tracks())

  const byId = new Map((tracks.data?.items ?? []).map((track) => [track.id, track]))

  if (queue.length === 0) {
    return (
      <p className="os-dim" data-testid="sheet-empty">
        Nothing queued. Play an album from Media and it will show up here.
      </p>
    )
  }

  return (
    <div className="sh-body" data-testid="sheet-track-queue">
      <p className="sh-lede">
        <strong>{queue.length} tracks</strong>
        <small className="os-dim">Select a track to play it now.</small>
      </p>
      <ol
        className="sh-queue"
        // `remember` so re-opening the queue mid-album lands on the row the
        // user was last looking at. Never `contain` — the sheet wrapper
        // already owns containment for this overlay.
        data-spatial-container="remember"
        data-testid="sheet-queue-list"
      >
        {queue.map((trackId, index) => {
          const track = byId.get(trackId)
          const isCurrent = trackId === currentId
          return (
            <li key={`${trackId}-${index}`}>
              <button
                type="button"
                className={`sh-queue-row${isCurrent ? ' is-current' : ''}`}
                data-testid="sheet-queue-row"
                data-track-id={trackId}
                aria-current={isCurrent ? 'true' : undefined}
                {...(isCurrent ? { 'data-spatial-autofocus': '' } : {})}
                onClick={() => playTrack(trackId)}
              >
                <span className="sh-queue-index" aria-hidden="true">
                  {isCurrent ? '▶' : index + 1}
                </span>
                <span className="sh-queue-title">
                  {track?.title ?? trackId}
                  <small className="os-dim">
                    {track ? `${track.artist} · ${track.album}` : 'Not on this device'}
                  </small>
                </span>
                <span className="sh-queue-time">
                  {track ? formatDuration(track.durationSec) : '—'}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
