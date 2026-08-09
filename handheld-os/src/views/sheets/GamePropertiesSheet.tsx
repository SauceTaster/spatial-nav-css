/**
 * Game properties — launch options, compatibility layer, cloud saves.
 *
 * The sheet wrapper (`os/OverlaySheet`) already declares
 * `data-spatial-container="contain remember"`; this body must not add its own
 * containment or it would trap focus inside a subsection of the sheet.
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isEditable } from 'spatial-nav-css'
import { osQueries } from '../../services/api'
import { formatBytes, formatPlaytime } from '../../services/device'
import { useShell, type SheetSpec } from '../../state/shell'
import { OsButton, Stepper, Toggle } from '../../ui/controls'
import './sheets.css'

/** Payload values are `unknown`; a missing or wrong-typed id renders empty. */
const idFrom = (payload: Record<string, unknown> | undefined, key: string): string | null => {
  const value = payload?.[key]
  return typeof value === 'string' && value !== '' ? value : null
}

const COMPAT_LAYERS = [
  { value: 'default', label: 'Default (Proton 9)' },
  { value: 'proton-8', label: 'Proton 8' },
  { value: 'experimental', label: 'Proton Experimental' },
  { value: 'native', label: 'Native' },
]

export function GamePropertiesSheet({ spec }: { spec: SheetSpec }) {
  const gameId = idFrom(spec.payload, 'gameId')
  const notify = useShell((s) => s.notify)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [launchOptions, setLaunchOptions] = useState('')
  const [compatLayer, setCompatLayer] = useState('default')
  // The device API has no endpoint for per-game cloud saves yet, so this
  // overrides the seeded value for the session rather than pretending to save.
  const [cloudOverride, setCloudOverride] = useState<boolean | null>(null)

  const game = useQuery({ ...osQueries.game(gameId ?? ''), enabled: gameId !== null })

  // Reset the drafts when the sheet is re-used for a different game.
  useEffect(() => {
    setLaunchOptions('')
    setCompatLayer('default')
    setCloudOverride(null)
  }, [gameId])

  if (!gameId) return <SheetEmpty>No game was passed to this sheet.</SheetEmpty>
  if (game.isPending) return <p className="os-dim">Loading…</p>
  if (!game.data) return <SheetEmpty>That game is no longer on this device.</SheetEmpty>

  const cloudSave = cloudOverride ?? game.data.hasCloudSave

  return (
    <div
      className="sh-body"
      ref={bodyRef}
      data-testid="sheet-game-properties"
      onKeyDown={(event) => {
        // Same Escape delegation as the settings panel: with the field focused
        // the adapter ignores every mapped key, so B/Escape would otherwise not
        // even close the sheet.
        if (event.key !== 'Escape') return
        if (!isEditable(event.target)) return
        const exit = bodyRef.current?.querySelector<HTMLElement>('button')
        if (!exit) return
        event.preventDefault()
        exit.focus()
      }}
    >
      <p className="sh-lede" data-testid="sheet-game-title">
        <strong>{game.data.title}</strong>
        <small className="os-dim">
          {game.data.developer} · {formatBytes(game.data.sizeBytes)} ·{' '}
          {formatPlaytime(game.data.playedMinutes)}
        </small>
      </p>

      <label className="sh-field">
        <span className="sh-field-label">Launch options</span>
        <input
          className="sh-field-input"
          type="text"
          value={launchOptions}
          placeholder="%command%"
          data-testid="sheet-launch-options"
          onChange={(event) => setLaunchOptions(event.target.value)}
        />
        <small className="os-dim">Esc leaves the field.</small>
      </label>

      <Stepper
        label="Compatibility layer"
        value={compatLayer}
        options={COMPAT_LAYERS}
        onChange={setCompatLayer}
        testId="sheet-compat-layer"
      />

      <Toggle
        label="Keep saves in the cloud"
        checked={cloudSave}
        onChange={setCloudOverride}
        testId="sheet-cloud-save"
      />

      <div className="sh-actions">
        <OsButton
          testId="sheet-verify"
          onClick={() => notify(`Verifying files for ${game.data.title}…`)}
        >
          Verify files
        </OsButton>
        <OsButton
          variant="primary"
          testId="sheet-apply"
          onClick={() =>
            notify(
              launchOptions.trim() === ''
                ? 'Properties saved.'
                : `Properties saved — launch options: ${launchOptions.trim()}`,
            )
          }
        >
          Save
        </OsButton>
      </div>
    </div>
  )
}

function SheetEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="os-dim" data-testid="sheet-empty">
      {children}
    </p>
  )
}
