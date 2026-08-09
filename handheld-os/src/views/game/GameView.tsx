/**
 * Game detail — hero art, the facts, and the actions.
 *
 * Two focusable zones: the action row and the facts strip. Neither is
 * contained; back is the shell's job, and a detail screen you cannot leave is
 * the classic console dead end.
 *
 * Every button is a real `<button>` with a real label. On a handheld the
 * focus ring *is* the cursor, so the thing under it has to say what pressing A
 * will do — which is also why the primary action's label changes with install
 * state rather than its icon.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CSSProperties } from 'react'
import { osMutations, osQueries } from '../../services/api'
import { formatBytes, formatPlaytime, type DownloadJob, type Game } from '../../services/device'
import { useShell } from '../../state/shell'
import './game.css'

const COMPAT_LABEL: Record<Game['compat'], string> = {
  verified: 'Verified',
  playable: 'Playable',
  unsupported: 'Unsupported',
  unknown: 'Unknown',
}

/** Jobs that have finished are history, not progress. */
const activeJobFor = (jobs: DownloadJob[], gameId: string): DownloadJob | undefined =>
  jobs.find((job) => job.gameId === gameId && job.state !== 'done' && job.state !== 'failed')

export default function GameView({ gameId }: { gameId: string }) {
  const client = useQueryClient()
  const confirm = useShell((s) => s.confirm)
  const notify = useShell((s) => s.notify)
  const openSheet = useShell((s) => s.openSheet)

  const gameQuery = useQuery(osQueries.game(gameId))
  const downloadsQuery = useQuery(osQueries.downloads())
  const game = gameQuery.data
  const job = activeJobFor(downloadsQuery.data?.items ?? [], gameId)

  /**
   * One refresh for every mutation. The server owns install state and the
   * download queue together — installing a game creates a job — so refreshing
   * only the game would leave the progress bar describing a job that no
   * longer exists.
   */
  const settle = (updated: Game) => {
    client.setQueryData(['game', gameId], updated)
    void client.invalidateQueries({ queryKey: ['games'] })
    void client.invalidateQueries({ queryKey: ['downloads'] })
  }

  const favorite = useMutation({
    mutationFn: () => osMutations.toggleFavorite(gameId),
    onSuccess: (updated) => {
      settle(updated)
      notify(updated.favorite ? `Added ${updated.title} to favorites` : `Removed ${updated.title}`)
    },
  })

  const install = useMutation({
    mutationFn: () => osMutations.install(gameId),
    onSuccess: (updated) => {
      settle(updated)
      notify(`Queued ${updated.title}`)
    },
  })

  const uninstall = useMutation({
    mutationFn: () => osMutations.uninstall(gameId),
    onSuccess: (updated) => {
      settle(updated)
      notify(`Uninstalled ${updated.title}`)
    },
  })

  if (gameQuery.isPending) {
    return (
      <div className="gv-root" data-testid="game">
        <p className="os-dim">Loading…</p>
      </div>
    )
  }
  if (!game) {
    return (
      <div className="gv-root" data-testid="game">
        <p className="os-dim" data-testid="game-error">
          That game is no longer on this device.
        </p>
      </div>
    )
  }

  const installed = game.install === 'installed'
  const downloading = game.install === 'downloading' || job !== undefined

  const askUninstall = async () => {
    const confirmed = await confirm({
      title: 'Uninstall game',
      message: `Remove ${game.title} from this device? ${formatBytes(game.sizeBytes)} will be freed.${
        game.hasCloudSave ? ' Cloud saves are kept.' : ''
      }`,
      confirmLabel: 'Uninstall',
      destructive: true,
    })
    if (confirmed) uninstall.mutate()
  }

  const percent = job && job.totalBytes > 0 ? Math.round((job.doneBytes / job.totalBytes) * 100) : 0

  return (
    <div className="gv-root" data-testid="game" data-game-id={game.id}>
      <header className="gv-hero" style={{ '--hue': game.hue } as CSSProperties}>
        <div className="gv-hero-art" aria-hidden="true" />
        <div className="gv-hero-text">
          <h1 className="gv-title" data-testid="game-title">
            {game.title}
          </h1>
          <p className="gv-developer" data-testid="game-developer">
            {game.developer} · {game.genres.join(', ')}
          </p>
          <p className={`gv-compat is-${game.compat}`} data-testid="game-compat">
            {COMPAT_LABEL[game.compat]}
          </p>
        </div>
      </header>

      {job ? (
        <section className="gv-progress" data-testid="game-progress" aria-label="Download progress">
          <div
            className="gv-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={`${job.kind} ${game.title}`}
          >
            <div className="gv-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="os-dim" data-testid="game-progress-text">
            {job.state === 'downloading' ? 'Downloading' : job.state} · {percent}% ·{' '}
            {formatBytes(job.doneBytes)} of {formatBytes(job.totalBytes)}
          </p>
        </section>
      ) : null}

      {/*
        The action row is `remember` so returning from the properties sheet
        lands on Properties, not back on Play — pressing A twice in a row
        should never launch a game you were only inspecting.
      */}
      <div className="gv-actions" data-spatial-container="remember" data-testid="game-actions">
        {installed ? (
          <button
            type="button"
            className="os-btn os-btn-primary gv-play"
            data-testid="game-primary"
            data-spatial-autofocus=""
            onClick={() => notify(`Launching ${game.title}…`)}
          >
            Play
          </button>
        ) : (
          <button
            type="button"
            className="os-btn os-btn-primary gv-play"
            data-testid="game-primary"
            data-spatial-autofocus=""
            // aria-disabled rather than `disabled`: a disabled element stops
            // being a spatial stop, so the highlight would vanish out from
            // under the user the moment a download started.
            aria-disabled={downloading || install.isPending || undefined}
            onClick={() => {
              if (downloading || install.isPending) return
              install.mutate()
            }}
          >
            {downloading ? 'Installing…' : 'Install'}
          </button>
        )}

        <button
          type="button"
          className="os-btn"
          data-testid="game-favorite"
          aria-pressed={game.favorite}
          onClick={() => favorite.mutate()}
        >
          {game.favorite ? '★ Favorited' : '☆ Favorite'}
        </button>

        <button
          type="button"
          className="os-btn"
          data-testid="game-properties"
          onClick={() =>
            openSheet({
              id: `game-properties-${game.id}`,
              title: `${game.title} — Properties`,
              body: 'game-properties',
              payload: { gameId: game.id },
            })
          }
        >
          Properties
        </button>

        {installed ? (
          <button
            type="button"
            className="os-btn os-btn-danger"
            data-testid="game-uninstall"
            onClick={() => void askUninstall()}
          >
            Uninstall
          </button>
        ) : null}
      </div>

      <dl className="gv-facts" data-testid="game-facts">
        <Fact label="Size" value={formatBytes(game.sizeBytes)} testId="game-size" />
        <Fact label="Playtime" value={formatPlaytime(game.playedMinutes)} testId="game-playtime" />
        <Fact
          label="Achievements"
          value={`${game.achievements.earned} / ${game.achievements.total}`}
          testId="game-achievements"
        />
        <Fact label="Cloud save" value={game.hasCloudSave ? 'Synced' : 'Off'} testId="game-cloud" />
      </dl>
    </div>
  )
}

function Fact({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="gv-fact">
      <dt>{label}</dt>
      <dd data-testid={testId}>{value}</dd>
    </div>
  )
}
