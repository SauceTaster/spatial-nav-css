/**
 * Ark UI 5.38 (Zag state machines) under directional navigation.
 *
 * Ark's model is different in two ways that matter here: every overlay is
 * portaled through an explicit `Portal` + `Positioner` pair, and every
 * collection is driven by `aria-activedescendant` rather than roving DOM
 * focus. The per-widget notes below record the consequences:
 *
 *   Switch    focus lands on the visually hidden `<input>`, not the control
 *   Tabs      `data-focusable` per trigger; inactive panels stay mounted
 *   Menu      `data-focusable` per item + `contain` on the positioner
 *   Select    the same, and Ark's highlight does not follow spatial focus
 *   Dialog    `contain` on the positioner + an app-owned entry target
 */
import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '@ark-ui/react/dialog'
import { Menu } from '@ark-ui/react/menu'
import { Portal } from '@ark-ui/react/portal'
import { Select, createListCollection } from '@ark-ui/react/select'
import { Switch } from '@ark-ui/react/switch'
import { Tabs } from '@ark-ui/react/tabs'
import { useSpatialEvent } from 'spatial-nav-css/react'
import { usePanelEntry, usePanelKeys } from './entry'
import { useSetAccess, type HalfProps } from './api'

const ACTIONS = [
  { id: 'pin', label: 'Reset PIN' },
  { id: 'devices', label: 'Sign out devices' },
]

export function ArkHalf({ users, pending, onLog }: HalfProps) {
  const [selected, setSelected] = useState('')
  const [remote, setRemote] = useState(true)
  const [tab, setTab] = useState('access')
  const [confirming, setConfirming] = useState(false)
  const access = useSetAccess()

  useEffect(() => {
    if (!selected && users.length > 0) setSelected(users[0]!.id)
  }, [selected, users])

  const current = users.find((user) => user.id === selected)

  return (
    <section className="hl-half" data-testid="ark-half">
      <header className="hl-half-head">
        <h2>Ark UI</h2>
        <p className="hl-note">
          Zag state machines. Every overlay is an explicit <code>Portal</code> +{' '}
          <code>Positioner</code>, and collections highlight with{' '}
          <code>aria-activedescendant</code>.
        </p>
      </header>

      <div className="hl-row">
        {/*
          SWITCH — reachable, but the focus target is not the thing you see.
          `Switch.Root` is a `<label>`; the only focusable node is
          `Switch.HiddenInput`, a real checkbox that the recommended styling
          hides visually. The engine focuses it and the focus ring lands on a
          1px sr-only box, so the ring has to be projected onto the control
          with `:has([data-spatial-focused])` (see headless.css).

          Hiding that input with `display:none` or `visibility:hidden` instead
          of the sr-only pattern removes the switch from navigation entirely —
          the default visibility filter is doing exactly what it should.
        */}
        <Switch.Root
          checked={remote}
          onCheckedChange={(details) => {
            setRemote(details.checked)
            onLog(`Ark UI · remote streaming ${details.checked ? 'on' : 'off'}`)
          }}
          className="hl-ark-switch"
          data-testid="ark-switch"
        >
          <Switch.Control className="hl-switch-track">
            <Switch.Thumb className="hl-switch-knob" />
          </Switch.Control>
          <Switch.Label className="hl-switch-text">Remote streaming</Switch.Label>
          <Switch.HiddenInput className="hl-sr" data-testid="ark-switch-input" />
        </Switch.Root>

        <ArkProfileSelect
          users={users}
          pending={pending}
          value={selected}
          onChange={(next) => {
            setSelected(next)
            onLog(`Ark UI · profile ${users.find((u) => u.id === next)?.name ?? next}`)
          }}
        />

        <ArkActionsMenu onAction={(label) => onLog(`Ark UI · ${label}`)} />

        <button
          type="button"
          className="hl-btn hl-btn-danger"
          data-testid="ark-dialog-trigger"
          onClick={() => setConfirming(true)}
        >
          Revoke access…
        </button>
      </div>

      {/*
        TABS — roving tabindex like Headless UI, with one extra hazard.
        Triggers are real `<button role="tab">` with `tabindex` 0 on the
        selected one and -1 on the rest, so `data-focusable` is again what
        makes every tab a stop.

        Landing on a trigger is not enough to switch the panel, in either
        library. Zag's `activationMode="automatic"` is consulted only inside
        its own ARROW_PREV/ARROW_NEXT handling — a real arrow keydown on the
        tablist; a plain `TAB_FOCUS` sets the focused tab and nothing else. So
        a spatial move highlights the tab and `nav.activate()` (Enter, or the
        controller's A) commits it. That is the honest model for a remote
        anyway: nobody wants the panel swapping as focus passes over.

        Unlike Headless UI — which swaps the closed panel for an empty
        `<span aria-hidden="true">` — Ark keeps *both* panels mounted and hides
        the inactive one with the `hidden` attribute. `Tabs.Content` takes no
        `lazyMount`/`unmountOnExit`, so there is no way to opt out. The engine
        excludes `[hidden]` subtrees in its semantic reachability check, which
        a custom `visibilityFilter` cannot replace, so the closed panel's
        button never becomes a candidate; it is a DOM-size cost, not a
        navigation one. Pinned in headless.test.tsx.
      */}
      <Tabs.Root
        value={tab}
        onValueChange={(details) => setTab(details.value)}
        className="hl-tabs"
      >
        <Tabs.List className="hl-tablist" data-spatial-container="remember" data-testid="ark-tablist">
          <Tabs.Trigger value="access" className="hl-tab" data-testid="ark-tab" data-focusable>
            Access
          </Tabs.Trigger>
          <Tabs.Trigger value="activity" className="hl-tab" data-testid="ark-tab" data-focusable>
            Activity
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content
          value="access"
          className="hl-panel"
          data-testid="ark-panel"
          data-spatial-container="remember"
        >
          <p className="hl-muted">
            {current ? `${current.name} · ${current.role}` : 'No profile selected'}
          </p>
          <button type="button" className="hl-btn" data-testid="ark-panel-access">
            Manage devices
          </button>
        </Tabs.Content>
        <Tabs.Content
          value="activity"
          className="hl-panel"
          data-testid="ark-panel"
          data-spatial-container="remember"
        >
          <p className="hl-muted">Last seen {current?.lastSeen ?? '—'}</p>
          <button type="button" className="hl-btn" data-testid="ark-panel-activity">
            Export history
          </button>
        </Tabs.Content>
      </Tabs.Root>

      <ArkConfirmDialog
        open={confirming}
        name={current?.name ?? 'this profile'}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          if (current) access.mutate({ id: current.id, active: !current.active })
          onLog(`Ark UI · access revoked for ${current?.name ?? 'profile'}`)
          setConfirming(false)
        }}
      />
    </section>
  )
}

