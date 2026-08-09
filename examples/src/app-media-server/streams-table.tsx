/**
 * Active streams, as a TanStack Table v8 grid.
 *
 * The spatial rule for a data grid (same as the tanstack-table remix): the
 * <table> and the <tr> are *not* stops — each cell is. Up/down then walks a
 * column and left/right walks a row, which is the only mapping that matches
 * what the user sees.
 *
 * Two flavors of cell here, and the difference matters:
 *  - data cells opt in with `data-focusable`, so the highlight can rest on a
 *    value the operator wants to read;
 *  - the action cell holds a real <button>, which is already a native stop, so
 *    the <td> around it must NOT be focusable — otherwise one cell would cost
 *    two presses to cross and the ring would sometimes sit on the padding.
 *
 * Sorting reorders rows under the highlight. React moves the <tr> nodes, so a
 * focused cell can be detached and re-attached mid-update; the engine keeps the
 * spatial position across that (see media-server.test.tsx).
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
import type { StreamSession } from '../shared/api/db'

const col = createColumnHelper<StreamSession>()

const columns = [
  col.accessor('user', { header: 'User' }),
  col.accessor('title', { header: 'Now playing' }),
  // Device and quality are labels, not questions anyone sorts by. Their
  // headers stay plain text — a <th> that isn't a control isn't a stop, and
  // pretending otherwise just adds two dead stops to the header row.
  col.accessor('device', { header: 'Device', enableSorting: false }),
  col.accessor('quality', {
    header: 'Quality',
    enableSorting: false,
    cell: (cell) => (
      <>
        {cell.getValue()}
        {cell.row.original.transcoding ? <span className="ms-tag">transcode</span> : null}
      </>
    ),
  }),
  col.accessor('bandwidthMbps', {
    header: 'Bandwidth',
    cell: (cell) => `${cell.getValue()} Mbps`,
  }),
]

export function StreamsTable({
  sessions,
  onStop,
}: {
  sessions: StreamSession[]
  onStop: (session: StreamSession) => void
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const table = useReactTable({
    data: sessions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    // Key rows by session id, not row index, so sorting genuinely moves DOM
    // nodes instead of rewriting text in place — that is the case worth
    // proving focus survives.
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <table className="ms-table">
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => (
              <th key={header.id} scope="col" className="ms-th">
                {header.column.getCanSort() ? (
                  <button
                    type="button"
                    className="ms-sort"
                    data-testid="stream-sort"
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
            <th scope="col" className="ms-th">
              Action
            </th>
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id} data-testid="stream-row" data-session-id={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td
                key={cell.id}
                className="ms-cell"
                data-focusable
                data-testid="stream-cell"
                data-column={cell.column.id}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
            {/* Rendered outside the column model on purpose: the action is not
                data, it is a control, and it is the one cell whose stop is the
                button rather than the <td>. */}
            <td className="ms-cell ms-cell-action">
              <button
                type="button"
                className="ms-danger"
                data-testid="stop-stream"
                data-session-id={row.original.id}
                onClick={() => onStop(row.original)}
              >
                Stop
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
