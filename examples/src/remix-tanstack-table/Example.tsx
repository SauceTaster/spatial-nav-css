/**
 * TanStack Table remix.
 *
 * A data grid is a 2D field of stops. The gotcha: don't make the <table> or a
 * <tr> the stop — make each cell a stop, so up/down walks a column and
 * left/right walks a row. Header cells are sortable buttons (native stops);
 * body cells opt in with data-focusable and an id the engine can place.
 *
 * Spatial focus is real DOM focus, so this composes with anything else that
 * reacts to focus. Sorting re-renders rows; autoRestoreFocus keeps focus sane.
 */
import { useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'

interface Row {
  name: string
  team: string
  commits: number
}
const DATA: Row[] = [
  { name: 'Ada', team: 'Core', commits: 312 },
  { name: 'Babbage', team: 'Infra', commits: 198 },
  { name: 'Curie', team: 'Core', commits: 421 },
  { name: 'Dijkstra', team: 'Infra', commits: 277 },
  { name: 'Euler', team: 'Tools', commits: 156 },
]

const col = createColumnHelper<Row>()
const columns = [
  col.accessor('name', { header: 'Name' }),
  col.accessor('team', { header: 'Team' }),
  col.accessor('commits', { header: 'Commits' }),
]

export function TanstackTableExample() {
  const [sorting, setSorting] = useState<SortingState>([])
  const table = useReactTable({
    data: DATA,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="ex-body">
      <section className="ex-panel" data-spatial-container="remember">
        <h2>Data grid — each cell is a spatial stop</h2>
        <p className="hint">
          Header cells are sortable <code>&lt;button&gt;</code>s (native stops). Body cells opt in
          with <code>data-focusable</code> and a stable id. <kbd>↑↓</kbd> walks a column,{' '}
          <kbd>←→</kbd> a row.
        </p>
        <table className="grid-table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th key={header.id}>
                    <button
                      type="button"
                      id={`th-${header.column.id}`}
                      className="th-sort"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? ''}
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, r) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell, c) => (
                  <td key={cell.id} id={`cell-${r}-${c}`} className="grid-cell" data-focusable>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
