/**
 * MUI Dialog (Modal + FocusTrap, portaled to `document.body`) — the
 * highest-risk component on the page.
 *
 * INTEGRATION REQUIREMENTS
 *
 * 1. Nothing marks the top layer. MUI renders `role="dialog"
 *    aria-modal="true"` on a plain `<div>` inside a portal — never
 *    `<dialog>.showModal()`. The engine's `dialog:modal` special case
 *    (src/core/dom.ts) therefore does not apply, and the portal is still
 *    inside a document-rooted engine, so every control behind the overlay
 *    stays a geometric candidate unless something removes it.
 *
 * 2. What removes it is `aria-hidden`. `ModalManager` sets
 *    `aria-hidden="true"` on every child of `document.body` except the modal
 *    root, and the engine treats an `aria-hidden` subtree as unnavigable —
 *    unconditionally, not as part of the replaceable `visibilityFilter`. That
 *    is what keeps the page behind a MUI modal out of the search.
 *
 * 3. Do not lean on MUI's focus trap for it. `enforceFocus` only recovers
 *    focus that arrives through its tab sentinels; for focus that lands
 *    anywhere else it calls `.focus()` on `.MuiDialog-container`, a div with
 *    no tabindex, which is a no-op. The trap is not a backstop for
 *    directional navigation.
 *
 * 4. So also declare containment. `data-spatial-container="contain"` on the
 *    paper slot is the marker that does not depend on MUI's aria-hidden
 *    bookkeeping — MUI's Popper-based surfaces (Autocomplete, Tooltip) and
 *    any non-modal overlay never aria-hide the page at all. `remember` keeps
 *    re-entry sane while the dialog stays mounted.
 *
 * 5. Entry needs an explicit target. MUI's FocusTrap focuses its
 *    `[data-mui-focusable]` element, which is the Paper — `tabindex="-1"` and
 *    therefore not a spatial stop. The engine ends up with `getFocused() ===
 *    null` and, because DOM focus is no longer on `<body>`, `nav.claimFocus()`
 *    also refuses to act. `autoFocus` on the primary action fixes it in MUI's
 *    own vocabulary: React focuses it during commit, before the trap's effect
 *    runs, so the trap sees focus already inside and leaves it there.
 *
 * 6. KNOWN GAP — restore. MUI's FocusTrap does re-focus the trigger, but it
 *    does so the instant `open` flips, while the exit transition still has
 *    the whole page under `aria-hidden="true"`. The engine therefore cannot
 *    adopt that element: for the length of the transition the user has DOM
 *    focus on a control the engine considers unnavigable, and once the
 *    portal finally unmounts focus falls to `<body>` and the engine's
 *    auto-restore lands on the first focusable in the document instead of on
 *    the trigger. Restore it again from `onExited`, which runs after MUI has
 *    torn the overlay down. Pinned in mui.test.tsx.
 *
 * 7. Back/Escape. MUI closes on a real `Escape` keydown; a remote's BACK or a
 *    gamepad B never produces one, so the dialog listens for `spatial:back`.
 */
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import { useSpatialNavigation } from 'spatial-nav-css/react'
import { slotAttrs, useSpatialBack } from './spatial'
import type { RefObject } from 'react'

const paperSlot = slotAttrs({
  'data-spatial-container': 'contain remember',
  'data-testid': 'dialog',
})

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  restoreTo,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  body: string
  confirmLabel: string
  /** Control to hand spatial focus back to once the overlay is gone (see 6). */
  restoreTo: RefObject<HTMLElement | null>
}) {
  const nav = useSpatialNavigation()
  useSpatialBack(open, onClose)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="mui-confirm-title"
      aria-describedby="mui-confirm-body"
      slotProps={{
        paper: paperSlot,
        transition: {
          onExited: () => {
            if (restoreTo.current) nav.focus(restoreTo.current)
          },
        },
      }}
    >
      <DialogTitle id="mui-confirm-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText id="mui-confirm-body">{body}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="dialog-cancel">
          Cancel
        </Button>
        {/* autoFocus is the entry point (see 5) — without it the engine has
            nothing focused when the dialog opens. */}
        <Button
          autoFocus
          color="error"
          variant="contained"
          data-testid="dialog-confirm"
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
