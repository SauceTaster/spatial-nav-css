/**
 * Headless UI 2.2 under directional navigation.
 *
 * Headless UI brings a focus manager per component and a portal it opens only
 * when asked. The per-widget notes below record what each primitive needs; the
 * short version:
 *
 *   Switch    nothing — a real `<button role="switch">` in the normal tree
 *   Tabs      `data-focusable` per trigger, or only the roving tab is a stop
 *   Menu      `data-focusable` per item + `contain` + app-owned entry
 *   Listbox   the same three, and it is the one that reads query data
 *   Dialog    `contain` on the dialog root + an entry target inside the panel
 */
import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Switch,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from '@headlessui/react'
import { useSpatialEvent } from 'spatial-nav-css/react'
import { usePanelEntry, usePanelKeys } from './entry'
import { useSetAccess, type HalfProps } from './api'

const ACTIONS = [
  { id: 'pin', label: 'Reset PIN' },
  { id: 'devices', label: 'Sign out devices' },
]

export function HeadlessUiHalf({ users, pending, onLog }: HalfProps) {
  const [selected, setSelected] = useState('')
  const [remote, setRemote] = useState(true)
  const [tab, setTab] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const access = useSetAccess()

  useEffect(() => {
    if (!selected && users.length > 0) setSelected(users[0]!.id)
  }, [selected, users])

  const current = users.find((user) => user.id === selected)

  return (
    <section className="hl-half" data-testid="hui-half">
      <header className="hl-half-head">
        <h2>Headless UI</h2>
        <p className="hl-note">
          One focus manager per component. Popups render inline unless{' '}
          <code>anchor</code>/<code>portal</code> asks for a portal; the dialog always portals.
        </p>
      </header>

      <div className="hl-row">
        {/*
          SWITCH — zero integration cost.
          Renders `<button role="switch" tabindex="0">` in the normal tree, so
          the default focusable selector already matches it and there is no
          arrow-key handler to collide with. `nav.activate()` clicks it and the
          checked state flips. The only note is styling: React rewrites
          className on every render, so the focus ring is keyed off the
          engine's `[data-spatial-focused]` attribute (see headless.css).
        */}
        <Switch
          checked={remote}
          onChange={(next) => {
            setRemote(next)
            onLog(`Headless UI · remote streaming ${next ? 'on' : 'off'}`)
          }}
          className="hl-switch"
          data-testid="hui-switch"
        >
          <span className="hl-switch-thumb" />
          <span className="hl-switch-text">Remote streaming</span>
        </Switch>

        <HuiProfileListbox
          users={users}
          pending={pending}
          value={selected}
          onChange={(next) => {
            setSelected(next)
            onLog(`Headless UI · profile ${users.find((u) => u.id === next)?.name ?? next}`)
          }}
        />

        <HuiActionsMenu onAction={(label) => onLog(`Headless UI · ${label}`)} />

        <button
          type="button"
          className="hl-btn hl-btn-danger"
          data-testid="hui-dialog-trigger"
          onClick={() => setConfirming(true)}
        >
          Revoke access…
        </button>
      </div>

      {/*
        TABS — a roving tabindex, no portal.
        Out of the box only the selected trigger is tabbable (`tabindex="0"`,
        the rest `-1`), so the engine sees the tablist as a single stop and a
        controller can never reach the other tabs. `data-focusable` makes each
        trigger its own stop.

        Focus alone does not switch the panel: Headless UI's automatic
        activation lives inside its own arrow-key handler, so a spatial move
        highlights the tab and `nav.activate()` commits it. Ark behaves the
        same way for the same reason — see ark.tsx.

        Keyboard arrows are not double-handled, and here they need no
        arbitration: Headless UI consumes its own ArrowLeft/ArrowRight (the
        adapter skips consumed events) and moves *real DOM focus* to the next
        trigger, which the engine adopts through `focusin` — both mechanisms
        end on the same element. A keyboard arrow therefore also selects, while
        a semantic direction intent only moves; the popups below are the case
        where that difference does need arbitrating.

        The inactive panel is replaced by an empty `<span aria-hidden="true">`,
        so nothing inside it is reachable while it is closed. No marker needed.
      */}
      <TabGroup selectedIndex={tab} onChange={setTab}>
        <TabList className="hl-tablist" data-spatial-container="remember" data-testid="hui-tablist">
          <Tab className="hl-tab" data-testid="hui-tab" data-focusable>
            Access
          </Tab>
          <Tab className="hl-tab" data-testid="hui-tab" data-focusable>
            Activity
          </Tab>
        </TabList>
        <TabPanels>
          <TabPanel className="hl-panel" data-testid="hui-panel" data-spatial-container="remember">
            <p className="hl-muted">
              {current ? `${current.name} · ${current.role}` : 'No profile selected'}
            </p>
            <button type="button" className="hl-btn" data-testid="hui-panel-access">
              Manage devices
            </button>
          </TabPanel>
          <TabPanel className="hl-panel" data-testid="hui-panel" data-spatial-container="remember">
            <p className="hl-muted">Last seen {current?.lastSeen ?? '—'}</p>
            <button type="button" className="hl-btn" data-testid="hui-panel-activity">
              Export history
            </button>
          </TabPanel>
        </TabPanels>
      </TabGroup>

      <HuiConfirmDialog
        open={confirming}
        name={current?.name ?? 'this profile'}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          if (current) access.mutate({ id: current.id, active: !current.active })
          onLog(`Headless UI · access revoked for ${current?.name ?? 'profile'}`)
          setConfirming(false)
        }}
      />
    </section>
  )
}

