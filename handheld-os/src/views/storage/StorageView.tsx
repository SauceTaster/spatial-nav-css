/**
 * Storage — a WizTree-style block treemap of what is on the disk.
 *
 * This is the hardest surface in the shell to navigate, and everything here is
 * arranged around making the *geometry* honest rather than papering over it
 * with overrides:
 *
 *  - Blocks are real `<button>`s, absolutely positioned, one spatial stop
 *    each. A canvas would have been half the code and none of the point.
 *  - The layout is computed in a 0..100 box and rendered as percentages, so
 *    the component never measures itself. No ResizeObserver in the render
 *    path, and the rects a test describes are the rects the browser produces.
 *  - The tail of tiny files is folded into one block (see `aggregateSmall`):
 *    a 12px sliver is a focus stop nobody can see or aim at.
 *  - Free space is a block too. A map that only draws what is used tells you
 *    the disk is full when it is half empty.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSpatialEvent, useSpatialNavigation } from 'spatial-nav-css/react'
import { osMutations, osQueries } from '../../services/api'
import { formatBytes, walkFs, type Drive, type FsNode } from '../../services/device'
import { useShell } from '../../state/shell'
import { OsButton } from '../../ui/controls'
import { aggregateSmall, layoutTreemap, type TreemapItem } from './treemap'
import './storage.css'

const FREE_ID = '__free__'
const OTHER_ID = '__other__'

type Category = 'free' | 'other' | 'system' | 'game' | 'data'

interface Block {
  id: string
  x: number
  y: number
  w: number
  h: number
  size: number
  name: string
  category: Category
  /** The real filesystem node, or null for the free-space / aggregate blocks. */
  node: FsNode | null
}

const pct = (value: number) => `${Math.round(value * 1e4) / 1e4}%`

function categoryOf(node: FsNode, trail: readonly FsNode[]): Category {
  if (node.gameId || trail.some((t) => t.gameId)) return 'game'
  if (node.id === 'dir-system' || trail.some((t) => t.id === 'dir-system')) return 'system'
  return 'data'
}

/** Files and directories beneath a node, for the detail panel. */
function countDescendants(node: FsNode): { files: number; dirs: number } {
  let files = 0
  let dirs = 0
  walkFs(node, (n, depth) => {
    if (depth === 0) return
    if (n.kind === 'dir') dirs += 1
    else files += 1
  })
  return { files, dirs }
}

