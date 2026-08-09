/**
 * Downloads — the dense grid, and the screen that decides whether a spatial
 * engine is actually usable for real data.
 *
 * Two rules shape the markup:
 *
 *  1. **A cell is a stop, a row is not.** Making the row one big button is the
 *     easy way to get a navigable table and the wrong one: you lose per-cell
 *     actions, and "right" stops meaning anything. Only the cells that *do*
 *     something are focusable, so the grid navigates in real 2D — across the
 *     actions of a job, down the same action of every job — and the plain text
 *     columns stay text.
 *  2. **Unavailable is `aria-disabled`, never `disabled`.** A `disabled`
 *     button stops matching the focusable selector, so the ring would die
 *     under the user the instant a job finished. The engine watches the
 *     `disabled` attribute and restores focus for exactly this reason; not
 *     needing the rescue is better.
 *
 * The filter chips are built from TanStack Table's faceted row model rather
 * than a hardcoded list of states, so the counts are live and a value that no
 * longer occurs stops offering itself.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnFiltersState,
  type FilterFn,
  type SortingState,
} from '@tanstack/react-table'
import { clsx } from 'clsx'
import { osMutations, osQueries } from '../../services/api'
import { formatBytes, type DownloadJob } from '../../services/device'
import { useShell } from '../../state/shell'
import './downloads.css'

/**
 * Progress ticks. One timer for the whole grid, injectable so tests do not
 * race the download manager; `ms: 0` disables it.
 */
export const downloadsTick = { ms: 1000, seconds: 1 }

/** UTC: a queue timestamp must read the same on every machine that runs this. */
const formatClock = (ms: number): string => new Date(ms).toISOString().slice(11, 16)

/** Facet filter — the selected chips are a whitelist of exact values. */
const inFacet: FilterFn<DownloadJob> = (row, columnId, filterValue) => {
  const selected = filterValue as string[]
  return selected.length === 0 || selected.includes(String(row.getValue(columnId)))
}

type JobAction = 'pause' | 'resume' | 'cancel' | 'prioritise'

const ACTION_NOTICE: Record<JobAction, string> = {
  pause: 'Paused',
  resume: 'Resumed',
  cancel: 'Cancelled',
  prioritise: 'Prioritised',
}

function useJobAction() {
  const client = useQueryClient()
  const notify = useShell((s) => s.notify)
  return async (job: DownloadJob, action: JobAction) => {
    await osMutations.download(job.id, action)
    notify(`${ACTION_NOTICE[action]} ${job.title}`)
    await client.invalidateQueries({ queryKey: osQueries.downloads().queryKey })
  }
}

function TitleCell({ job }: { job: DownloadJob }) {
  const push = useShell((s) => s.push)
  return (
    <button
      type="button"
      className="dv-title"
      data-testid="dl-title"
      data-col="title"
      data-job-id={job.id}
      onClick={() => push({ id: 'game', gameId: job.gameId })}
    >
      {job.title}
    </button>
  )
}

function ProgressCell({ value }: { value: number }) {
  const percent = Math.round(value * 100)
  return (
    <span className="dv-progress">
      <span className="dv-progress-track" aria-hidden="true">
        <span className="dv-progress-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="dv-progress-value">{percent}%</span>
    </span>
  )
}

function RowActions({ job }: { job: DownloadJob }) {
  const run = useJobAction()
  const confirm = useShell((s) => s.confirm)
  const done = job.state === 'done'
  const running = job.state === 'downloading'

  const cancel = async () => {
    // Destructive and unrecoverable: it goes through the shell's confirm, which
    // is the one overlay in the app with a real focus trap.
    const ok = await confirm({
      title: `Cancel ${job.title}?`,
      message: 'The bytes already downloaded are discarded and the job leaves the queue.',
      confirmLabel: 'Cancel download',
      destructive: true,
    })
    if (ok) await run(job, 'cancel')
  }

  return (
    <span className="dv-actions">
      <button
        type="button"
        className="dv-act"
        data-testid="dl-toggle"
        data-col="toggle"
        data-job-id={job.id}
        aria-disabled={done ? true : undefined}
        onClick={() => {
          if (!done) void run(job, running ? 'pause' : 'resume')
        }}
      >
        {running ? 'Pause' : 'Resume'}
      </button>
      <button
        type="button"
        className="dv-act"
        data-testid="dl-prioritise"
        data-col="prioritise"
        data-job-id={job.id}
        aria-disabled={done ? true : undefined}
        onClick={() => {
          if (!done) void run(job, 'prioritise')
        }}
      >
        Prioritise
      </button>
      <button
        type="button"
        className="dv-act dv-act-danger"
        data-testid="dl-cancel"
        data-col="cancel"
        data-job-id={job.id}
        onClick={() => void cancel()}
      >
        Cancel
      </button>
    </span>
  )
}

const col = createColumnHelper<DownloadJob>()

