/**
 * MUI Menu (Popover → Modal) — a portaled popup with its own keyboard
 * handling and roving focus.
 *
 * INTEGRATION REQUIREMENTS
 *
 * 1. `data-spatial-container="contain"` on the list slot. MUI's roving
 *    handler owns Up/Down (it calls `preventDefault()`, and the keyboard
 *    adapter skips consumed events) but leaves Left/Right untouched. The page
 *    behind is already out of reach — the Popover is a Modal, so MUI
 *    aria-hides it — but the popup's own wrapper is not: FocusTrap renders
 *    two `tabindex="0"` sentinel divs as siblings of the menu inside the
 *    modal root, and those are ordinary spatial candidates with a degenerate
 *    rect. `contain` on the list is what keeps navigation off them.
 *
 * 2. `data-focusable` on every MenuItem, for the same reason as the Tabs:
 *    MUI's roving tabindex leaves exactly one item at `tabindex="0"`, so a
 *    controller — which never reaches MUI's keydown handler — would see the
 *    whole menu as a single stop.
 *
 * 3. Opening from a controller needs nothing. The trigger is a real
 *    `<button>`, so the engine's activate path (a synthesized click) opens
 *    the menu exactly like a pointer would. Contrast with Select, which does
 *    not listen for click at all — see select.tsx.
 *
 * 4. Entry and restore are MUI's: MenuList focuses the first item on open,
 *    and the focus trap re-focuses the trigger when the menu unmounts. The
 *    engine adopts both moves through `focusin`; do not duplicate them.
 */
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useState } from 'react'
import { slotAttrs, useSpatialBack } from './spatial'
import type { MediaUser } from '../shared/api/db'

export type AccountAction = 'reset-password' | 'sign-out' | 'demote'

const ACTIONS: Array<{ id: AccountAction; label: string }> = [
  { id: 'reset-password', label: 'Send password reset' },
  { id: 'sign-out', label: 'Sign out all devices' },
  { id: 'demote', label: 'Reset to standard user' },
]

const listSlot = slotAttrs({ 'data-spatial-container': 'contain', 'data-testid': 'menu-list' })

export function AccountMenu({
  user,
  onAction,
}: {
  user: MediaUser
  onAction: (action: AccountAction) => void
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const open = anchor !== null
  const close = () => setAnchor(null)
  useSpatialBack(open, close)

  return (
    <>
      <IconButton
        aria-label={`Actions for ${user.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="menu-trigger"
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        ⋯
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={close}
        slotProps={{ list: listSlot }}
      >
        {ACTIONS.map((action) => (
          <MenuItem
            key={action.id}
            data-focusable
            data-testid="menu-item"
            onClick={() => {
              onAction(action.id)
              close()
            }}
          >
            {action.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
