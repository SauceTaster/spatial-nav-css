import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { HttpResponse, http } from 'msw'
import type { Direction, SpatialNavigation } from 'spatial-nav-css'
import { useSpatialNavigation } from 'spatial-nav-css/react'
import { server } from '../../test/setup'
import { applyLayout, setRect, testNavOptions } from '../../test/layout'
import { OsProviders, createOsQueryClient } from '../../os/OsProviders'
import { useShell } from '../../state/shell'
import { API } from '../../services/handlers'
import type { Drive, FsNode } from '../../services/device'
import FilesView from './FilesView'

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
 *   games/          (300)   ← dir, two children
 *     aether/       (200)   ← dir, two children
 *       pak0.vpk    (120)
 *       audio.pak   (80)
 *     nightfall.pak (100)
 *   system/         (120)   ← dir, one child
 *     os.img        (120)
 *   readme.txt      (5)
 */
function fixtureDrive(id: string, label: string): Drive {
  const root = folder(`${id}-root`, '/', [
    folder(`${id}-games`, 'games', [
      folder(`${id}-aether`, 'aether', [
        file(`${id}-pak0`, 'pak0.vpk', 120),
        file(`${id}-audio`, 'audio.pak', 80),
      ]),
      file(`${id}-nightfall`, 'nightfall.pak', 100),
    ]),
    folder(`${id}-system`, 'system', [file(`${id}-osimg`, 'os.img', 120)]),
    file(`${id}-readme`, 'readme.txt', 5),
  ])
  return { id, label, kind: 'internal', totalBytes: 1024 * GB, root }
}

function serveFixture(): void {
  const drives = [fixtureDrive('drive-a', 'Internal'), fixtureDrive('drive-b', 'microSD')]
  server.use(http.get(`${API}/drives`, () => HttpResponse.json({ items: drives })))
}

// ---------------------------------------------------------------- harness --

function Probe({ onReady }: { onReady: (nav: SpatialNavigation) => void }) {
  const nav = useSpatialNavigation()
  useEffect(() => onReady(nav), [nav, onReady])
  return null
}

function mount(driveId?: string) {
  let nav: SpatialNavigation | null = null
  render(
    <OsProviders client={createOsQueryClient()} nav={testNavOptions}>
      <Probe
        onReady={(n) => {
          nav = n
        }}
      />
      <FilesView driveId={driveId} />
    </OsProviders>,
  )
  return () => nav as SpatialNavigation
}

/** A single column of rows plus the drive selector above it. */
function layout(): void {
  applyLayout([
    { selector: '[data-testid="files-drive"]', flow: 'row', x: 24, y: 40, w: 160, h: 40, gap: 8 },
    { selector: '[data-testid="files-row"]', flow: 'column', x: 24, y: 120, w: 900, h: 40, gap: 0 },
  ])
  setRect(screen.getByTestId('files-tree'), { x: 24, y: 120, w: 900, h: 600 })
}

/**
 * A deliberately hostile variant: the drive selector is put *beside* the tree
 * rather than above it, so a row pressing left has a real geometric target to
 * be captured by. The tree contract has to hold anyway.
 */
function layoutWithSidebar(): void {
  applyLayout([
    { selector: '[data-testid="files-drive"]', flow: 'column', x: 24, y: 120, w: 160, h: 40, gap: 8 },
    { selector: '[data-testid="files-row"]', flow: 'column', x: 200, y: 120, w: 800, h: 40, gap: 0 },
  ])
  setRect(screen.getByTestId('files-tree'), { x: 200, y: 120, w: 800, h: 600 })
  setRect(screen.getByTestId('files-drives'), { x: 24, y: 120, w: 160, h: 200 })
}

const rowIds = () => screen.queryAllByTestId('files-row').map((el) => el.dataset.nodeId ?? '')
const focusedId = (nav: SpatialNavigation) => nav.getFocused()?.dataset.nodeId ?? null

async function ready(): Promise<void> {
  await waitFor(() => expect(screen.queryAllByTestId('files-row').length).toBeGreaterThan(0))
  layout()
}

const go = (nav: SpatialNavigation, dir: Direction) => {
  act(() => void nav.navigate(dir))
  layout()
}

const focusRow = (nav: SpatialNavigation, id: string) => {
  act(() => void nav.focus(`[data-testid="files-row"][data-node-id="${id}"]`))
  layout()
}

beforeEach(() => {
  serveFixture()
  useShell.setState({ views: [{ id: 'home' }, { id: 'files' }], overlays: [], notice: null })
})

