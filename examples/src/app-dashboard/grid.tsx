/**
 * The catalog grid — a dense TanStack Table with sorting, filtering, row
 * selection and pagination.
 *
 * Spatial rules a grid has to get right:
 *  - the <table> and the <tr> are NOT stops. Each cell is. That is the only
 *    mapping where ↑↓ walks a column and ←→ walks a row, which is what the
 *    user sees.
 *  - a cell that contains a control (the select checkbox) leaves the <td>
 *    alone: the control is already a native stop, and making both focusable
 *    would cost two presses to cross one cell.
 *  - the header row is part of the same 2D field: its sort buttons sit
 *    directly above their column, so ↑ from the first body row lands on the
 *    header that sorts it.
 *  - rows are keyed by id, so sorting genuinely moves DOM nodes rather than
 *    rewriting text in place — the case worth proving focus survives.
 */
import { useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { useSpatialNavigation } from 'spatial-nav-css/react'
import type { Game } from '../shared/api/db'

const PAGE_SIZE = 8

const col = createColumnHelper<Game>()

const columns = [
  col.display({
    id: 'select',
    enableSorting: false,
    header: ({ table }) => (
      <input
        type="checkbox"
        className="dash-check"
        data-testid="grid-select-all"
        aria-label="Select every row on this page"
        checked={table.getIsAllPageRowsSelected()}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        className="dash-check"
        data-testid="row-select"
        data-row-id={row.id}
        aria-label={`Select ${row.original.title}`}
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
  }),
  col.accessor('title', { header: 'Title' }),
  col.accessor('developer', { header: 'Studio' }),
  col.accessor('sizeGB', { header: 'Size', cell: (cell) => `${cell.getValue()} GB` }),
  col.accessor('playtimeHours', { header: 'Runtime', cell: (cell) => `${cell.getValue()} h` }),
  col.accessor('installed', { header: 'Deployed', cell: (cell) => (cell.getValue() ? 'yes' : 'no') }),
]

export function CatalogGrid({ rows }: { rows: Game[] }) {
  const nav = useSpatialNavigation()
  const [sorting, setSorting] = useState<SortingState>([])
  const [filter, setFilter] = useState('')
  const [selection, setSelection] = useState<RowSelectionState>({})

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter: filter, rowSelection: selection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    onRowSelectionChange: setSelection,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: PAGE_SIZE } },
  })

  const page = table.getState().pagination.pageIndex
  const pageCount = Math.max(table.getPageCount(), 1)
  const selected = Object.keys(selection).length

  return (
    // `remember` and deliberately not `contain`: coming back from the chart or
    // the log stream should land on the row you left, but a grid you cannot
    // navigate out of is a trap — see the rail comment in app-game-launcher.
    <section className="dash-panel dash-grid" data-spatial-container="remember" data-testid="grid-panel">
      <div className="dash-panel-head">
        <h2>Catalog</h2>
        <span className="dash-muted" data-testid="selection-count">
          {selected} selected · {table.getFilteredRowModel().rows.length} of {rows.length} rows
        </span>
      </div>

      <div className="dash-toolbar">
        <input
          type="search"
          className="dash-input"
          data-testid="grid-filter"
          placeholder="Filter titles…"
          aria-label="Filter the catalog"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          onKeyDown={(event) => {
            // The keyboard adapter ignores mapped keys while the target is
            // editable, which is right for ←→ (caret movement) but would
            // strand a d-pad user in the field forever. Hand the vertical axis
            // back to the engine explicitly — the one escape hatch this row
            // needs. See docs/recipes.md, "Settings form (mixed widgets)".
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
            event.preventDefault()
            nav.navigate(event.key === 'ArrowDown' ? 'down' : 'up')
          }}
        />
        <button
          type="button"
          className="dash-control"
          data-testid="page-prev"
          aria-disabled={!table.getCanPreviousPage() || undefined}
          onClick={() => table.previousPage()}
        >
          ‹ Prev
        </button>
        <button
          type="button"
          className="dash-control"
          data-testid="page-next"
          aria-disabled={!table.getCanNextPage() || undefined}
          onClick={() => table.nextPage()}
        >
          Next ›
        </button>
        <span className="dash-muted" data-testid="page-status">
          Page {page + 1} / {pageCount}
        </span>
      </div>

      <table className="dash-table">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id} scope="col" className="dash-th" data-column={header.column.id}>
                  {header.column.getCanSort() ? (
                    <button
                      type="button"
                      className="dash-sort"
                      data-testid="grid-sort"
                      data-column={header.column.id}
                      aria-label={`Sort by ${String(header.column.columnDef.header)}`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? ' ↕'}
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className={row.getIsSelected() ? 'is-selected' : undefined}
              data-testid="grid-row"
              data-row-id={row.id}
            >
              {row.getVisibleCells().map((cell) =>
                cell.column.id === 'select' ? (
                  // Control cell: the checkbox is the stop, the <td> is not.
                  <td key={cell.id} className="dash-td dash-td-control">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ) : (
                  <td
                    key={cell.id}
                    className="dash-td"
                    data-focusable
                    data-testid="grid-cell"
                    data-column={cell.column.id}
                    data-row-id={row.id}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {table.getRowModel().rows.length === 0 ? (
        <p className="dash-muted" data-testid="grid-empty">
          Nothing matches that filter.
        </p>
      ) : null}
    </section>
  )
}
