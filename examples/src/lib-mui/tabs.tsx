/**
 * MUI Tabs — a roving-tabindex collection.
 *
 * INTEGRATION REQUIREMENTS
 *
 * 1. `data-focusable` on every Tab. MUI keeps one tab at `tabindex="0"` and
 *    every other at `tabindex="-1"`; the engine reads an explicit negative
 *    tabindex as "deliberately not a stop", so without the opt-in the entire
 *    tablist collapses to a single spatial stop and a controller can never
 *    reach the other tabs. `[data-focusable]` is the documented exception
 *    that keeps matching despite `tabindex="-1"` (src/core/dom.ts).
 *
 * 2. Nothing else — and specifically no keyboard wiring. MUI's roving handler
 *    consumes ArrowLeft/ArrowRight along the tablist axis and calls
 *    `preventDefault()`; the keyboard adapter bails on `defaultPrevented`, so
 *    the two never both move. Up/down is left alone and stays the engine's,
 *    which is how focus leaves the tablist for the panel.
 *
 * 3. Selection stays manual. MUI Tabs do not select on focus (no
 *    `selectionFollowsFocus`), and the engine's activate path synthesizes a
 *    real click, so Enter / gamepad A selects the focused tab — the ARIA
 *    manual-activation pattern, unchanged.
 *
 * 4. The panel is its own zone with `remember`, so leaving it for the tablist
 *    and coming back returns to the control you left.
 */
import Box from '@mui/material/Box'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import type { ReactNode } from 'react'

export interface TabSpec {
  id: string
  label: string
  content: ReactNode
}

export function SettingsTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: TabSpec[]
  value: string
  onChange: (next: string) => void
}) {
  const active = tabs.find((tab) => tab.id === value)
  return (
    <Box>
      <Tabs
        value={value}
        onChange={(_event, next: string) => onChange(next)}
        aria-label="Administration sections"
      >
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            value={tab.id}
            label={tab.label}
            id={`mui-tab-${tab.id}`}
            aria-controls={`mui-panel-${tab.id}`}
            data-focusable
            data-testid="tab"
          />
        ))}
      </Tabs>
      {active ? (
        <Box
          role="tabpanel"
          id={`mui-panel-${active.id}`}
          aria-labelledby={`mui-tab-${active.id}`}
          data-spatial-container="remember"
          data-testid="panel"
          sx={{ pt: 2 }}
        >
          {active.content}
        </Box>
      ) : null}
    </Box>
  )
}