/**
 * SELECT — the query-driven widget on this side.
 *
 * 1. Options are `<div role="option">` with no tabindex at all, so they are
 *    not focus stops in any sense until `data-focusable` opts them in (the
 *    engine then assigns the `tabindex="-1"` that lets them hold focus).
 * 2. Focus sticks: Zag does not pull DOM focus back to the content element,
 *    so the engine keeps the row it focused. What does *not* follow is Zag's
 *    own highlight — `aria-activedescendant` and `data-highlighted` are driven
 *    by pointer and key events, not by `focus`, so an option focused
 *    spatially is never marked highlighted. Style from `[data-spatial-focused]`
 *    and treat `data-highlighted` as pointer/keyboard-only. Pinned below.
 * 3. Activation still commits the value: `nav.activate()` focuses then clicks,
 *    and Zag's item click handler selects and closes.
 * 4. `lazyMount` + `unmountOnExit` keep the closed list out of the document
 *    entirely. Without them Ark leaves the whole portal mounted under
 *    `hidden` — navigable to nothing, but a permanent DOM cost that grows
 *    with the collection.
 * 5. `contain` goes on `Select.Positioner`, not on the content: containment is
 *    read from a focused element's ancestors, and Zag focuses the *content*
 *    element on open. A marker on the content would not contain that state.
 * 6. Entry and panel keys are app-owned exactly as on the Headless UI side —
 *    `usePanelEntry` / `usePanelKeys` in entry.tsx. Zag consumes
 *    ArrowUp/ArrowDown/Enter to drive its highlight without moving DOM focus,
 *    so an un-arbitrated Enter commits the highlighted row rather than the
 *    focused one.
 */