describe('files tree', () => {
  it('lists the drive root, largest first, with collapsed children absent', async () => {
    mount()
    await ready()

    expect(rowIds()).toEqual(['drive-a-games', 'drive-a-system', 'drive-a-readme'])
    // Not merely hidden: a collapsed child must not be a spatial stop at all.
    expect(screen.queryByText('aether')).toBeNull()
    expect(screen.getAllByTestId('files-row')[0]).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows a size for every row', async () => {
    mount()
    await ready()
    expect(screen.getAllByTestId('files-row')[0]).toHaveTextContent('300 GB')
    expect(screen.getAllByTestId('files-row')[2]).toHaveTextContent('5.0 GB')
  })

  it('honours the drive it was pushed with, and can switch', async () => {
    const getNav = mount('drive-b')
    await ready()
    const nav = getNav()

    expect(rowIds()).toEqual(['drive-b-games', 'drive-b-system', 'drive-b-readme'])

    act(() => void nav.focus('[data-drive-id="drive-a"]'))
    act(() => void nav.activate())
    layout()
    expect(rowIds()).toEqual(['drive-a-games', 'drive-a-system', 'drive-a-readme'])
  })

  it('walks visible rows with up and down, skipping what is collapsed', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusRow(nav, 'drive-a-games')
    go(nav, 'down')
    expect(focusedId(nav)).toBe('drive-a-system')
    go(nav, 'down')
    expect(focusedId(nav)).toBe('drive-a-readme')
    go(nav, 'up')
    expect(focusedId(nav)).toBe('drive-a-system')
  })

  it('walks into children once a directory is expanded', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusRow(nav, 'drive-a-games')
    go(nav, 'right')
    go(nav, 'down')
    expect(focusedId(nav)).toBe('drive-a-aether')
    go(nav, 'down')
    expect(focusedId(nav)).toBe('drive-a-nightfall')
    go(nav, 'down')
    expect(focusedId(nav)).toBe('drive-a-system')
  })

  it('leaves the tree upward for the drive selector', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusRow(nav, 'drive-a-games')
    go(nav, 'up')
    expect(nav.getFocused()?.dataset.testid).toBe('files-drive')
  })
})

describe('files tree left/right semantics', () => {
  it('right expands a directory, and the highlight survives the insertion', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusRow(nav, 'drive-a-games')
    const before = nav.getFocused()
    go(nav, 'right')

    expect(rowIds()).toEqual([
      'drive-a-games',
      'drive-a-aether',
      'drive-a-nightfall',
      'drive-a-system',
      'drive-a-readme',
    ])
    // Two rows appeared directly beneath the focused one. Focus must not have
    // moved, and must still be the same element — a re-created row would have
    // dropped DOM focus to the body and left the engine restoring blind.
    expect(focusedId(nav)).toBe('drive-a-games')
    expect(nav.getFocused()).toBe(before)
    expect(nav.getFocused()).toHaveAttribute('data-spatial-focused')
  })

  it('right again moves to the first child', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusRow(nav, 'drive-a-games')
    go(nav, 'right')
    go(nav, 'right')
    expect(focusedId(nav)).toBe('drive-a-aether')

    // …and again, one level deeper.
    go(nav, 'right')
    go(nav, 'right')
    expect(focusedId(nav)).toBe('drive-a-pak0')
  })

  it('left collapses an expanded directory and keeps the highlight on it', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusRow(nav, 'drive-a-games')
    go(nav, 'right')
    expect(rowIds()).toHaveLength(5)

    go(nav, 'left')
    expect(rowIds()).toEqual(['drive-a-games', 'drive-a-system', 'drive-a-readme'])
    expect(focusedId(nav)).toBe('drive-a-games')
  })

  it('left on a leaf moves to its parent', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusRow(nav, 'drive-a-games')
    go(nav, 'right')
    focusRow(nav, 'drive-a-nightfall')
    go(nav, 'left')
    expect(focusedId(nav)).toBe('drive-a-games')
  })

  it('left on a collapsed directory moves to its parent rather than doing nothing', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusRow(nav, 'drive-a-games')
    go(nav, 'right')
    focusRow(nav, 'drive-a-aether')
    go(nav, 'left')
    expect(focusedId(nav)).toBe('drive-a-games')
  })

  it('does nothing horizontal at the edges of the tree', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    // A top-level leaf: no children to expand, no parent to climb to.
    focusRow(nav, 'drive-a-readme')
    go(nav, 'right')
    expect(focusedId(nav)).toBe('drive-a-readme')
    go(nav, 'left')
    expect(focusedId(nav)).toBe('drive-a-readme')
    expect(rowIds()).toHaveLength(3)
  })

  it('never lets left escape the tree sideways, whatever sits beside it', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    act(() => void nav.focus('[data-node-id="drive-a-readme"]'))
    layoutWithSidebar()
    // A top-level leaf: nothing to collapse, no parent to climb to. The drive
    // buttons are now directly to its left and perfectly aligned, so plain
    // geometry would take the press. `data-nav-left="none"` is what stops it.
    act(() => void nav.navigate('left'))
    layoutWithSidebar()
    expect(nav.getFocused()?.dataset.testid).toBe('files-row')
    expect(focusedId(nav)).toBe('drive-a-readme')
  })
})

describe('files details', () => {
  it('opens the details sheet for a file with the drive and node in the payload', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusRow(nav, 'drive-a-readme')
    act(() => void nav.activate())

    const overlay = useShell.getState().overlays.at(-1)
    expect(overlay?.kind).toBe('sheet')
    expect(overlay?.kind === 'sheet' && overlay.sheet).toMatchObject({
      title: 'readme.txt',
      body: 'file-details',
      payload: { driveId: 'drive-a', nodeId: 'drive-a-readme' },
    })
  })

  it('opens the details sheet for a directory too — A is properties, not open', async () => {
    const getNav = mount()
    await ready()
    const nav = getNav()

    focusRow(nav, 'drive-a-games')
    act(() => void nav.activate())

    const overlay = useShell.getState().overlays.at(-1)
    expect(overlay?.kind === 'sheet' && overlay.sheet.title).toBe('games')
    // Activation must not have doubled as an expand.
    expect(rowIds()).toHaveLength(3)
  })
})
