/**
 * Headless component libraries, side by side.
 *
 * Two panels rendering the same screen — a media server's profile access
 * controls — one built from Headless UI, one from Ark UI, both driven by the
 * same TanStack Query data. Both libraries ship their own focus management and
 * their own portals, which is exactly where a spatial engine gets into
 * trouble, so each widget carries a note about what the integration needs.
 *
 * The comparison in one line: Headless UI's collections adopt whatever the
 * engine focuses (its options sync `aria-activedescendant` from `focus`),
 * while Ark's collections keep highlight state on a channel the engine never
 * touches. Ark, in exchange, gives you a real `Positioner` element to hang
 * `contain` on, which Headless UI's portal does not.
 */
import { useState } from 'react'
import { useSpatialEvent } from 'spatial-nav-css/react'
import { useContentFocus } from '../shared/useContentFocus'
import { useMediaUsers } from './api'
import { ArkHalf } from './ark'
import { HeadlessUiHalf } from './headlessui'

export function App() {
  const [log, setLog] = useState('Arrow keys move · Enter activates · Escape or B closes overlays')
  const users = useMediaUsers()

  useSpatialEvent('spatial:nofocustarget', (event) => {
    setLog(`No target: ${event.detail.direction}`)
  })

  // Provider `autofocus` fires at start(), while both halves are still
  // placeholders; claim focus for the first real control once data lands.
  useContentFocus(!users.isPending, '[data-testid="hui-switch"]')

  const items = users.data?.items ?? []

  return (
    <div className="hl-root">
      <div className="hl-grid">
        <HeadlessUiHalf users={items} pending={users.isPending} onLog={setLog} />
        <ArkHalf users={items} pending={users.isPending} onLog={setLog} />
      </div>
      <footer className="hl-foot" data-testid="log">
        {log}
      </footer>
    </div>
  )
}
