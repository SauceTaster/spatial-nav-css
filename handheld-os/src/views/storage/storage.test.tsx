import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { HttpResponse, http } from 'msw'
import type { Direction, SpatialNavigation } from 'spatial-nav-css'
import { useSpatialEvent, useSpatialNavigation } from 'spatial-nav-css/react'
import { server } from '../../test/setup'
import { applyLayout, setRect, testNavOptions } from '../../test/layout'
import { OsProviders, createOsQueryClient } from '../../os/OsProviders'
import { ConfirmDialog } from '../../os/ConfirmDialog'
import { activeOverlay, useShell } from '../../state/shell'
import { API } from '../../services/handlers'
import type { Drive, FsNode } from '../../services/device'
import StorageView from './StorageView'

// --------------------------------------------------------------- fixture --

const GB = 1024 ** 3

const file = (id: string, name: string, gb: number): FsNode => ({
  id,
  name,
  kind: 'file',
  sizeBytes: gb * GB,
})

const folder = (id: string, name: string, children: FsNode[]): FsNode => ({
  id,
  name,
  kind: 'dir',
  sizeBytes: children.reduce((sum, c) => sum + c.sizeBytes, 0),
  children,
})

/**
 * A hand-built drive rather than the seeded device. The point of these tests
 * is exact geometry, and six blocks whose sizes are visible in the source is
 * something a reader can check the assertions against. It lays out as:
 *
 *   ┌──────────────┬──────────┐
 *   │  free (500)  │ alpha 400│
 *   ├────────┬─────┴──┬───────┤
 *   │ bravo  │charlie │ delta │
 *   │ (300)  │ (210)  ├───┬───┤
 *   │        │        │ e │ f │
 *   └────────┴────────┴───┴───┘
 */
function fixtureDrive(): Drive {
  const root = folder('root', '/', [
    folder('alpha', 'Alpha', [
      file('a1', 'pak0.vpk', 220),
      file('a2', 'pak1.vpk', 120),
      file('a3', 'audio.pak', 60),
    ]),
    folder('bravo', 'Bravo', [file('b1', 'data.pak', 180), file('b2', 'movies.pak', 120)]),
    folder('charlie', 'Charlie', [file('c1', 'levels.pak', 210)]),
    file('delta', 'delta.img', 95),
    file('echo', 'echo.bin', 62),
    file('foxtrot', 'foxtrot.log', 33),
  ])
  return { id: 'drive-fx', label: 'Fixture 1600 GB', kind: 'internal', totalBytes: 1600 * GB, root }
}

let drive: Drive

function serveFixture(): void {
  drive = fixtureDrive()
  server.use(
    http.get(`${API}/drives`, () => HttpResponse.json({ items: [drive] })),
    http.delete(`${API}/drives/:driveId/nodes/:nodeId`, ({ params }) => {
      const prune = (node: FsNode): void => {
        if (!node.children) return
        const index = node.children.findIndex((c) => c.id === params.nodeId)
        if (index >= 0) node.children.splice(index, 1)
        else for (const child of node.children) prune(child)
      }
      const total = (node: FsNode): number => {
        if (!node.children) return node.sizeBytes
        node.sizeBytes = node.children.reduce((sum, c) => sum + total(c), 0)
        return node.sizeBytes
      }
      prune(drive.root)
      total(drive.root)
      return HttpResponse.json(drive)
    }),
  )
}

// ---------------------------------------------------------------- harness --

const MAP = { x: 24, y: 200, w: 700, h: 500 }

function Probe({ onReady }: { onReady: (nav: SpatialNavigation) => void }) {
  const nav = useSpatialNavigation()
  useEffect(() => onReady(nav), [nav, onReady])
  return null
}

function Overlays() {
  const overlay = useShell(activeOverlay)
  return overlay?.kind === 'confirm' ? <ConfirmDialog spec={overlay.confirm} /> : null
}

/** The one line OsShell owns: back pops the view stack unless someone ate it. */
function ShellBack() {
  const back = useShell((s) => s.back)
  useSpatialEvent('spatial:back', (event) => {
    if (back()) event.preventDefault()
  })
  return null
}

