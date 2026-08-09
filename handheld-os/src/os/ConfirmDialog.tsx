/**
 * Confirmation, on Radix Dialog.
 *
 * This is the one place a real focus trap earns its keep, so it is the one
 * place we take a dependency. Radix aria-hides the rest of the page, which the
 * engine honours unconditionally — containment here does not depend on our
 * own `contain` marker being right.
 *
 * Cancel is focused by default: on a handheld the activate button is often
 * still held from whatever opened this, and a destructive default would fire
 * on the carry-through.
 */
import * as Dialog from '@radix-ui/react-dialog'
import { useShell, type ConfirmSpec } from '../state/shell'
import { OsButton } from '../ui/controls'

export function ConfirmDialog({ spec }: { spec: ConfirmSpec }) {
  const closeOverlay = useShell((s) => s.closeOverlay)

  const settle = (confirmed: boolean) => {
    spec.resolve(confirmed)
    // closeOverlay resolves(false) for a dismissed confirm; we have already
    // settled the promise, so pop the overlay without going through it again.
    useShell.setState((s) => ({ overlays: s.overlays.filter((o) => o !== s.overlays.at(-1)) }))
    void closeOverlay
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && settle(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="os-scrim" />
        <Dialog.Content
          className="os-confirm"
          data-testid="confirm"
          data-spatial-container="contain remember"
          onOpenAutoFocus={(event) => {
            // Take entry ourselves so focus lands on a real spatial stop
            // rather than the content wrapper (which is tabindex="-1" and so
            // not navigable — the engine would report nothing focused).
            event.preventDefault()
            const cancel = document.querySelector<HTMLElement>('[data-testid="confirm-cancel"]')
            cancel?.focus()
          }}
        >
          <Dialog.Title className="os-confirm-title">{spec.title}</Dialog.Title>
          <Dialog.Description className="os-confirm-message">{spec.message}</Dialog.Description>
          <div className="os-confirm-actions">
            <OsButton testId="confirm-cancel" onClick={() => settle(false)}>
              Cancel
            </OsButton>
            <OsButton
              testId="confirm-ok"
              variant={spec.destructive ? 'danger' : 'primary'}
              onClick={() => settle(true)}
            >
              {spec.confirmLabel ?? 'Confirm'}
            </OsButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
