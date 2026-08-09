/**
 * Media — a now-playing transport over a library you can browse while it
 * plays.
 *
 * The player is shell state, not view state: walking away from this screen
 * must not stop the music, so everything here reads and writes
 * `useShell().player` and the view is only a controller for it. The playback
 * clock lives here for the same reason it exists at all — one timer, in the
 * view, rather than one per component reading `positionSec`.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { osQueries } from '../../services/api'
import { formatDuration, type Track } from '../../services/device'
import { useShell, type PlayerState } from '../../state/shell'
import { SeekBar } from './SeekBar'
import './media.css'

/**
 * The playback clock, injectable so tests drive position with `seek()` instead
 * of racing wall time. `ms: 0` disables the timer entirely.
 */
export const playbackTick = { ms: 1000 }

const REPEAT_ORDER: Array<PlayerState['repeat']> = ['off', 'all', 'one']
const REPEAT_LABEL: Record<PlayerState['repeat'], string> = {
  off: 'Repeat',
  all: 'Repeat all',
  one: 'Repeat one',
}

interface AlbumGroup {
  album: string
  artist: string
  tracks: Track[]
}

function groupByAlbum(tracks: Track[]): AlbumGroup[] {
  const groups = new Map<string, AlbumGroup>()
  for (const track of tracks) {
    const group = groups.get(track.album)
    if (group) group.tracks.push(track)
    else groups.set(track.album, { album: track.album, artist: track.artist, tracks: [track] })
  }
  return [...groups.values()]
}

export default function MediaView() {
  const tracksQuery = useQuery(osQueries.tracks())
  const tracks = useMemo(() => tracksQuery.data?.items ?? [], [tracksQuery.data])
  const albums = useMemo(() => groupByAlbum(tracks), [tracks])

  const player = useShell((s) => s.player)
  const playTrack = useShell((s) => s.playTrack)
  const togglePlay = useShell((s) => s.togglePlay)
  const skip = useShell((s) => s.skip)
  const seek = useShell((s) => s.seek)
  const setPlayer = useShell((s) => s.setPlayer)
  const openSheet = useShell((s) => s.openSheet)

  const current = tracks.find((track) => track.id === player.trackId) ?? null
  const durationSec = current?.durationSec ?? 0
  const hasQueue = player.queue.length > 0

  // The timer reads the duration through a ref so a track change does not tear
  // down and rebuild the interval mid-second.
  const durationRef = useRef(0)
  durationRef.current = durationSec

  useEffect(() => {
    if (!player.playing || playbackTick.ms <= 0) return
    const step = playbackTick.ms / 1000
    const id = setInterval(() => {
      const state = useShell.getState()
      const total = durationRef.current
      const next = state.player.positionSec + step
      if (total > 0 && next >= total) {
        if (state.player.repeat === 'one') state.seek(0)
        else state.skip(1)
        return
      }
      state.seek(next)
    }, playbackTick.ms)
    return () => clearInterval(id)
  }, [player.playing])

  return (
    <div className="mv-root" data-testid="media">
      <section className="mv-now" data-spatial-container="remember" data-testid="media-now">
        <header className="mv-head">
          <span className="mv-art" aria-hidden="true" />
          <span className="mv-meta">
            <strong data-testid="media-title">{current ? current.title : 'Nothing playing'}</strong>
            <small>{current ? `${current.artist} · ${current.album}` : 'Pick a track below'}</small>
          </span>
          <button
            type="button"
            className="mv-queue"
            data-testid="media-queue"
            onClick={() => openSheet({ id: 'track-queue', title: 'Play queue', body: 'track-queue' })}
          >
            Queue <span className="mv-queue-count">{player.queue.length}</span>
          </button>
        </header>

        <div className="mv-transport" data-testid="media-transport">
          <button
            type="button"
            className={clsx('mv-tbtn', player.shuffle && 'is-on')}
            data-testid="media-shuffle"
            aria-pressed={player.shuffle}
            onClick={() => setPlayer({ shuffle: !player.shuffle })}
          >
            Shuffle
          </button>
          {/*
            aria-disabled, never `disabled`: a disabled element stops matching
            the focusable selector, so the ring would vanish under the user the
            moment the queue emptied.
          */}
          <button
            type="button"
            className="mv-tbtn"
            data-testid="media-prev"
            aria-label="Previous track"
            aria-disabled={hasQueue ? undefined : true}
            onClick={() => hasQueue && skip(-1)}
          >
            ⏮
          </button>
          <button
            type="button"
            className="mv-tbtn mv-tbtn-play"
            data-testid="media-play"
            data-spatial-autofocus=""
            aria-label={player.playing ? 'Pause' : 'Play'}
            aria-pressed={player.playing}
            aria-disabled={player.trackId ? undefined : true}
            onClick={() => player.trackId && togglePlay()}
          >
            {player.playing ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            className="mv-tbtn"
            data-testid="media-next"
            aria-label="Next track"
            aria-disabled={hasQueue ? undefined : true}
            onClick={() => hasQueue && skip(1)}
          >
            ⏭
          </button>
          <button
            type="button"
            className={clsx('mv-tbtn', player.repeat !== 'off' && 'is-on')}
            data-testid="media-repeat"
            aria-pressed={player.repeat !== 'off'}
            onClick={() =>
              setPlayer({
                repeat: REPEAT_ORDER[(REPEAT_ORDER.indexOf(player.repeat) + 1) % REPEAT_ORDER.length]!,
              })
            }
          >
            {REPEAT_LABEL[player.repeat]}
          </button>
        </div>

        <SeekBar positionSec={player.positionSec} durationSec={durationSec} onSeek={seek} />
      </section>

      <section className="mv-library" data-spatial-container="remember" data-testid="media-library">
        <h2 className="mv-heading">Library</h2>
        {tracksQuery.isPending ? (
          <p className="os-dim">Reading the music library…</p>
        ) : (
          albums.map((group) => (
            <div className="mv-album" key={group.album}>
              <h3 className="mv-album-title" data-testid="media-album">
                {group.album}
                <small>{group.artist}</small>
              </h3>
              {group.tracks.map((track) => (
                <button
                  key={track.id}
                  type="button"
                  className={clsx('mv-track', track.id === player.trackId && 'is-current')}
                  data-testid="media-track"
                  data-track-id={track.id}
                  aria-current={track.id === player.trackId ? 'true' : undefined}
                  onClick={() =>
                    playTrack(
                      track.id,
                      group.tracks.map((t) => t.id),
                    )
                  }
                >
                  <span className="mv-track-no">{track.trackNo}</span>
                  <span className="mv-track-title">{track.title}</span>
                  <span className="mv-track-time">{formatDuration(track.durationSec)}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </section>
    </div>
  )
}