export default function StorageView() {
  const nav = useSpatialNavigation()
  const push = useShell((s) => s.push)
  const confirm = useShell((s) => s.confirm)
  const notify = useShell((s) => s.notify)
  const queryClient = useQueryClient()

  const drivesQuery = useQuery(osQueries.drives())
  const drives = useMemo<Drive[]>(() => drivesQuery.data?.items ?? [], [drivesQuery.data])

  const [driveId, setDriveId] = useState<string | null>(null)
  const drive = drives.find((d) => d.id === driveId) ?? drives[0] ?? null

  /** Ids of the directories drilled into, below the drive root. */
  const [path, setPath] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)
  /** Block to focus once the next layout lands; null means "the first one". */
  const pendingFocus = useRef<string | null | undefined>(undefined)

  /**
   * Resolved rather than trusted: a delete can remove a directory we are
   * standing in, and re-resolving every render truncates the trail instead of
   * leaving the view pointed at a node that no longer exists.
   */
  const trail = useMemo<FsNode[]>(() => {
    if (!drive) return []
    const out = [drive.root]
    let current = drive.root
    for (const id of path) {
      const next = current.children?.find((c) => c.id === id)
      if (!next) break
      out.push(next)
      current = next
    }
    return out
  }, [drive, path])

  const dir = trail.at(-1) ?? null
  const depth = trail.length - 1

  const { blocks, folded } = useMemo(() => {
    if (!drive || !dir) return { blocks: [] as Block[], folded: [] as string[] }

    const children = dir.children ?? []
    const items: TreemapItem[] = children.map((c) => ({ id: c.id, size: c.sizeBytes }))
    // Free space belongs to the drive as a whole, so it is only honest at the
    // top level; inside a directory the map is of that directory.
    const free = depth === 0 ? Math.max(0, drive.totalBytes - drive.root.sizeBytes) : 0
    if (free > 0) items.push({ id: FREE_ID, size: free })

    const aggregated = aggregateSmall(items, { aggregateId: OTHER_ID })
    const byId = new Map(children.map((c) => [c.id, c]))
    const laid = layoutTreemap(aggregated.items, { x: 0, y: 0, w: 100, h: 100 })

    return {
      folded: aggregated.folded,
      blocks: laid.map<Block>((b) => {
        const node = byId.get(b.id) ?? null
        return {
          id: b.id,
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
          size: b.size,
          node,
          name:
            b.id === FREE_ID
              ? 'Free space'
              : b.id === OTHER_ID
                ? `${aggregated.folded.length} smaller items`
                : (node?.name ?? b.id),
          category:
            b.id === FREE_ID ? 'free' : b.id === OTHER_ID ? 'other' : node ? categoryOf(node, trail) : 'data',
        }
      }),
    }
  }, [drive, dir, depth, trail])

  const blocksKey = blocks.map((b) => b.id).join('|')
  const selected = blocks.find((b) => b.id === selectedId) ?? null

  // Focus is claimed only when the *set* of blocks changes — a drill, an
  // ascent, a drive switch, or the refetch after a delete. Deferring to the
  // engine's removal auto-restore instead would work, but it is debounced by
  // design, so the highlight would blink out for a frame after every delete.
  useEffect(() => {
    const want = pendingFocus.current
    if (want === undefined) return
    pendingFocus.current = undefined
    const map = mapRef.current
    if (!map) return
    const target =
      (want ? map.querySelector<HTMLElement>(`[data-node-id="${want}"]`) : null) ??
      map.querySelector<HTMLElement>('[data-testid="tm-block"]')
    if (target) nav.focus(target)
  }, [blocksKey, nav])

  const descend = (node: FsNode) => {
    if (!node.children?.length) return
    pendingFocus.current = null
    setSelectedId(null)
    setPath([...trail.slice(1).map((n) => n.id), node.id])
  }

  const ascend = () => {
    if (depth === 0) return
    const leaving = dir?.id ?? null
    pendingFocus.current = leaving
    setSelectedId(leaving)
    setPath(trail.slice(1, -1).map((n) => n.id))
  }

  const goToCrumb = (index: number) => {
    if (index >= depth) return
    pendingFocus.current = trail[index + 1]?.id ?? null
    setSelectedId(trail[index + 1]?.id ?? null)
    setPath(trail.slice(1, index + 1).map((n) => n.id))
  }

  /**
   * B ascends while there is somewhere to ascend to. `preventDefault` marks
   * the intent handled for the engine; `stopPropagation` is the load-bearing
   * half — the shell listens for `spatial:back` on the document and pops the
   * view stack, and it has no way to know a descendant already consumed it.
   */
  useSpatialEvent(
    'spatial:back',
    (event) => {
      if (depth === 0) return
      event.preventDefault()
      event.stopPropagation()
      ascend()
    },
    rootEl,
  )

  const deleteMutation = useMutation({
    mutationFn: (input: { driveId: string; nodeId: string }) =>
      osMutations.deleteNode(input.driveId, input.nodeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: osQueries.drives().queryKey }),
  })

  const onDelete = async (node: FsNode) => {
    if (!drive) return
    const confirmed = await confirm({
      title: `Delete ${node.name}?`,
      message: `This frees ${formatBytes(node.sizeBytes)} on ${drive.label}. It cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!confirmed) return
    await deleteMutation.mutateAsync({ driveId: drive.id, nodeId: node.id })
    setSelectedId(null)
    pendingFocus.current = null
    notify(`Deleted ${node.name} — ${formatBytes(node.sizeBytes)} freed`)
  }

  const used = drive ? drive.root.sizeBytes : 0
  const capacity = drive?.totalBytes ?? 0
  /*
   * What the map's 100% actually represents. The seeded device overcommits
   * both drives (a "1 TB" internal holding 6 TB of games), so `used` can
   * exceed `capacity` — printing "588.3% of drive" would look like a bug in
   * the panel rather than in the data, and a share measured against the
   * mapped total is the number the block's area really encodes.
   */
  const mapped = Math.max(capacity, used)

  return (
    <div className="sv-root" data-testid="storage" ref={setRootEl}>
      <header className="sv-head">
        <div className="sv-drives" data-spatial-container="remember" data-testid="storage-drives">
          {drives.map((d) => (
            <button
              key={d.id}
              type="button"
              className="sv-drive"
              data-testid="storage-drive"
              data-drive-id={d.id}
              aria-pressed={d.id === drive?.id}
              onClick={() => {
                if (d.id === drive?.id) return
                pendingFocus.current = null
                setDriveId(d.id)
                setPath([])
                setSelectedId(null)
              }}
            >
              <strong>{d.label}</strong>
              <small data-testid="storage-drive-free">
                {d.root.sizeBytes >= d.totalBytes
                  ? `Over capacity · ${formatBytes(d.root.sizeBytes)} stored`
                  : `${formatBytes(d.totalBytes - d.root.sizeBytes)} free of ${formatBytes(d.totalBytes)}`}
              </small>
            </button>
          ))}
        </div>

        <nav className="sv-crumbs" data-spatial-container="remember" data-testid="storage-crumbs">
          {trail.map((node, i) => (
            <button
              key={node.id}
              type="button"
              className="sv-crumb"
              data-testid="storage-crumb"
              data-node-id={node.id}
              aria-current={i === depth ? 'true' : undefined}
              onClick={() => goToCrumb(i)}
            >
              {i === 0 ? (drive?.label ?? '/') : node.name}
            </button>
          ))}
        </nav>
      </header>

      <div className="sv-body">
        <div
          className="sv-map"
          ref={mapRef}
          data-spatial-container="remember"
          data-testid="storage-map"
          role="group"
          aria-label={`Contents of ${dir?.name ?? 'drive'}`}
        >
          {blocks.map((block, i) => (
            <button
              key={block.id}
              type="button"
              className="sv-block"
              data-testid="tm-block"
              data-node-id={block.id}
              data-category={block.category}
              data-selected={block.id === selectedId ? '' : undefined}
              /*
               * Positioned by all four edges rather than offset + size. Two
               * blocks that end at the same place then carry the *same*
               * percentage measured from the same reference, so their computed
               * right edges agree exactly. With `left + width` they do not:
               * 55.5556% + 44.4444% and 72.8571% + 27.1429% of the same box
               * differ by ~1e-13, and the engine's direction test has no
               * tolerance — that sliver is enough to classify the block merely
               * *below* this one as "further right", which then wins the move
               * that should have left the map for the detail panel.
               */
              style={
                {
                  left: pct(block.x),
                  top: pct(block.y),
                  right: pct(100 - (block.x + block.w)),
                  bottom: pct(100 - (block.y + block.h)),
                  '--i': i,
                } as CSSProperties
              }
              aria-label={`${block.name}, ${formatBytes(block.size)}`}
              {...(i === 0 ? { 'data-spatial-autofocus': '' } : {})}
              onFocus={() => setSelectedId(block.id)}
              onClick={() => {
                if (!block.node) return
                if (block.node.children?.length) descend(block.node)
                // A leaf has nowhere to descend to, so A opens its details —
                // the same sheet the Files view opens, from the same payload.
                else if (drive) {
                  useShell.getState().openSheet({
                    id: `file-${block.node.id}`,
                    title: block.node.name,
                    body: 'file-details',
                    payload: { driveId: drive.id, nodeId: block.node.id },
                  })
                }
              }}
            >
              {block.w >= 9 && block.h >= 7 ? (
                <span className="sv-block-label">
                  <span className="sv-block-name">{block.name}</span>
                  {block.w >= 14 && block.h >= 11 ? (
                    <span className="sv-block-size">{formatBytes(block.size)}</span>
                  ) : null}
                </span>
              ) : null}
            </button>
          ))}
          {drivesQuery.isPending ? <p className="sv-empty os-dim">Reading disk…</p> : null}
          {!drivesQuery.isPending && blocks.length === 0 ? (
            <p className="sv-empty os-dim">Nothing here.</p>
          ) : null}
        </div>

        <aside
          className="sv-panel"
          data-spatial-container="remember"
          data-testid="storage-panel"
          aria-label="Selection details"
        >
          <p className="sv-panel-kicker">
            {selected ? (selected.node ? (selected.node.kind === 'dir' ? 'Folder' : 'File') : 'Region') : 'Drive'}
          </p>
          <h2 className="sv-panel-name" data-testid="storage-panel-name">
            {selected?.name ?? drive?.label ?? '—'}
          </h2>
          <dl className="sv-panel-facts">
            <div>
              <dt>Size</dt>
              <dd data-testid="storage-panel-size">{formatBytes(selected?.size ?? used)}</dd>
            </div>
            <div>
              <dt>Share of drive</dt>
              <dd>{mapped > 0 ? `${(((selected?.size ?? used) / mapped) * 100).toFixed(1)}%` : '—'}</dd>
            </div>
            {selected?.node ? (
              <div>
                <dt>Contains</dt>
                <dd>
                  {(() => {
                    const { files, dirs } = countDescendants(selected.node)
                    return files + dirs === 0 ? 'No children' : `${files} files · ${dirs} folders`
                  })()}
                </dd>
              </div>
            ) : null}
            {selected?.id === OTHER_ID ? (
              <div>
                <dt>Folded</dt>
                <dd>{folded.length} items below the visible threshold</dd>
              </div>
            ) : null}
          </dl>

          <div className="sv-panel-actions">
            {selected?.node?.children?.length ? (
              <OsButton testId="storage-open" onClick={() => selected.node && descend(selected.node)}>
                Open
              </OsButton>
            ) : null}
            <OsButton
              testId="storage-delete"
              variant="danger"
              disabled={!selected?.node}
              onClick={() => {
                if (selected?.node) void onDelete(selected.node)
              }}
            >
              Delete
            </OsButton>
            <OsButton
              testId="storage-browse"
              variant="ghost"
              onClick={() => drive && push({ id: 'files', driveId: drive.id })}
            >
              Browse files
            </OsButton>
          </div>

          <p className="sv-panel-hint os-dim">
            <kbd>A</kbd> open · <kbd>B</kbd> up a level
          </p>
        </aside>
      </div>
    </div>
  )
}