function mount() {
  let nav: SpatialNavigation | null = null
  render(
    <OsProviders client={createOsQueryClient()} nav={testNavOptions}>
      <ShellBack />
      <Probe
        onReady={(n) => {
          nav = n
        }}
      />
      <StorageView />
      <Overlays />
    </OsProviders>,
  )
  return () => nav as SpatialNavigation
}

/**
 * Blocks tile exactly, so two neighbours ending at the same place must report
 * the *same* number. A browser guarantees that by snapping box edges to layout
 * units (1/64px in Blink); raw percentage arithmetic does not — co-terminating
 * boxes come out ~1e-13 apart, and the engine's direction test has no
 * tolerance, so one of them reads as "further right" than the other. Snapping
 * here reproduces browser behaviour rather than papering over it.
 */
const snap = (value: number) => Math.round(value * 64) / 64

/**
 * The component positions blocks as percentages of the map box, so the test
 * does what the browser would: resolve those percentages inside a chosen map
 * box. Every geometric assertion below therefore runs against the layout the
 * component actually rendered, not a re-derived one.
 */
function layout(): void {
  applyLayout([
    { selector: '[data-testid="storage-drive"]', flow: 'row', x: 24, y: 40, w: 200, h: 44, gap: 10 },
    { selector: '[data-testid="storage-crumb"]', flow: 'row', x: 24, y: 104, w: 120, h: 32, gap: 6 },
    {
      selector: '[data-testid="storage-panel"] .os-btn',
      flow: 'column',
      x: 754,
      y: 430,
      w: 256,
      h: 44,
      gap: 8,
    },
  ])
  setRect(screen.getByTestId('storage-map'), MAP)
  setRect(screen.getByTestId('storage-panel'), { x: 738, y: 200, w: 288, h: 500 })
  for (const el of screen.queryAllByTestId('tm-block')) {
    const style = (el as HTMLElement).style
    const share = (value: string) => Number.parseFloat(value) / 100
    const left = snap(MAP.x + share(style.left) * MAP.w)
    const top = snap(MAP.y + share(style.top) * MAP.h)
    const right = snap(MAP.x + MAP.w - share(style.right) * MAP.w)
    const bottom = snap(MAP.y + MAP.h - share(style.bottom) * MAP.h)
    setRect(el, { x: left, y: top, w: right - left, h: bottom - top })
  }
}

const blockIds = () => screen.queryAllByTestId('tm-block').map((el) => el.dataset.nodeId ?? '')

const focusedBlock = (nav: SpatialNavigation) => nav.getFocused()?.dataset.nodeId ?? null
const focusedTestId = (nav: SpatialNavigation) => nav.getFocused()?.dataset.testid ?? null

async function ready(): Promise<void> {
  await waitFor(() => expect(screen.queryAllByTestId('tm-block').length).toBeGreaterThan(0))
  layout()
}

const go = (nav: SpatialNavigation, dir: Direction) => {
  act(() => void nav.navigate(dir))
  layout()
}

const focusBlock = (nav: SpatialNavigation, id: string) => {
  act(() => void nav.focus(`[data-testid="tm-block"][data-node-id="${id}"]`))
  layout()
}

const activate = (nav: SpatialNavigation) => {
  act(() => void nav.activate())
  layout()
}

beforeEach(() => {
  useShell.setState({ views: [{ id: 'home' }, { id: 'storage' }], overlays: [], notice: null })
})

// ------------------------------------------------------------ seeded data --