/**
 * LISTBOX — the query-driven widget.
 *
 * 1. Options are `<div role="option" tabindex="-1">`. An explicit negative
 *    tabindex is the engine's "not a stop" opt-out, so without
 *    `data-focusable` the whole list is one stop and only Headless UI's own
 *    ArrowUp/ArrowDown can move inside it — keyboard-only, never a controller.
 * 2. With `data-focusable` the composition is excellent: Headless UI's option
 *    `onFocus` syncs `aria-activedescendant` to whatever the engine focused,
 *    so its active-option state and spatial focus stay the same row.
 * 3. `anchor` positions the panel *and* forces the portal, so the open list
 *    lives under `document.body`, outside this subtree. It is still inside the
 *    document-rooted engine, hence `contain`.
 * 4. Entry is app-owned — see entry.tsx. The panel itself takes focus first,
 *    and `contain` on the panel does not contain the panel (containment is
 *    read from ancestors), so leaving focus there would let a direction press
 *    walk straight back onto the page.
 * 5. Panel keys are app-arbitrated — `usePanelKeys`, also in entry.tsx.
 *    Headless UI consumes ArrowUp/ArrowDown/Enter to drive its *highlight*
 *    without moving DOM focus, so with every option a spatial stop the ring
 *    and the highlight would drift apart on keyboard input alone.
 * 6. `spatial:back` is *not* bridged here, unlike the menu and the dialog:
 *    `Listbox`'s render-prop slot exposes `open` but no `close`, so closing on
 *    a controller's B means taking full control of the open state. Escape
 *    still closes it through Headless UI's own handler.
 */
