import { beforeEach, describe, expect, it } from 'vitest'
import { activeOverlay, currentView, useShell } from './shell'

const reset = () =>
  useShell.setState({
    views: [{ id: 'home' }],
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

beforeEach(reset)

describe('view stack', () => {
  it('pushes and pops, and never pops past home', () => {
    const s = useShell.getState()
    s.push({ id: 'library' })
    s.push({ id: 'game', gameId: 'game-3' })
    expect(currentView(useShell.getState())).toEqual({ id: 'game', gameId: 'game-3' })

    useShell.getState().pop()
    expect(currentView(useShell.getState())).toEqual({ id: 'library' })
    useShell.getState().pop()
    useShell.getState().pop()
    useShell.getState().pop()
    // Home is the floor of the stack: an OS has nowhere further back to go.
    expect(useShell.getState().views).toEqual([{ id: 'home' }])
  })

  it('goHome clears the stack and any overlay', () => {
    const s = useShell.getState()
    s.push({ id: 'library' })
    s.openQuickAccess()
    useShell.getState().goHome()
    expect(useShell.getState().views).toEqual([{ id: 'home' }])
    expect(useShell.getState().overlays).toEqual([])
  })
})

describe('back', () => {
  it('closes the overlay first, then walks the view stack', () => {
    const s = useShell.getState()
    s.push({ id: 'library' })
    s.openQuickAccess()

    // Overlay wins: back must not navigate the screen underneath.
    expect(useShell.getState().back()).toBe(true)
    expect(useShell.getState().overlays).toEqual([])
    expect(currentView(useShell.getState())).toEqual({ id: 'library' })

    expect(useShell.getState().back()).toBe(true)
    expect(currentView(useShell.getState())).toEqual({ id: 'home' })

    // Home with nothing open: unhandled, so the caller can decide.
    expect(useShell.getState().back()).toBe(false)
  })
})

describe('overlays', () => {
  it('keeps the quick-access menu single-instance', () => {
    const s = useShell.getState()
    s.openQuickAccess('audio')
    s.openQuickAccess('power')
    expect(useShell.getState().overlays).toHaveLength(1)
  })

  it('switches quick-access tabs in place', () => {
    useShell.getState().openQuickAccess('audio')
    useShell.getState().setQuickAccessTab('network')
    const overlay = activeOverlay(useShell.getState())
    expect(overlay).toMatchObject({ kind: 'quick-access', tab: 'network' })
  })

  it('settles a dismissed confirm so the caller never hangs', async () => {
    const pending = useShell.getState().confirm({ title: 'Delete', message: 'Sure?' })
    expect(useShell.getState().overlays).toHaveLength(1)

    // Dismissal — a back press, a scrim click — must resolve, not just unmount.
    useShell.getState().closeOverlay()
    await expect(pending).resolves.toBe(false)
    expect(useShell.getState().overlays).toEqual([])
  })

  it('stacks a confirm over a sheet and unwinds in order', async () => {
    const s = useShell.getState()
    s.openSheet({ id: 'sheet-1', title: 'Properties', body: 'game-properties' })
    const pending = useShell.getState().confirm({ title: 'Reset', message: 'Sure?' })
    expect(useShell.getState().overlays).toHaveLength(2)
    expect(activeOverlay(useShell.getState())?.kind).toBe('confirm')

    useShell.getState().back()
    await expect(pending).resolves.toBe(false)
    expect(activeOverlay(useShell.getState())?.kind).toBe('sheet')
    useShell.getState().back()
    expect(useShell.getState().overlays).toEqual([])
  })
})

describe('player', () => {
  it('plays a track and takes the queue with it', () => {
    useShell.getState().playTrack('t2', ['t1', 't2', 't3'])
    const { player } = useShell.getState()
    expect(player).toMatchObject({ trackId: 't2', playing: true, positionSec: 0 })
    expect(player.queue).toEqual(['t1', 't2', 't3'])
  })

  it('skips within the queue and wraps at both ends', () => {
    const s = useShell.getState()
    s.playTrack('t1', ['t1', 't2', 't3'])
    useShell.getState().skip(1)
    expect(useShell.getState().player.trackId).toBe('t2')

    useShell.getState().skip(-1)
    expect(useShell.getState().player.trackId).toBe('t1')
    // Previous from the first track wraps to the last, as a transport should.
    useShell.getState().skip(-1)
    expect(useShell.getState().player.trackId).toBe('t3')
    useShell.getState().skip(1)
    expect(useShell.getState().player.trackId).toBe('t1')
  })

  it('skipping resets the position and keeps playing', () => {
    const s = useShell.getState()
    s.playTrack('t1', ['t1', 't2'])
    useShell.getState().seek(90)
    useShell.getState().skip(1)
    expect(useShell.getState().player).toMatchObject({ positionSec: 0, playing: true })
  })

  it('ignores a skip with an empty queue instead of throwing', () => {
    expect(() => useShell.getState().skip(1)).not.toThrow()
    expect(useShell.getState().player.trackId).toBeNull()
  })
})
