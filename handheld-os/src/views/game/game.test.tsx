import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import type { SpatialNavigation } from 'spatial-nav-css'
import { useSpatialNavigation } from 'spatial-nav-css/react'
import { createOsQueryClient, OsProviders } from '../../os/OsProviders'
import { device } from '../../services/device'
import { useShell } from '../../state/shell'
import { applyLayout, setRect, testNavOptions } from '../../test/layout'
import GameView from './GameView'

const probe: { nav: SpatialNavigation | null } = { nav: null }

function Probe() {
  probe.nav = useSpatialNavigation()
  return null
}

/** jsdom has no layout: describe the action row the CSS would produce. */
function layout(): void {
  applyLayout([
    {
      selector: '[data-testid="game-actions"] button',
      flow: 'row',
      x: 40,
      y: 340,
      w: 168,
      h: 46,
      gap: 10,
    },
  ])
  setRect(screen.getByTestId('game-actions'), { x: 40, y: 340, w: 760, h: 46 })
}

async function mount(gameId: string) {
  const view = render(
    <OsProviders client={createOsQueryClient()} nav={testNavOptions}>
      <Probe />
      <GameView gameId={gameId} />
    </OsProviders>,
  )
  await screen.findByTestId('game-title')
  layout()
  return view
}

const nav = (): SpatialNavigation => {
  if (!probe.nav) throw new Error('nav probe not mounted')
  return probe.nav
}

const focusedTestId = () => nav().getFocused()?.dataset.testid ?? null

/**
 * The shell renders the confirm dialog; this test mounts the view alone, so it
 * settles the promise the way ConfirmDialog would. That is the contract the
 * view actually depends on: `confirm()` pushes an overlay and waits.
 */
async function answerConfirm(answer: boolean) {
  await waitFor(() => expect(useShell.getState().overlays.at(-1)?.kind).toBe('confirm'))
  const top = useShell.getState().overlays.at(-1)
  if (top?.kind !== 'confirm') throw new Error('no confirm overlay')
  await act(async () => {
    top.confirm.resolve(answer)
    useShell.setState((s) => ({ overlays: s.overlays.slice(0, -1) }))
  })
  return top.confirm
}

const installedGame = () => {
  const game = device.games.find((g) => g.install === 'installed')
  if (!game) throw new Error('seed has no installed game')
  return game
}

const downloadingGame = () => {
  const job = device.downloads.find((j) => j.state === 'downloading')
  const game = device.games.find((g) => g.id === job?.gameId)
  if (!job || !game) throw new Error('seed has no active download')
  return { job, game }
}

beforeEach(() => {
  probe.nav = null
  useShell.setState({ views: [{ id: 'home' }], overlays: [], notice: null })
})

describe('GameView', () => {
  it('loads the game from the device services', async () => {
    const game = installedGame()
    await mount(game.id)

    expect(screen.getByTestId('game-title')).toHaveTextContent(game.title)
    expect(screen.getByTestId('game-developer')).toHaveTextContent(game.developer)
    expect(screen.getByTestId('game-compat')).toBeInTheDocument()
    expect(screen.getByTestId('game-achievements')).toHaveTextContent(
      `${game.achievements.earned} / ${game.achievements.total}`,
    )
    expect(screen.getByTestId('game-size')).toBeInTheDocument()
    expect(screen.getByTestId('game-playtime')).toBeInTheDocument()
  })

  it('walks the action row with the D-pad', async () => {
    await mount(installedGame().id)

    act(() => void nav().focus('[data-testid="game-primary"]'))
    expect(focusedTestId()).toBe('game-primary')

    act(() => void nav().navigate('right'))
    expect(focusedTestId()).toBe('game-favorite')
    act(() => void nav().navigate('right'))
    expect(focusedTestId()).toBe('game-properties')
    act(() => void nav().navigate('right'))
    expect(focusedTestId()).toBe('game-uninstall')
    act(() => void nav().navigate('left'))
    expect(focusedTestId()).toBe('game-properties')
  })

  it('favoriting a game goes through the service and flips the control', async () => {
    const game = installedGame()
    const before = game.favorite
    await mount(game.id)

    act(() => void nav().focus('[data-testid="game-favorite"]'))
    await act(async () => {
      nav().activate()
    })

    await waitFor(() =>
      expect(screen.getByTestId('game-favorite')).toHaveAttribute(
        'aria-pressed',
        String(!before),
      ),
    )
    expect(device.games.find((g) => g.id === game.id)?.favorite).toBe(!before)
  })

  it('uninstall asks first, and answering no changes nothing', async () => {
    const game = installedGame()
    await mount(game.id)

    act(() => void nav().focus('[data-testid="game-uninstall"]'))
    act(() => void nav().activate())

    const spec = await answerConfirm(false)
    expect(spec.destructive).toBe(true)
    expect(spec.confirmLabel).toBe('Uninstall')

    expect(screen.getByTestId('game-primary')).toHaveTextContent('Play')
    expect(device.games.find((g) => g.id === game.id)?.install).toBe('installed')
  })

  it('uninstall confirmed removes the game and the primary action becomes Install', async () => {
    const game = installedGame()
    await mount(game.id)

    act(() => void nav().focus('[data-testid="game-uninstall"]'))
    act(() => void nav().activate())
    await answerConfirm(true)

    await waitFor(() => expect(screen.getByTestId('game-primary')).toHaveTextContent('Install'))
    expect(screen.queryByTestId('game-uninstall')).toBeNull()
    expect(device.games.find((g) => g.id === game.id)?.install).toBe('not-installed')
    expect(useShell.getState().notice).toContain('Uninstalled')
  })

  it('installing an uninstalled game queues a download job', async () => {
    const game = device.games.find(
      (g) => g.install === 'not-installed' && !device.downloads.some((j) => j.gameId === g.id),
    )
    if (!game) throw new Error('seed has no clean uninstalled game')
    await mount(game.id)

    expect(screen.getByTestId('game-primary')).toHaveTextContent('Install')
    act(() => void nav().focus('[data-testid="game-primary"]'))
    act(() => void nav().activate())

    await waitFor(() => expect(screen.getByTestId('game-progress')).toBeInTheDocument())
    expect(device.downloads.some((j) => j.gameId === game.id)).toBe(true)
  })

  it('shows progress for a game that is already downloading', async () => {
    const { game, job } = downloadingGame()
    await mount(game.id)

    const progress = screen.getByTestId('game-progress')
    expect(progress).toBeInTheDocument()
    const percent = Math.round((job.doneBytes / job.totalBytes) * 100)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(percent))
    // A download in flight must not offer Install again, and must not stop
    // being a spatial stop while it runs.
    expect(screen.getByTestId('game-primary')).toHaveTextContent('Installing…')
    expect(screen.getByTestId('game-primary')).toHaveAttribute('aria-disabled', 'true')
    act(() => void nav().focus('[data-testid="game-primary"]'))
    expect(focusedTestId()).toBe('game-primary')
  })

  it('Properties opens the sheet the shell owns, carrying the game id', async () => {
    const game = installedGame()
    await mount(game.id)

    act(() => void nav().focus('[data-testid="game-properties"]'))
    act(() => void nav().activate())

    const overlay = useShell.getState().overlays.at(-1)
    expect(overlay?.kind).toBe('sheet')
    if (overlay?.kind !== 'sheet') throw new Error('expected a sheet')
    expect(overlay.sheet.body).toBe('game-properties')
    expect(overlay.sheet.payload).toEqual({ gameId: game.id })
  })
})
