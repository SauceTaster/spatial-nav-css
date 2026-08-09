/**
 * Files — a filesystem tree over the same `FsNode` data the treemap draws.
 *
 * Two decisions worth stating:
 *
 * 1. **Every visible row is a spatial stop, and collapsed children are not
 *    rendered at all.** The roving-tabindex `role="tree"` pattern presents the
 *    whole tree as one stop and owns the arrow keys inside it — correct for a
 *    keyboard web app, wrong here, where the D-pad *is* the pointer and a
 *    gamepad intent never reaches a keydown handler. So: plain `<button>`s,
 *    `aria-expanded` for state, and no `role="tree"` claim we do not honour.
 *
 * 2. **Left/right are tree semantics, not geometry.** Rows are blocked with
 *    `data-nav-left/right="none"` and the resulting `spatial:nofocustarget` is
 *    what drives collapse/expand. Doing it that way rather than with a React
 *    `onKeyDown` is what makes it work on a gamepad: the engine only ever sees
 *    a `NavIntent`, and a D-pad press produces no key event to listen for. It
 *    also states the intent declaratively — in a tree, horizontal movement is
 *    never a geometric move — instead of racing the engine for the same press.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSpatialEvent, useSpatialNavigation } from 'spatial-nav-css/react'
import { osQueries } from '../../services/api'
import { formatBytes, type Drive, type FsNode } from '../../services/device'
import { useShell } from '../../state/shell'
import './files.css'

interface Row {
  node: FsNode
  depth: number
  parentId: string | null
  hasChildren: boolean
}

/** Largest first, ties by name — a directory listing must not reshuffle. */
const bySize = (a: FsNode, b: FsNode) =>
  b.sizeBytes - a.sizeBytes || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

function flatten(
  nodes: readonly FsNode[],
  expanded: ReadonlySet<string>,
  depth: number,
  parentId: string | null,
  out: Row[],
): Row[] {
  for (const node of [...nodes].sort(bySize)) {
    const hasChildren = (node.children?.length ?? 0) > 0
    out.push({ node, depth, parentId, hasChildren })
    if (hasChildren && expanded.has(node.id)) {
      flatten(node.children ?? [], expanded, depth + 1, node.id, out)
    }
  }
  return out
}

export default function FilesView({ driveId }: { driveId?: string }) {
  const nav = useSpatialNavigation()
  const openSheet = useShell((s) => s.openSheet)

  const drivesQuery = useQuery(osQueries.drives())
  const drives = useMemo<Drive[]>(() => drivesQuery.data?.items ?? [], [drivesQuery.data])

  const [selectedDrive, setSelectedDrive] = useState<string | null>(driveId ?? null)
  const drive = drives.find((d) => d.id === selectedDrive) ?? drives[0] ?? null

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [treeEl, setTreeEl] = useState<HTMLDivElement | null>(null)

  const rows = useMemo(
    () => (drive ? flatten(drive.root.children ?? [], expanded, 0, null, []) : []),
    [drive, expanded],
  )
  const indexOf = useMemo(() => new Map(rows.map((row, i) => [row.node.id, i])), [rows])

  // Switching drives must not carry the old drive's open folders across.
  useEffect(() => setExpanded(new Set()), [drive?.id])

  const focusRow = (id: string | null | undefined) => {
    if (!id || !treeEl) return
    const target = treeEl.querySelector<HTMLElement>(`[data-node-id="${id}"]`)
    if (target) nav.focus(target)
  }

  const setOpen = (id: string, open: boolean) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (open) next.add(id)
      else next.delete(id)
      return next
    })
  }

  /**
   * The standard tree contract, over spatial navigation. Rows block left and
   * right, so the engine reports "no target" and hands us the press with the
   * origin attached — the same information a key handler would have had, but
   * for every input device rather than just the keyboard.
   */
  useSpatialEvent(
    'spatial:nofocustarget',
    (event) => {
      const direction = event.detail.direction
      if (direction !== 'left' && direction !== 'right') return
      const id = event.detail.from?.dataset.nodeId
      if (!id) return
      const index = indexOf.get(id)
      if (index === undefined) return
      const row = rows[index]
      if (!row) return

      if (direction === 'right') {
        if (!row.hasChildren) return
        if (!expanded.has(id)) setOpen(id, true)
        // The row after an expanded directory is its first child, because the
        // flattener emits children immediately after their parent.
        else focusRow(rows[index + 1]?.node.id)
        return
      }
      if (row.hasChildren && expanded.has(id)) setOpen(id, false)
      else focusRow(row.parentId)
    },
    treeEl,
  )

  const maxSize = rows.reduce((max, row) => Math.max(max, row.node.sizeBytes), 0)

  return (
    <div className="fv-root" data-testid="files">
      <header className="fv-head">
        <div className="fv-drives" data-spatial-container="remember" data-testid="files-drives">
          {drives.map((d) => (
            <button
              key={d.id}
              type="button"
              className="fv-drive"
              data-testid="files-drive"
              data-drive-id={d.id}
              aria-pressed={d.id === drive?.id}
              onClick={() => setSelectedDrive(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p className="fv-path os-dim" data-testid="files-path">
          {drive?.root.name ?? '—'} · {formatBytes(drive?.root.sizeBytes ?? 0)}
        </p>
      </header>

      <div
        className="fv-tree"
        ref={setTreeEl}
        data-spatial-container="remember"
        data-testid="files-tree"
        role="group"
        aria-label="Files"
      >
        {drivesQuery.isPending ? <p className="fv-empty os-dim">Reading disk…</p> : null}
        {rows.map((row, i) => {
          const open = expanded.has(row.node.id)
          return (
            <button
              key={row.node.id}
              type="button"
              className="fv-row"
              data-testid="files-row"
              data-node-id={row.node.id}
              data-depth={row.depth}
              data-kind={row.node.kind}
              // Horizontal movement in a tree is collapse/expand, never a
              // geometric move to whatever happens to sit beside the row.
              data-nav-left="none"
              data-nav-right="none"
              aria-expanded={row.hasChildren ? open : undefined}
              aria-level={row.depth + 1}
              style={{ '--depth': row.depth } as React.CSSProperties}
              {...(i === 0 ? { 'data-spatial-autofocus': '' } : {})}
              onClick={() =>
                drive &&
                openSheet({
                  id: `file-${row.node.id}`,
                  title: row.node.name,
                  body: 'file-details',
                  payload: { driveId: drive.id, nodeId: row.node.id },
                })
              }
            >
              <span className="fv-twisty" aria-hidden="true">
                {row.hasChildren ? (open ? '▾' : '▸') : ''}
              </span>
              <span className="fv-name">{row.node.name}</span>
              <span className="fv-bar" aria-hidden="true">
                <span
                  className="fv-bar-fill"
                  style={{ width: `${maxSize > 0 ? (row.node.sizeBytes / maxSize) * 100 : 0}%` }}
                />
              </span>
              <span className="fv-size">{formatBytes(row.node.sizeBytes)}</span>
            </button>
          )
        })}
      </div>

      <p className="fv-hint os-dim">
        <kbd>→</kbd> expand · <kbd>←</kbd> collapse / parent · <kbd>A</kbd> details
      </p>
    </div>
  )
}
