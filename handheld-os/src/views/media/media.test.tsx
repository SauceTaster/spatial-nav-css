import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpatialNavigation } from 'spatial-nav-css'
import { useSpatialNavigation } from 'spatial-nav-css/react'
import { OsProviders } from '../../os/OsProviders'
import { device } from '../../services/device'
import { useShell } from '../../state/shell'
import { applyLayout, setRect, testNavOptions } from '../../test/layout'
import MediaView, { playbackTick } from './MediaView'

let nav!: SpatialNavigation

function Probe() {
  nav = useSpatialNavigation()
  return null
}

function mount() {
  return render(
    <OsProviders nav={testNavOptions}>
      <Probe />
      <MediaView />
    </OsProviders>,
  )
}

/**
 * The geometry the CSS would produce. The transport row is centred on the seek
 * bar so "up from the scrubber" lands on play/pause rather than a neighbour —
 * the same thing the real layout does.
 */
function layout(): void {
  applyLayout([
    { selector: '[data-testid="media-queue"]', flow: 'row', x: 620, y: 16, w: 120, h: 40 },
    {
      selector: '[data-testid="media-transport"] button',
      flow: 'row',
      x: 106,
      y: 76,
      w: 100,
      h: 40,
      gap: 12,
    },
    { selector: '[data-testid="media-seek"]', flow: 'row', x: 90, y: 136, w: 580, h: 40 },
    { selector: '[data-testid="media-track"]', flow: 'column', x: 20, y: 216, w: 720, h: 40, gap: 6 },
  ])
  setRect(screen.getByTestId('media-now'), { x: 20, y: 16, w: 720, h: 160 })
  setRect(screen.getByTestId('media-library'), { x: 20, y: 216, w: 720, h: 1600 })
}

async function ready(): Promise<void> {
  await waitFor(() => expect(screen.getAllByTestId('media-track').length).toBeGreaterThan(0))
  layout()
}

const tracks = () => screen.getAllByTestId('media-track')
const firstTrack = () => tracks()[0]!
const trackIdOf = (el: HTMLElement) => el.dataset.trackId ?? ''
const albumOf = (id: string) => device.tracks.find((t) => t.id === id)?.album ?? ''

/** Play the first track in the library and leave focus on it. */
function playFirst(): string {
  const first = firstTrack()
  act(() => void nav.focus(first))
  act(() => void nav.activate())
  layout()
  return trackIdOf(first)
}