describe('storage view', () => {
  it('loads the device drives and maps the first one', async () => {
    const getNav = mount()
    await ready()

    expect(screen.getAllByTestId('storage-drive')).toHaveLength(2)
    expect(screen.getAllByTestId('storage-drive')[0]).toHaveTextContent('Internal 1 TB')
    expect(screen.getAllByTestId('storage-crumb')).toHaveLength(1)
    expect(blockIds()).toEqual(['root-internal-steamapps', 'dir-system'])
    expect(getNav()).toBeTruthy()
  })

  it('reports an overcommitted drive instead of drawing negative free space', async () => {
    mount()
    await ready()

    // The seeded device stores ~6 TB on a "1 TB" drive, so there is no free
    // block to draw. Pinned because the alternative — a negative free size —
    // renders as "-5121000 MB" and looks like a formatting bug.
    expect(screen.getAllByTestId('storage-drive-free')[0]).toHaveTextContent('Over capacity')
    expect(blockIds()).not.toContain('__free__')
  })

  it('folds the long tail so no block is too small to aim at', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    // steamapps holds ~100 game folders; drilling in must not produce ~100
    // slivers. `aggregateSmall` caps the map and folds the rest into one.
    focusBlock(nav, 'root-internal-steamapps')
    activate(nav)
    await waitFor(() => expect(blockIds()).not.toContain('root-internal-steamapps'))
    layout()

    expect(blockIds().length).toBeLessThanOrEqual(28)
    expect(blockIds()).toContain('__other__')
  })

  it('switches drives and re-maps from the new root', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    act(() => void nav.focus('[data-drive-id="drive-sd"]'))
    activate(nav)
    await waitFor(() => expect(screen.getByTestId('storage-crumb')).toHaveTextContent('microSD'))
    layout()

    // The SD card carries only games, so the System directory is gone.
    expect(blockIds()).not.toContain('dir-system')
    expect(blockIds()).toEqual(['root-sd-steamapps'])
  })
})

// -------------------------------------------------------- fixture geometry --

describe('storage treemap geometry', () => {
  beforeEach(serveFixture)

  it('draws one block per child plus free space, largest first', async () => {
    mount()
    await ready()
    expect(blockIds()).toEqual(['__free__', 'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'])
  })

  /**
   * The valuable test. Every move below crosses blocks of very different
   * sizes, which is exactly where a centre-distance scorer goes diagonal.
   * Expectations are read off the fixture diagram above, not off the engine.
   */
  it.each([
    ['__free__', 'right', 'alpha'], // 55%-wide block → the 44%-wide one beside it
    ['__free__', 'down', 'bravo'], // …not charlie, which also touches its underside
    ['alpha', 'left', '__free__'],
    ['alpha', 'down', 'delta'], // alpha is 4x delta's area; delta is under its centre
    ['bravo', 'up', '__free__'],
    ['bravo', 'right', 'charlie'],
    ['charlie', 'up', 'alpha'], // free touches charlie too, but alpha holds its centre
    ['charlie', 'left', 'bravo'],
    ['delta', 'up', 'alpha'],
    ['delta', 'left', 'charlie'], // small block → the block twice its height beside it
    ['delta', 'down', 'echo'],
    ['echo', 'left', 'charlie'],
    ['echo', 'right', 'foxtrot'], // the two smallest blocks on the map
    ['echo', 'up', 'delta'],
    ['foxtrot', 'left', 'echo'],
    ['foxtrot', 'up', 'delta'], // the smallest block → the one that spans it
  ] as Array<[string, Direction, string]>)(
    'moving %s %s lands on %s',
    async (from, direction, expected) => {
      const getNav = mount()
      await ready()
      const nav = getNav()

      focusBlock(nav, from)
      go(nav, direction)
      expect(focusedBlock(nav)).toBe(expected)
    },
  )

  it('breaks a perfectly symmetric tie in favour of the larger block', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    // charlie's centre sits exactly on the delta/echo boundary, so both score
    // identically. The engine documents "first in candidate iteration wins",
    // which here is DOM order — and blocks are emitted largest-first, so the
    // bigger neighbour takes it. Pinned because it is the one move on this map
    // geometry alone cannot decide.
    focusBlock(nav, 'charlie')
    go(nav, 'right')
    expect(focusedBlock(nav)).toBe('delta')
  })

  it('leaves the map for the detail panel at its right edge', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusBlock(nav, 'alpha')
    go(nav, 'right')
    expect(focusedBlock(nav)).toBeNull()
    expect(focusedTestId(nav)).toBe('storage-open')
  })

  it('leaves the map upward for the drive selector', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusBlock(nav, '__free__')
    go(nav, 'up')
    expect(focusedTestId(nav)).toBe('storage-drive')
  })

  it('stays put at the edges of the map rather than jumping across it', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusBlock(nav, 'bravo')
    go(nav, 'left')
    expect(focusedBlock(nav)).toBe('bravo')
    go(nav, 'down')
    expect(focusedBlock(nav)).toBe('bravo')
  })

  it('follows focus with the detail panel', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusBlock(nav, 'charlie')
    expect(screen.getByTestId('storage-panel-name')).toHaveTextContent('Charlie')
    expect(screen.getByTestId('storage-panel-size')).toHaveTextContent('210 GB')

    go(nav, 'left')
    expect(screen.getByTestId('storage-panel-name')).toHaveTextContent('Bravo')
  })
})