function HuiProfileListbox({
  users,
  pending,
  value,
  onChange,
}: {
  users: HalfProps['users']
  pending: boolean
  value: string
  onChange: (next: string) => void
}) {
  const label = users.find((user) => user.id === value)?.name ?? (pending ? 'Loading…' : 'Profile')
  const enter = usePanelEntry('[data-testid="hui-option"]')
  const keys = usePanelKeys()
  return (
    <Listbox value={value} onChange={onChange}>
      <ListboxButton className="hl-btn" data-testid="hui-listbox-trigger">
        {label}
      </ListboxButton>
      <ListboxOptions
        anchor="bottom start"
        className="hl-popover"
        data-testid="hui-listbox"
        data-spatial-container="contain"
        onFocus={enter}
        onKeyDownCapture={keys}
      >
        {users.map((user) => (
          <ListboxOption
            key={user.id}
            value={user.id}
            className="hl-option"
            data-testid="hui-option"
            data-user={user.id}
            data-focusable
          >
            {user.name}
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  )
}

/**
 * MENU — same shape as the listbox, with two extra notes.
 *
 * 1. Opening from the engine works without a bridge. `nav.activate()` calls
 *    `el.click()`, and Headless UI's toggle handler runs its open path for any
 *    click whose tracked pointer type was not a mouse — a synthetic click has
 *    no pointer type, so it opens.
 * 2. Headless UI's menu is modal by default: while it is open `useInertOthers`
 *    marks everything outside it `aria-hidden="true"` and `inert`, and the
 *    engine's semantic reachability check drops both. That check is not the
 *    replaceable `visibilityFilter`, so a custom filter cannot lose it.
 *    `contain` is still declared, because it keeps this component's guarantee
 *    local rather than dependent on Headless UI's inert bookkeeping — and
 *    because `modal={false}` would remove the inerting entirely.
 * 3. Escape closes it from a real keydown; a gamepad B never produces one, so
 *    the app closes on `spatial:back`.
 * 4. Same entry and key arbitration as the listbox.
 */
function HuiActionsMenu({ onAction }: { onAction: (label: string) => void }) {
  const enter = usePanelEntry('[data-testid="hui-menu-item"]')
  const keys = usePanelKeys()
  return (
    <Menu>
      {({ open, close }) => (
        <>
          <MenuButton className="hl-btn" data-testid="hui-menu-trigger">
            Actions
          </MenuButton>
          <MenuItems
            anchor="bottom start"
            className="hl-popover"
            data-testid="hui-menu"
            data-spatial-container="contain"
            onFocus={enter}
            onKeyDownCapture={keys}
          >
            {ACTIONS.map((action) => (
              <MenuItem key={action.id}>
                <button
                  type="button"
                  className="hl-option"
                  data-testid="hui-menu-item"
                  data-action={action.id}
                  data-focusable
                  onClick={() => onAction(action.label)}
                >
                  {action.label}
                </button>
              </MenuItem>
            ))}
          </MenuItems>
          <HuiBackClose open={open} onClose={close} />
        </>
      )}
    </Menu>
  )
}

/** B / Escape / remote-back for a popup that only listens for real keydowns. */
function HuiBackClose({ open, onClose }: { open: boolean; onClose: () => void }) {
  useSpatialEvent('spatial:back', (event) => {
    if (!open) return
    event.preventDefault()
    onClose()
  })
  return null
}

/**
 * DIALOG — the highest-risk primitive here.
 *
 * 1. Nothing marks the top layer. The panel is a portaled `<div role="dialog"
 *    aria-modal="true">`, never `<dialog>.showModal()`, so the engine's
 *    `dialog:modal` special case does not apply and the page behind stays a
 *    geometric candidate unless something removes it.
 * 2. Headless UI does remove it — `useInertOthers` sets `aria-hidden="true"`
 *    and `inert` on everything outside the panel, and the engine's semantic
 *    reachability check drops both regardless of the `visibilityFilter` in
 *    force. `contain` on the dialog root is declared anyway: it is the marker
 *    that states the intent in this app's own DOM instead of relying on
 *    another library's bookkeeping. `remember` keeps re-entry sane.
 * 3. `contain` on the dialog root only covers elements *inside* it. Headless
 *    UI's own initial focus is the dialog root itself, which its own marker
 *    therefore does not contain — so the panel names an explicit entry target
 *    (`data-autofocus`, which Headless UI's focus trap honours) and the app
 *    confirms the move. Pinned in headless.test.tsx.
 * 4. Restore is Headless UI's: closing re-focuses the trigger and the engine
 *    adopts that through `focusin`. Do not also call `nav.focus()`.
 * 5. The portal is bracketed by two `data-headlessui-focus-guard` buttons.
 *    They are real focusable buttons carrying `aria-hidden="true"`; the
 *    default visibility filter drops them, a permissive one does not.
 */
function HuiConfirmDialog({
  open,
  name,
  onClose,
  onConfirm,
}: {
  open: boolean
  name: string
  onClose: () => void
  onConfirm: () => void
}) {
  useSpatialEvent('spatial:back', (event) => {
    if (!open) return
    event.preventDefault()
    onClose()
  })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="hl-modal"
      data-testid="hui-dialog"
      data-spatial-container="contain remember"
    >
      <DialogBackdrop className="hl-backdrop" />
      <div className="hl-modal-wrap">
        <DialogPanel className="hl-dialog" data-testid="hui-dialog-panel">
          <DialogTitle className="hl-dialog-title">Revoke access?</DialogTitle>
          <p className="hl-muted">
            {name} loses streaming access on every device. Downloads already on a device stay
            playable until they expire.
          </p>
          <div className="hl-dialog-actions">
            <button type="button" className="hl-btn" data-testid="hui-dialog-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="hl-btn hl-btn-danger"
              data-testid="hui-dialog-confirm"
              data-autofocus
              onClick={onConfirm}
            >
              Revoke
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