const columns = [
  col.accessor('title', {
    header: 'Title',
    cell: (ctx) => <TitleCell job={ctx.row.original} />,
  }),
  col.accessor('kind', {
    header: 'Kind',
    enableSorting: false,
    filterFn: inFacet,
    cell: (ctx) => <span className="dv-kind">{ctx.getValue()}</span>,
  }),
  col.accessor('state', {
    header: 'State',
    enableSorting: false,
    filterFn: inFacet,
    cell: (ctx) => (
      <span className={`dv-state is-${ctx.getValue()}`} data-testid="dl-state">
        {ctx.getValue()}
      </span>
    ),
  }),
  col.accessor((row) => (row.totalBytes > 0 ? row.doneBytes / row.totalBytes : 0), {
    id: 'progress',
    header: 'Progress',
    enableGlobalFilter: false,
    cell: (ctx) => <ProgressCell value={ctx.getValue()} />,
  }),
  col.accessor('totalBytes', {
    id: 'size',
    header: 'Size',
    enableGlobalFilter: false,
    cell: (ctx) => <span data-testid="dl-size">{formatBytes(ctx.getValue())}</span>,
  }),
  col.accessor('bytesPerSecond', {
    id: 'speed',
    header: 'Speed',
    enableSorting: false,
    enableGlobalFilter: false,
    cell: (ctx) => (ctx.getValue() > 0 ? `${formatBytes(ctx.getValue())}/s` : '—'),
  }),
  col.accessor('queuedAt', {
    id: 'queued',
    header: 'Queued',
    enableGlobalFilter: false,
    cell: (ctx) => formatClock(ctx.getValue()),
  }),
  col.display({
    id: 'actions',
    header: 'Actions',
    cell: (ctx) => <RowActions job={ctx.row.original} />,
  }),
]

function FacetChips({ column, label }: { column: Column<DownloadJob, unknown>; label: string }) {
  const selected = (column.getFilterValue() as string[] | undefined) ?? []
  // Straight from the faceted row model: counts respond to the *other*
  // filters, so "queued 7" becomes "queued 2" once you narrow by kind.
  const facets = [...column.getFacetedUniqueValues().entries()]
    .map(([value, count]) => ({ value: String(value), count }))
    .sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))

  return (
    <div className="dv-facet">
      <span className="dv-facet-label">{label}</span>
      {facets.map(({ value, count }) => {
        const active = selected.includes(value)
        return (
          <button
            key={value}
            type="button"
            className={clsx('dv-chip', active && 'is-on')}
            data-testid="dl-chip"
            data-facet={column.id}
            data-value={value}
            aria-pressed={active}
            onClick={() => {
              const next = active ? selected.filter((v) => v !== value) : [...selected, value]
              column.setFilterValue(next.length > 0 ? next : undefined)
            }}
          >
            <span>{value}</span>
            <span className="dv-chip-count" data-testid="dl-chip-count">
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function DownloadsView() {
  const client = useQueryClient()
  const query = useQuery(osQueries.downloads())
  const data = useMemo(() => query.data?.items ?? [], [query.data])
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  useEffect(() => {
    if (downloadsTick.ms <= 0) return
    const id = setInterval(() => {
      void osMutations
        .tickDownloads(downloadsTick.seconds)
        .then(() => client.invalidateQueries({ queryKey: osQueries.downloads().queryKey }))
        .catch(() => {})
    }, downloadsTick.ms)
    return () => clearInterval(id)
  }, [client])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getRowId: (row) => row.id,
    globalFilterFn: 'includesString',
    // Every header sorts ascending on the first press. A grid where some
    // columns start descending reads as broken when you cannot see a cursor.
    sortDescFirst: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  const rows = table.getRowModel().rows
  const stateColumn = table.getColumn('state')
  const kindColumn = table.getColumn('kind')
  const filtered = columnFilters.length > 0 || globalFilter !== ''

  return (
    <div className="dv-root" data-testid="downloads">
      <div className="dv-toolbar" data-spatial-container="remember" data-testid="dl-toolbar">
        <input
          type="text"
          className="dv-search"
          data-testid="dl-search"
          aria-label="Filter downloads"
          placeholder="Filter by title…"
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          onKeyDown={(event) => {
            // The keyboard adapter leaves editable targets entirely native, so
            // neither the arrows nor Escape reach the engine from in here. The
            // gamepad's semantic intents navigate away on their own; the
            // keyboard needs this exit handed to it. (docs/recipes.md,
            // "Settings form".)
            if (event.key !== 'Escape') return
            event.preventDefault()
            document.querySelector<HTMLElement>('[data-testid="dl-clear"]')?.focus()
          }}
        />
        {stateColumn ? <FacetChips column={stateColumn} label="State" /> : null}
        {kindColumn ? <FacetChips column={kindColumn} label="Kind" /> : null}
        <button
          type="button"
          className="dv-clear"
          data-testid="dl-clear"
          aria-disabled={filtered ? undefined : true}
          onClick={() => {
            if (!filtered) return
            table.resetColumnFilters()
            setGlobalFilter('')
          }}
        >
          Clear filters
        </button>
      </div>

      <p className="dv-count os-dim" data-testid="dl-count">
        {rows.length} of {data.length} jobs
      </p>

      <div className="dv-table-wrap" data-spatial-container="remember" data-testid="dl-table-wrap">
        <table className="dv-table">
          <thead data-testid="dl-head">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sortable = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      data-col={header.column.id}
                      aria-sort={
                        sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : sortable
                              ? 'none'
                              : undefined
                      }
                    >
                      {sortable ? (
                        <button
                          type="button"
                          className="dv-sort"
                          data-testid="dl-sort"
                          data-col={header.column.id}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span className="dv-sort-glyph" aria-hidden="true">
                            {sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '⇅'}
                          </span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="dv-empty" colSpan={columns.length} data-testid="dl-empty">
                  {query.isPending ? 'Reading the download queue…' : 'No jobs match these filters.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} data-testid="dl-row" data-job-id={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} data-col={cell.column.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
