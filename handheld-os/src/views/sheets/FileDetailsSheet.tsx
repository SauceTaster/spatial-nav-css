/**
 * File details — where a node lives, what it costs, and the one destructive
 * action in the storage flow.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { osMutations, osQueries } from '../../services/api'
import { formatBytes, type Drive, type FsNode } from '../../services/device'
import { useShell, type SheetSpec } from '../../state/shell'
import { OsButton } from '../../ui/controls'
import './sheets.css'

/** Payload values are `unknown`; a missing or wrong-typed id renders empty. */
const idFrom = (payload: Record<string, unknown> | undefined, key: string): string | null => {
  const value = payload?.[key]
  return typeof value === 'string' && value !== '' ? value : null
}

/** Root-to-node chain, so the sheet can show a real path rather than a name. */
function pathTo(node: FsNode, nodeId: string, trail: FsNode[] = []): FsNode[] | null {
  const here = [...trail, node]
  if (node.id === nodeId) return here
  for (const child of node.children ?? []) {
    const found = pathTo(child, nodeId, here)
    if (found) return found
  }
  return null
}

export function FileDetailsSheet({ spec }: { spec: SheetSpec }) {
  const driveId = idFrom(spec.payload, 'driveId')
  const nodeId = idFrom(spec.payload, 'nodeId')
  const drives = useQuery(osQueries.drives())
  const client = useQueryClient()
  const confirm = useShell((s) => s.confirm)
  const notify = useShell((s) => s.notify)
  const closeOverlay = useShell((s) => s.closeOverlay)

  const remove = useMutation({
    mutationFn: () => osMutations.deleteNode(driveId ?? '', nodeId ?? ''),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['drives'] })
      notify('Deleted.')
      closeOverlay()
    },
    onError: (error: Error) => notify(error.message),
  })

  if (!driveId || !nodeId) {
    return (
      <p className="os-dim" data-testid="sheet-empty">
        No file was passed to this sheet.
      </p>
    )
  }
  if (drives.isPending) return <p className="os-dim">Loading…</p>

  const drive: Drive | undefined = drives.data?.items.find((item) => item.id === driveId)
  const path = drive ? pathTo(drive.root, nodeId) : null
  const node = path?.at(-1)

  if (!drive || !node) {
    return (
      <p className="os-dim" data-testid="sheet-empty">
        That file is no longer on this device.
      </p>
    )
  }

  const displayPath = path
    ? path
        .map((entry) => entry.name)
        .join('/')
        .replace(/^\/+/, '/')
    : node.name

  const onDelete = async () => {
    const yes = await confirm({
      title: `Delete ${node.name}`,
      message:
        node.kind === 'dir'
          ? `Delete this folder and everything in it? That frees ${formatBytes(node.sizeBytes)}.`
          : `Delete this file? That frees ${formatBytes(node.sizeBytes)}.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (yes) remove.mutate()
  }

  return (
    <div className="sh-body" data-testid="sheet-file-details">
      <p className="sh-lede" data-testid="sheet-file-name">
        <strong>{node.name}</strong>
        <small className="os-dim">{drive.label}</small>
      </p>

      <dl className="sh-facts">
        <div className="sh-fact">
          <dt>Path</dt>
          <dd data-testid="sheet-file-path">{displayPath}</dd>
        </div>
        <div className="sh-fact">
          <dt>Kind</dt>
          <dd data-testid="sheet-file-kind">
            {node.kind === 'dir' ? 'Folder' : 'File'}
            {node.gameId ? ' · game install' : ''}
          </dd>
        </div>
        <div className="sh-fact">
          <dt>Size</dt>
          <dd data-testid="sheet-file-size">{formatBytes(node.sizeBytes)}</dd>
        </div>
        <div className="sh-fact">
          <dt>Contains</dt>
          <dd>{node.children ? `${node.children.length} items` : '—'}</dd>
        </div>
      </dl>

      <div className="sh-actions">
        <OsButton
          variant="danger"
          testId="sheet-file-delete"
          disabled={remove.isPending}
          onClick={() => void onDelete()}
        >
          {remove.isPending ? 'Deleting…' : 'Delete'}
        </OsButton>
      </div>
    </div>
  )
}