// -------------------------------------------------------------- drill-down --

describe('storage drill-down', () => {
  beforeEach(serveFixture)

  it('descends into a directory and re-maps its children', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusBlock(nav, 'alpha')
    activate(nav)
    await waitFor(() => expect(blockIds()).toEqual(['a1', 'a2', 'a3']))
    layout()

    expect(screen.getAllByTestId('storage-crumb').map((el) => el.textContent)).toEqual([
      'Fixture 1600 GB',
      'Alpha',
    ])
    // Free space is a property of the drive, not of a directory.
    expect(blockIds()).not.toContain('__free__')
    // Focus followed the drill instead of being stranded on a removed block.
    expect(focusedBlock(nav)).toBe('a1')
  })

  it('back ascends one level and returns focus to the directory it left', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusBlock(nav, 'alpha')
    activate(nav)
    await waitFor(() => expect(blockIds()).toEqual(['a1', 'a2', 'a3']))
    layout()

    act(() => void nav.back())
    layout()
    expect(blockIds()).toContain('alpha')
    expect(focusedBlock(nav)).toBe('alpha')
    // The view consumed back, so the shell must not also have popped a view.
    expect(useShell.getState().views).toHaveLength(2)
  })

  it('back at the top level falls through to the shell', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusBlock(nav, 'alpha')
    act(() => void nav.back())
    expect(useShell.getState().views).toHaveLength(1)
  })

  it('breadcrumbs jump back to any ancestor', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusBlock(nav, 'alpha')
    activate(nav)
    await waitFor(() => expect(blockIds()).toEqual(['a1', 'a2', 'a3']))
    layout()

    act(() => void nav.focus('[data-testid="storage-crumb"]'))
    activate(nav)
    await waitFor(() => expect(blockIds()).toContain('alpha'))
    layout()
    expect(screen.getAllByTestId('storage-crumb')).toHaveLength(1)
  })
})

// ------------------------------------------------------------------ delete --

describe('storage delete', () => {
  beforeEach(serveFixture)

  it('confirms, deletes, and re-lays the map out around the gap', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    const freeBefore = screen.getByTestId('storage-panel-size')
    expect(freeBefore).toBeTruthy()

    focusBlock(nav, 'charlie')
    go(nav, 'right') // charlie → delta
    go(nav, 'right') // delta → the panel
    expect(focusedTestId(nav)).toBe('storage-browse')

    act(() => void nav.focus('[data-testid="storage-delete"]'))
    activate(nav)

    await waitFor(() => expect(screen.getByTestId('confirm')).toBeInTheDocument())
    expect(screen.getByTestId('confirm')).toHaveTextContent('Delete delta.img?')

    act(() => void nav.focus('[data-testid="confirm-ok"]'))
    act(() => void nav.activate())

    await waitFor(() => expect(blockIds()).not.toContain('delta'))
    layout()

    expect(blockIds()).toEqual(['__free__', 'alpha', 'bravo', 'charlie', 'echo', 'foxtrot'])
    expect(useShell.getState().notice).toContain('Deleted delta.img')
    // The highlight is on a live block, not stranded on the removed one.
    expect(nav.getFocused()?.isConnected).toBe(true)
    expect(focusedBlock(nav)).toBe('__free__')
  })

  it('cancelling leaves the map alone', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusBlock(nav, 'delta')
    act(() => void nav.focus('[data-testid="storage-delete"]'))
    activate(nav)

    await waitFor(() => expect(screen.getByTestId('confirm')).toBeInTheDocument())
    act(() => void nav.focus('[data-testid="confirm-cancel"]'))
    act(() => void nav.activate())

    await waitFor(() => expect(screen.queryByTestId('confirm')).toBeNull())
    layout()
    expect(blockIds()).toContain('delta')
  })

  it('offers nothing to delete for the free-space block', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusBlock(nav, '__free__')
    expect(screen.getByTestId('storage-delete')).toHaveAttribute('aria-disabled', 'true')
  })
})
