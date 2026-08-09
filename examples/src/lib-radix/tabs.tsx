/**
 * Radix Tabs — a roving tabindex in the normal tree (no portal).
 *
 * INTEGRATION REQUIREMENTS
 *
 * 1. Pick a model for the tablist and commit to it. Out of the box Radix makes
 *    the whole list one stop: the `role="tablist"` div is `tabindex="0"` and
 *    every trigger is `tabindex="-1"` until it becomes the roving stop. That
 *    is the React Aria pattern the library already documents — fine for a
 *    keyboard, useless for a controller, because a semantic direction intent
 *    never reaches Radix's arrow-key handler and so can never change tab.
 *
 * 2. This example takes the other option: `data-focusable` on each trigger, so
 *    every tab is its own spatial stop and left/right walk the list from any
 *    input source. Radix's automatic activation runs on `focus`, so landing on
 *    a trigger selects it — one press, panel swapped, no bridge code.
 *
 * 3. The tablist stays a container. Marked `remember` so coming back up from
 *    the panel returns to the tab you were on rather than the geometric
 *    nearest.
 *
 * 4. `TabsContent` is hardcoded `tabindex="0"`, even when the panel contains
 *    focusable children — where APG asks for no tab stop at all. The engine
 *    sees the same element, so every tab change costs an extra press on the
 *    way down into the panel. `tabIndex={-1}` is spread after Radix's own
 *    value and removes the redundant stop without touching the roles.
 *
 * 5. Inactive panels stay mounted and carry `hidden`, which the default
 *    `visibilityFilter` already excludes — a custom filter must keep that
 *    exclusion or focus can land in a closed panel. "The panel" is therefore
 *    `[data-testid="panel"]:not([hidden])`, and any `display` rule on the panel
 *    class has to restate `[hidden] { display: none }` (see radix.css).
 */
import * as Tabs from '@radix-ui/react-tabs'
import type { ReactNode } from 'react'

export interface TabSpec {
  id: string
  label: string
  content: ReactNode
}

export function SettingsTabs({
  tabs,
  value,
  onValueChange,
}: {
  tabs: TabSpec[]
  value: string
  onValueChange: (next: string) => void
}) {
  return (
    <Tabs.Root className="rx-tabs" value={value} onValueChange={onValueChange}>
      <Tabs.List
        className="rx-tablist"
        data-testid="tablist"
        data-spatial-container="remember"
        aria-label="Settings sections"
      >
        {tabs.map((tab) => (
          <Tabs.Trigger
            key={tab.id}
            value={tab.id}
            className="rx-tab"
            data-testid="tab"
            data-tab={tab.id}
            data-focusable
          >
            {tab.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {tabs.map((tab) => (
        <Tabs.Content
          key={tab.id}
          value={tab.id}
          className="rx-panel"
          data-testid="panel"
          data-panel={tab.id}
          data-spatial-container="remember"
          tabIndex={-1}
        >
          {tab.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  )
}