beforeEach(() => {
  playbackTick.ms = 0
  useShell.setState({
    views: [{ id: 'media' }],
    overlays: [],
    notice: null,
    player: {
      trackId: null,
      playing: false,
      positionSec: 0,
      queue: [],
      shuffle: false,
      repeat: 'off',
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
  playbackTick.ms = 1000
})

describe('MediaView', () => {
  it('loads the track library grouped by album', async () => {
    mount()
    await ready()

    const albums = screen.getAllByTestId('media-album').map((el) => el.textContent ?? '')
    expect(albums.length).toBe(new Set(device.tracks.map((t) => t.album)).size)
    expect(albums[0]).toContain('Signal Bloom')
    expect(tracks()).toHaveLength(device.tracks.length)
  })

  it('activating a track plays it with its own album as the queue', async () => {
    mount()
    await ready()

    const id = playFirst()
    const player = useShell.getState().player
    expect(player.trackId).toBe(id)
    expect(player.playing).toBe(true)
    expect(player.positionSec).toBe(0)
    expect(player.queue).toEqual(device.tracks.filter((t) => t.album === albumOf(id)).map((t) => t.id))
    expect(screen.getByTestId('media-title')).toHaveTextContent(
      device.tracks.find((t) => t.id === id)?.title ?? '',
    )
  })

  it('drives shuffle, play/pause, skip and repeat from the transport row', async () => {
    mount()
    await ready()
    const id = playFirst()
    const queue = useShell.getState().player.queue

    act(() => void nav.focus('[data-testid="media-play"]'))
    act(() => void nav.activate())
    expect(useShell.getState().player.playing).toBe(false)

    act(() => void nav.focus('[data-testid="media-next"]'))
    act(() => void nav.activate())
    layout()
    expect(useShell.getState().player.trackId).toBe(queue[queue.indexOf(id) + 1])

    act(() => void nav.focus('[data-testid="media-shuffle"]'))
    act(() => void nav.activate())
    expect(useShell.getState().player.shuffle).toBe(true)

    act(() => void nav.focus('[data-testid="media-repeat"]'))
    act(() => void nav.activate())
    expect(useShell.getState().player.repeat).toBe('all')
    act(() => void nav.activate())
    expect(useShell.getState().player.repeat).toBe('one')
  })

  it('scrubs on left/right while keeping focus on the seek bar', async () => {
    mount()
    await ready()
    playFirst()

    const seek = screen.getByTestId('media-seek')
    act(() => void nav.focus(seek))
    expect(nav.getFocused()).toBe(seek)

    act(() => void nav.navigate('right'))
    layout()
    expect(useShell.getState().player.positionSec).toBe(5)
    expect(nav.getFocused()).toBe(seek)
    expect(document.activeElement).toBe(seek)

    // A held press covers more ground — detail.repeat rides along on the same
    // event the scrub is driven from.
    act(() => void nav.navigate('right', true))
    layout()
    expect(useShell.getState().player.positionSec).toBe(20)

    act(() => void nav.navigate('left'))
    layout()
    expect(useShell.getState().player.positionSec).toBe(15)
    expect(nav.getFocused()).toBe(seek)
  })

  it('always lets focus leave the seek bar in the directions it does not own', async () => {
    mount()
    await ready()
    playFirst()

    const seek = screen.getByTestId('media-seek')
    act(() => void nav.focus(seek))
    act(() => void nav.navigate('up'))
    layout()
    expect(nav.getFocused()).toBe(screen.getByTestId('media-play'))

    act(() => void nav.focus(seek))
    act(() => void nav.navigate('down'))
    layout()
    expect(nav.getFocused()).toBe(firstTrack())
  })

  it('stays escapable at both ends of its own axis', async () => {
    mount()
    await ready()
    playFirst()
    const seek = screen.getByTestId('media-seek')

    // Pinned to 0 and then to the end: the clamp must not turn into a dead
    // control that has also stopped answering up/down.
    act(() => void nav.focus(seek))
    for (let i = 0; i < 6; i++) {
      act(() => void nav.navigate('left'))
      layout()
    }
    expect(useShell.getState().player.positionSec).toBe(0)
    expect(nav.getFocused()).toBe(seek)
    act(() => void nav.navigate('up'))
    layout()
    expect(nav.getFocused()).toBe(screen.getByTestId('media-play'))

    act(() => void nav.focus(seek))
    for (let i = 0; i < 200; i++) {
      act(() => void nav.navigate('right', true))
      layout()
    }
    const duration = device.tracks.find((t) => t.id === useShell.getState().player.trackId)
    expect(useShell.getState().player.positionSec).toBe(duration?.durationSec)
    expect(nav.getFocused()).toBe(seek)
    act(() => void nav.navigate('down'))
    layout()
    expect(nav.getFocused()).toBe(firstTrack())
  })

  it('advances the position from one timer and stops it when paused', async () => {
    playbackTick.ms = 100
    mount()
    await ready()

    // Fake timers must be in place before playback starts: the interval is
    // created by the effect that runs when `playing` flips.
    vi.useFakeTimers()
    playFirst()

    act(() => void vi.advanceTimersByTime(350))
    expect(useShell.getState().player.positionSec).toBeCloseTo(0.3, 5)

    act(() => useShell.getState().togglePlay())
    act(() => void vi.advanceTimersByTime(1000))
    expect(useShell.getState().player.positionSec).toBeCloseTo(0.3, 5)
  })

  it('keeps the player running when the view unmounts and remounts', async () => {
    const view = mount()
    await ready()
    const id = playFirst()
    act(() => useShell.getState().seek(42))

    view.unmount()
    expect(useShell.getState().player.trackId).toBe(id)
    expect(useShell.getState().player.playing).toBe(true)

    mount()
    await ready()
    expect(screen.getByTestId('media-position')).toHaveTextContent('0:42')
    expect(screen.getByTestId('media-title')).toHaveTextContent(
      device.tracks.find((t) => t.id === id)?.title ?? '',
    )
    expect(screen.getByTestId('media-play')).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens the play queue as a sheet', async () => {
    mount()
    await ready()
    playFirst()

    act(() => void nav.focus('[data-testid="media-queue"]'))
    act(() => void nav.activate())

    const overlay = useShell.getState().overlays.at(-1)
    expect(overlay?.kind).toBe('sheet')
    expect(overlay?.kind === 'sheet' ? overlay.sheet.body : null).toBe('track-queue')
  })
})
