/**
 * Radix Dialog (modal) — the highest-risk primitive.
 *
 * INTEGRATION REQUIREMENTS
 *
 * 1. Nothing marks the top layer. Radix renders the content into a portal at
 *    `document.body` and uses `role="dialog" aria-modal="true"` on a plain
 *    div — never `<dialog>.showModal()`. The engine's `dialog:modal` special
 *    case therefore does not apply, and the portal is still inside a
 *    document-rooted engine, so every background control remains a geometric
 *    candidate unless something removes it.
 *
 * 2. What actually saves it is `aria-hidden`. Radix's modal content calls
 *    `hideOthers()` (the `aria-hidden` package), which sets
 *    `aria-hidden="true"` on every sibling of the content's ancestor chain.
 *    The engine's DEFAULT `visibilityFilter` skips anything under
 *    `[aria-hidden="true"]`, so the background drops out of the candidate set.
 *    That protection is a side effect of a default an app is free to replace:
 *    any custom `visibilityFilter` (virtualized lists, test harnesses) silently
 *    re-exposes the whole page behind the overlay. Verified in radix.test.tsx.
 *
 * 3. So declare containment explicitly. `data-spatial-container="contain"` on
 *    the content is the only marker that blocks the directional search
 *    regardless of the visibility policy. `remember` keeps re-entry sane while
 *    the dialog stays mounted.
 *
 * 4. Entry and restore are Radix's. Its FocusScope focuses the first tabbable
 *    child on open and re-focuses the trigger on close (`onCloseAutoFocus`),
 *    and the engine adopts both moves through `focusin` — do not also call
 *    `nav.focus()`. Use `data-spatial-autofocus` only to pick a different
 *    entry, and pair it with `onOpenAutoFocus` so Radix agrees.
 *
 * 5. Back/Escape. Radix closes on Escape from a real `keydown`; a gamepad
 *    `spatial:back` intent never produces one, so the dialog listens for it.
 */
import * as Dialog from '@radix-ui/react-dialog'
import { useSpatialEvent } from 'spatial-nav-css/react'
import type { ReactNode } from 'react'

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  trigger,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  trigger: ReactNode
}) {
  // B / Escape / remote-back. Bound at the document because the portal is not
  // inside this component's DOM subtree.
  useSpatialEvent('spatial:back', (event) => {
    if (!open) return
    event.preventDefault()
    onOpenChange(false)
  })

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay" data-testid="dialog-overlay" />
        <Dialog.Content
          className="rx-dialog"
          data-testid="dialog"
          data-spatial-container="contain remember"
        >
          <Dialog.Title className="rx-dialog-title">{title}</Dialog.Title>
          <Dialog.Description className="rx-dialog-body">{body}</Dialog.Description>
          <div className="rx-dialog-actions">
            <Dialog.Close asChild>
              <button type="button" className="rx-btn" data-testid="dialog-cancel">
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              className="rx-btn rx-btn-danger"
              data-testid="dialog-confirm"
              onClick={() => {
                onConfirm()
                onOpenChange(false)
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
