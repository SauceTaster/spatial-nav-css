import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SpatialNavigation } from 'spatial-nav-css'
import { useSpatialNavigation } from 'spatial-nav-css/react'
import { OsProviders } from '../../os/OsProviders'
import { device } from '../../services/device'
import { useShell } from '../../state/shell'
import { applyLayout, setRect, testNavOptions } from '../../test/layout'
import DownloadsView, { downloadsTick } from './DownloadsView'

let nav!: SpatialNavigation

function Probe() {
  nav = useSpatialNavigation()
  return null
}

function mount() {
  return render(
    <OsProviders nav={testNavOptions}>
      <Probe />
      <DownloadsView />
    </OsProviders>,
  )
}

/**
 * A grid needs a rect per *cell*, not per element list, so the focusables are
 * placed from their column key and their row's index — the same thing the real
 * table layout does, expressed as numbers jsdom can measure.
 */
const COL_X: Record<string, number> = {
  title: 20,
  progress: 450,
  size: 570,
  queued: 770,
  toggle: 880,
  prioritise: 990,
  cancel: 1100,
}
const CELL_W = 100
const CELL_H = 36
const HEAD_Y = 100
const BODY_Y = 150
const ROW_H = 44

function place(el: HTMLElement, y: number): void {
  setRect(el, { x: COL_X[el.dataset.col ?? ''] ?? 0, y, w: CELL_W, h: CELL_H })
}

function layout(): void {
  applyLayout([
    { selector: '[data-testid="dl-search"]', flow: 'row', x: 20, y: 16, w: 240, h: 36 },
    { selector: '[data-testid="dl-chip"]', flow: 'row', x: 20, y: 60, w: 110, h: 30, gap: 10 },
  ])
  setRect(screen.getByTestId('dl-clear'), { x: 1100, y: 16, w: 120, h: 36 })
  setRect(screen.getByTestId('dl-toolbar'), { x: 20, y: 16, w: 1200, h: 80 })
  for (const head of screen.getByTestId('dl-head').querySelectorAll<HTMLElement>('button')) {
    place(head, HEAD_Y)
  }
  screen.queryAllByTestId('dl-row').forEach((row, index) => {
    for (const cell of row.querySelectorAll<HTMLElement>('button')) place(cell, BODY_Y + index * ROW_H)
  })
  setRect(screen.getByTestId('dl-table-wrap'), { x: 20, y: HEAD_Y, w: 1200, h: 700 })
}

async function ready(): Promise<void> {
  await waitFor(() => expect(screen.getAllByTestId('dl-row').length).toBeGreaterThan(0))
  layout()
}

const rowFor = (jobId: string) =>
  document.querySelector<HTMLElement>(`[data-testid="dl-row"][data-job-id="${jobId}"]`)
const stateOf = (jobId: string) =>
  rowFor(jobId)?.querySelector('[data-testid="dl-state"]')?.textContent ?? null
const control = (testId: string, jobId: string) =>
  document.querySelector<HTMLElement>(`[data-testid="${testId}"][data-job-id="${jobId}"]`)!
const chipFor = (facet: string, value: string) =>
  document.querySelector<HTMLElement>(
    `[data-testid="dl-chip"][data-facet="${facet}"][data-value="${value}"]`,
  )!
const rows = () => screen.queryAllByTestId('dl-row')

beforeEach(() => {
  downloadsTick.ms = 0
  useShell.setState({ views: [{ id: 'downloads' }], overlays: [], notice: null })
})

afterEach(() => {
  downloadsTick.ms = 1000
})