function ArkProfileSelect({
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
  const [open, setOpen] = useState(false)
  const collection = useMemo(
    () => createListCollection({ items: users.map((user) => ({ label: user.name, value: user.id })) }),
    [users],
  )
  const enter = usePanelEntry('[data-testid="ark-option"]')
  const keys = usePanelKeys()
  // Zag closes on a real Escape keydown, which a controller never produces.
  useSpatialEvent('spatial:back', (event) => {
    if (!open) return
    event.preventDefault()
    setOpen(false)
  })

  return (
    <Select.Root
      collection={collection}
      value={value ? [value] : []}
      onValueChange={(details) => onChange(details.value[0] ?? '')}
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      lazyMount
      unmountOnExit
      positioning={{ sameWidth: false }}
    >
      <Select.Control>
        <Select.Trigger className="hl-btn" data-testid="ark-select-trigger">
          <Select.ValueText placeholder={pending ? 'Loading…' : 'Profile'} />
        </Select.Trigger>
      </Select.Control>
      <Portal>
        <Select.Positioner data-spatial-container="contain">
          <Select.Content
            className="hl-popover"
            data-testid="ark-select"
            onFocus={enter}
            onKeyDownCapture={keys}
          >
            {collection.items.map((item) => (
              <Select.Item
                key={item.value}
                item={item}
                className="hl-option"
                data-testid="ark-option"
                data-user={item.value}
                data-focusable
              >
                <Select.ItemText>{item.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  )
}

/**
 * MENU — same three requirements as the select, plus two of its own.
 *
 * 1. Zag's menu is not modal, so nothing outside it is hidden or inerted while
 *    it is open: `contain` on the positioner is the *only* thing keeping a
 *    direction press from walking out onto the page behind it. That is the
 *    opposite of the dialog below, where Ark aria-hides the world.
 * 2. Selection is read from the *highlighted* item, not the clicked one.
 *    Zag's `invokeOnSelect` does `context.get("highlightedValue")` and returns
 *    early when it is null, so a click on an item that was never highlighted
 *    closes the menu and selects nothing — and if some other item happens to
 *    be highlighted, it fires `onSelect` for that one instead. Spatial focus
 *    never sets the highlight (it is a pointer/keyboard channel), so the app
 *    has to bridge it: `highlightedValue` is controlled here and each item's
 *    `onFocus` pushes its value in. Without this the whole menu is inert to a
 *    controller. Pinned in headless.test.tsx.
 *
 * `nav.activate()` opens it (a synthetic click reaches Zag's trigger handler),
 * selecting an item closes it and Zag restores focus to the trigger. Escape is
 * a real keydown only, so `spatial:back` is bridged by the app.
 */
function ArkActionsMenu({ onAction }: { onAction: (label: string) => void }) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const enter = usePanelEntry('[data-testid="ark-menu-item"]')
  const keys = usePanelKeys()
  useSpatialEvent('spatial:back', (event) => {
    if (!open) return
    event.preventDefault()
    setOpen(false)
  })

  return (
    <Menu.Root
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      highlightedValue={highlighted}
      onHighlightChange={(details) => setHighlighted(details.highlightedValue)}
      onSelect={(details) => {
        onAction(ACTIONS.find((action) => action.id === details.value)?.label ?? details.value)
      }}
      lazyMount
      unmountOnExit
    >
      <Menu.Trigger className="hl-btn" data-testid="ark-menu-trigger">
        Actions
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner data-spatial-container="contain">
          <Menu.Content
            className="hl-popover"
            data-testid="ark-menu"
            onFocus={enter}
            onKeyDownCapture={keys}
          >
            {ACTIONS.map((action) => (
              <Menu.Item
                key={action.id}
                value={action.id}
                className="hl-option"
                data-testid="ark-menu-item"
                data-action={action.id}
                data-focusable
                onFocus={() => setHighlighted(action.id)}
              >
                {action.label}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  )
}

/**
 * DIALOG — modal, portaled, and not a native `<dialog>`.
 *
 * 1. No top layer to detect. `Dialog.Content` is a portaled
 *    `<div role="dialog" aria-modal="true" tabindex="-1">`, so the engine's
 *    `dialog:modal` handling never applies.
 * 2. Ark's modal mode does aria-hide the world: opening sets
 *    `aria-hidden="true"` on every sibling subtree of the portal, which the
 *    engine's semantic reachability check drops. `contain` is declared as
 *    well — on `Dialog.Positioner`, the one ancestor of whatever Zag focuses,
 *    which is what makes the guarantee this app's own rather than Zag's.
 * 3. Entry needs a fallback. In a browser Zag's focus trap lands on the first
 *    tabbable child — a real button, so the engine adopts it and all is well.
 *    Where it cannot find one it focuses `Dialog.Content` itself, which is
 *    `tabindex="-1"`: an explicit "not a stop" to the engine, leaving
 *    `nav.getFocused()` null and the first direction press with no origin.
 *    (That is the path a layout-free test DOM takes, and Zag's `initialFocusEl`
 *    did not change it.) The content therefore carries the same `onFocus`
 *    redirect as the popovers, which is a no-op in the common case.
 * 4. Restore is Zag's: closing re-focuses the trigger, adopted through
 *    `focusin`. `spatial:back` is bridged because Escape needs a real keydown.
 */
function ArkConfirmDialog({
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
  const enter = usePanelEntry('[data-testid="ark-dialog-confirm"]')
  useSpatialEvent('spatial:back', (event) => {
    if (!open) return
    event.preventDefault()
    onClose()
  })

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open) onClose()
      }}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop className="hl-backdrop" />
        <Dialog.Positioner className="hl-modal-wrap" data-spatial-container="contain remember">
          <Dialog.Content className="hl-dialog" data-testid="ark-dialog" onFocus={enter}>
            <Dialog.Title className="hl-dialog-title">Revoke access?</Dialog.Title>
            <Dialog.Description className="hl-muted">
              {name} loses streaming access on every device. Downloads already on a device stay
              playable until they expire.
            </Dialog.Description>
            <div className="hl-dialog-actions">
              <Dialog.CloseTrigger className="hl-btn" data-testid="ark-dialog-cancel">
                Cancel
              </Dialog.CloseTrigger>
              <button
                type="button"
                className="hl-btn hl-btn-danger"
                data-testid="ark-dialog-confirm"
                onClick={onConfirm}
              >
                Revoke
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
