/**
 * Tear sheet — the panel that slides up from the bottom for secondary detail
 * (game properties, the play queue, file info).
 *
 * Unlike the quick-access menu it is modal: you are acting *on* something, so
 * the screen behind should not be reachable. Radix supplies the trap and the
 * aria-hiding; the shell's `inert` on the stage is the second line.
 */
import * as Dialog from '@radix-ui/react-dialog'
import { useShell, type SheetSpec } from '../state/shell'
import { GamePropertiesSheet } from '../views/sheets/GamePropertiesSheet'
import { TrackQueueSheet } from '../views/sheets/TrackQueueSheet'
import { FileDetailsSheet } from '../views/sheets/FileDetailsSheet'
import { CompatDetailsSheet } from '../views/sheets/CompatDetailsSheet'

export function OverlaySheet({ spec }: { spec: SheetSpec }) {
  const closeOverlay = useShell((s) => s.closeOverlay)

  return (
    <Dialog.Root open onOpenChange={(open) => !open && closeOverlay()}>
      <Dialog.Portal>
        <Dialog.Overlay className="os-scrim" />
        <Dialog.Content
          className="os-sheet"
          data-testid="sheet"
          data-spatial-container="contain remember"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            const first = document.querySelector<HTMLElement>(
              '[data-testid="sheet"] [data-spatial-autofocus], [data-testid="sheet"] button',
            )
            first?.focus()
          }}
        >
          <header className="os-sheet-head">
            <Dialog.Title>{spec.title}</Dialog.Title>
            <button
              type="button"
              className="os-sheet-close"
              data-testid="sheet-close"
              onClick={closeOverlay}
            >
              Close
            </button>
          </header>
          <div className="os-sheet-body">
            {spec.body === 'game-properties' ? <GamePropertiesSheet spec={spec} /> : null}
            {spec.body === 'track-queue' ? <TrackQueueSheet /> : null}
            {spec.body === 'file-details' ? <FileDetailsSheet spec={spec} /> : null}
            {spec.body === 'compat-details' ? <CompatDetailsSheet spec={spec} /> : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