describe('DownloadsView', () => {
  it('loads the whole download queue into the grid', async () => {
    mount()
    await ready()

    expect(rows()).toHaveLength(device.downloads.length)
    expect(screen.getByTestId('dl-count')).toHaveTextContent(
      `${device.downloads.length} of ${device.downloads.length} jobs`,
    )
    const first = device.downloads[0]!
    expect(control('dl-title', first.id)).toHaveTextContent(first.title)
    expect(stateOf(first.id)).toBe(first.state)
  })

  it('navigates cell to cell across columns and down rows', async () => {
    mount()
    await ready()
    const first = device.downloads[0]!
    const second = device.downloads[1]!

    act(() => void nav.focus(control('dl-title', first.id)))
    expect(nav.getFocused()).toHaveTextContent(first.title)

    act(() => void nav.navigate('right'))
    layout()
    expect(nav.getFocused()).toHaveAttribute('data-testid', 'dl-toggle')
    expect(nav.getFocused()).toHaveAttribute('data-job-id', first.id)
    expect(nav.getFocused()).toHaveTextContent('Pause') // the one running job

    act(() => void nav.navigate('right'))
    layout()
    expect(nav.getFocused()).toHaveTextContent('Prioritise')

    act(() => void nav.navigate('down'))
    layout()
    expect(nav.getFocused()).toHaveAttribute('data-testid', 'dl-prioritise')
    expect(nav.getFocused()).toHaveAttribute('data-job-id', second.id)

    act(() => void nav.navigate('left'))
    layout()
    act(() => void nav.navigate('left'))
    layout()
    expect(nav.getFocused()).toHaveAttribute('data-testid', 'dl-title')
    expect(nav.getFocused()).toHaveTextContent(second.title)

    // Up out of the body lands on the header cell of the same column, not on
    // whatever happens to be nearest in the toolbar.
    act(() => void nav.navigate('up'))
    layout()
    act(() => void nav.navigate('up'))
    layout()
    expect(nav.getFocused()).toHaveAttribute('data-testid', 'dl-sort')
    expect(nav.getFocused()).toHaveAttribute('data-col', 'title')
  })

  it('sorts from a header cell without dropping focus to the body', async () => {
    mount()
    await ready()

    const header = document.querySelector<HTMLElement>('[data-testid="dl-sort"][data-col="size"]')!
    act(() => void nav.focus(header))
    act(() => void nav.activate())
    layout()

    expect(document.activeElement).not.toBe(document.body)
    expect(nav.getFocused()).toBe(header)
    expect(screen.getByTestId('dl-head').querySelector('th[data-col="size"]')).toHaveAttribute(
      'aria-sort',
      'ascending',
    )

    const smallest = [...device.downloads].sort((a, b) => a.totalBytes - b.totalBytes)[0]!
    expect(rows()[0]).toHaveAttribute('data-job-id', smallest.id)

    act(() => void nav.activate())
    layout()
    const largest = [...device.downloads].sort((a, b) => b.totalBytes - a.totalBytes)[0]!
    expect(rows()[0]).toHaveAttribute('data-job-id', largest.id)
    expect(nav.getFocused()).toBe(header)
  })

  it('builds facet chips with live counts and filters by them', async () => {
    mount()
    await ready()

    const queued = device.downloads.filter((job) => job.state === 'queued')
    expect(queued.length).toBeGreaterThan(0)
    expect(queued.length).toBeLessThan(device.downloads.length)

    const chip = chipFor('state', 'queued')
    expect(chip.querySelector('[data-testid="dl-chip-count"]')).toHaveTextContent(String(queued.length))

    act(() => void nav.focus(chip))
    act(() => void nav.activate())
    layout()

    expect(rows()).toHaveLength(queued.length)
    expect(new Set(screen.getAllByTestId('dl-state').map((el) => el.textContent))).toEqual(
      new Set(['queued']),
    )
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    // Filtering must not move the ring: the chip you pressed is still under it.
    expect(nav.getFocused()).toBe(chip)

    // The kind facet is recounted against the surviving rows, not the whole set.
    const kindChips = [...document.querySelectorAll('[data-testid="dl-chip"][data-facet="kind"]')]
    const kindTotal = kindChips.reduce(
      (sum, el) => sum + Number(el.querySelector('[data-testid="dl-chip-count"]')?.textContent ?? 0),
      0,
    )
    expect(kindTotal).toBe(queued.length)
  })

  it('clearing the filters restores every row', async () => {
    mount()
    await ready()
    const total = device.downloads.length

    act(() => void nav.focus(chipFor('state', 'queued')))
    act(() => void nav.activate())
    layout()
    expect(rows().length).toBeLessThan(total)

    act(() => void nav.focus(screen.getByTestId('dl-clear')))
    act(() => void nav.activate())
    layout()

    expect(rows()).toHaveLength(total)
    expect(chipFor('state', 'queued')).toHaveAttribute('aria-pressed', 'false')
    expect(nav.getFocused()).toBe(screen.getByTestId('dl-clear'))
  })

  it('narrows the grid with the global text filter, and lets the user leave it', async () => {
    mount()
    await ready()
    const target = device.downloads[0]!
    const expected = device.downloads.filter((job) =>
      job.title.toLowerCase().includes(target.title.toLowerCase()),
    )

    const search = screen.getByTestId('dl-search')
    act(() => void nav.focus(search))
    act(() => {
      fireEvent.change(search, { target: { value: target.title } })
    })
    layout()
    expect(rows()).toHaveLength(expected.length)

    // The keyboard adapter hands editable elements straight to the browser, so
    // the field would otherwise be a one-way trip on a keyboard/remote.
    act(() => {
      fireEvent.keyDown(search, { key: 'Escape' })
    })
    expect(document.activeElement).toBe(screen.getByTestId('dl-clear'))
  })

  it('runs a row action and keeps the ring on the same control', async () => {
    mount()
    await ready()

    const job = device.downloads.find((j) => j.state === 'downloading')!
    const toggle = control('dl-toggle', job.id)
    act(() => void nav.focus(toggle))
    expect(toggle).toHaveTextContent('Pause')

    act(() => void nav.activate())
    await waitFor(() => expect(stateOf(job.id)).toBe('paused'))
    layout()

    expect(nav.getFocused()).toBe(toggle)
    expect(toggle).toHaveTextContent('Resume')
    expect(useShell.getState().notice).toContain(job.title)
  })

  it('keeps an unavailable action focusable instead of dropping the ring', async () => {
    mount()
    await ready()

    const done = device.downloads.find((job) => job.state === 'done')!
    const toggle = control('dl-toggle', done.id)
    expect(toggle).toHaveAttribute('aria-disabled', 'true')

    act(() => void nav.focus(toggle))
    expect(nav.getFocused()).toBe(toggle)
    act(() => void nav.activate())
    layout()
    expect(stateOf(done.id)).toBe('done')

    act(() => void nav.navigate('left'))
    layout()
    expect(nav.getFocused()).toHaveAttribute('data-testid', 'dl-title')
    expect(nav.getFocused()).toHaveAttribute('data-job-id', done.id)
  })

  it('routes cancel through the shell confirm before it mutates anything', async () => {
    mount()
    await ready()
    const job = device.downloads[0]!
    const before = device.downloads.length

    const cancel = control('dl-cancel', job.id)
    act(() => void nav.focus(cancel))
    act(() => void nav.activate())

    await waitFor(() => expect(useShell.getState().overlays.at(-1)?.kind).toBe('confirm'))
    const declined = useShell.getState().overlays.at(-1)
    expect(declined?.kind === 'confirm' ? declined.confirm.title : '').toContain(job.title)
    expect(declined?.kind === 'confirm' ? declined.confirm.destructive : false).toBe(true)

    // Declining settles the promise and changes nothing — the shell's
    // ConfirmDialog does exactly this.
    await act(async () => {
      if (declined?.kind === 'confirm') declined.confirm.resolve(false)
      useShell.setState((s) => ({ overlays: s.overlays.slice(0, -1) }))
    })
    expect(rows()).toHaveLength(before)
    expect(rowFor(job.id)).not.toBeNull()

    act(() => void nav.activate())
    await waitFor(() => expect(useShell.getState().overlays.at(-1)?.kind).toBe('confirm'))
    const accepted = useShell.getState().overlays.at(-1)
    await act(async () => {
      if (accepted?.kind === 'confirm') accepted.confirm.resolve(true)
      useShell.setState((s) => ({ overlays: s.overlays.slice(0, -1) }))
    })

    await waitFor(() => expect(rowFor(job.id)).toBeNull())
    expect(rows()).toHaveLength(before - 1)
  })
})
