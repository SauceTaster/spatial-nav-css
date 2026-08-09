/**
 * One component per category. Each owns its own `useSettingsPatch()`, so a
 * rejected save is scoped to the panel the user is looking at — there is no
 * global "settings error" that outlives the screen that caused it.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { osQueries } from '../../services/api'
import { formatBytes, type DeviceSettings } from '../../services/device'
import { useShell } from '../../state/shell'
import { OsButton, Stepper } from '../../ui/controls'
import { InfoRow, PanelSkeleton, RangeStepper, SettingGroup, SettingToggle, TextField } from './fields'
import { useSettingsPatch, type SettingsFieldError } from './useSettingsPatch'

/** Seeded, not read from the environment: a screenshot must be reproducible. */
const BUILD = {
  os: 'HandheldOS 3.7.4',
  build: '20260114.2',
  kernel: '6.11.11-handheld',
  firmware: 'F7A.19',
  model: 'HH-1 (512 GB)',
  serial: 'HH1-2X4K-9077',
}

/**
 * Put focus back on the control the server rejected. The engine adopts real
 * DOM focus through its own focusin listener, so a plain `.focus()` is enough —
 * no nav instance needed here.
 */
function useFocusRejectedField(fieldError: SettingsFieldError | null): void {
  useEffect(() => {
    if (!fieldError?.field) return
    const target = document.querySelector<HTMLElement>(
      `[data-settings-field="${fieldError.field}"]`,
    )
    target?.focus()
  }, [fieldError])
}

const pct = (value: number) => `${value}%`
const watts = (value: number) => `${value} W`

export function DisplayPanel() {
  const { settings, patch, pending } = useSettingsPatch()
  if (pending || !settings) return <PanelSkeleton />
  return (
    <SettingGroup title="Screen">
      <RangeStepper
        label="Brightness"
        value={settings.brightness}
        min={0}
        max={100}
        step={4}
        format={pct}
        onChange={(brightness) => patch({ brightness })}
        testId="set-brightness"
      />
      <Stepper
        label="Refresh rate"
        value={settings.refreshHz}
        options={[
          { value: 60, label: '60 Hz' },
          { value: 90, label: '90 Hz' },
        ]}
        onChange={(refreshHz) => patch({ refreshHz: refreshHz as DeviceSettings['refreshHz'] })}
        testId="set-refresh"
      />
      <Stepper
        label="Colour profile"
        value={settings.colorProfile}
        options={[
          { value: 'native', label: 'Native' },
          { value: 'vivid', label: 'Vivid' },
          { value: 'calibrated', label: 'Calibrated' },
        ]}
        onChange={(colorProfile) =>
          patch({ colorProfile: colorProfile as DeviceSettings['colorProfile'] })
        }
        testId="set-color"
      />
    </SettingGroup>
  )
}

export function PerformancePanel() {
  const { settings, patch, pending, fieldError, setFieldError } = useSettingsPatch()
  const [draft, setDraft] = useState('')
  useFocusRejectedField(fieldError)

  if (pending || !settings) return <PanelSkeleton />

  const applyExactTdp = () => {
    const parsed = Number(draft.trim())
    // The client owns "is this a number at all"; the *range* belongs to the
    // firmware, which is the only thing that knows this chassis's limits. So
    // an out-of-range value is sent and its 422 is surfaced, not pre-empted.
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setFieldError({ field: 'tdpWatts', message: 'Enter a whole number of watts.' })
      return
    }
    // Clear the box only once the device accepted it; a rejected value the
    // user has to retype is a second insult after the error.
    patch({ tdpWatts: Math.round(parsed) }, { onSuccess: () => setDraft('') })
  }

  return (
    <>
      <SettingGroup title="Power">
        <RangeStepper
          label="TDP limit"
          value={settings.tdpWatts}
          min={3}
          max={30}
          step={1}
          format={watts}
          onChange={(tdpWatts) => patch({ tdpWatts })}
          testId="set-tdp"
        />
        <Stepper
          label="Frame limit"
          value={settings.frameLimit}
          options={[
            { value: 0, label: 'Off' },
            { value: 30, label: '30' },
            { value: 40, label: '40' },
            { value: 60, label: '60' },
            { value: 90, label: '90' },
          ]}
          onChange={(frameLimit) => patch({ frameLimit: frameLimit as DeviceSettings['frameLimit'] })}
          testId="set-frame-limit"
        />
        <Stepper
          label="Performance overlay"
          value={settings.performanceOverlay}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'fps', label: 'FPS' },
            { value: 'detailed', label: 'Detailed' },
          ]}
          onChange={(performanceOverlay) =>
            patch({ performanceOverlay: performanceOverlay as DeviceSettings['performanceOverlay'] })
          }
          testId="set-overlay"
        />
      </SettingGroup>

      <SettingGroup title="Advanced">
        <TextField
          label="Set exact TDP"
          name="tdpWatts"
          value={draft}
          onChange={setDraft}
          onCommit={applyExactTdp}
          error={fieldError?.field === 'tdpWatts' ? fieldError.message : null}
          hint={`Currently ${settings.tdpWatts} W. Esc leaves the field.`}
          testId="set-tdp-exact"
        />
        <div className="sv-actions">
          <OsButton onClick={applyExactTdp} testId="set-tdp-apply">
            Apply
          </OsButton>
        </div>
      </SettingGroup>
    </>
  )
}

export function AudioPanel() {
  const { settings, patch, pending } = useSettingsPatch()
  if (pending || !settings) return <PanelSkeleton />
  return (
    <SettingGroup title="Output">
      <RangeStepper
        label="Volume"
        value={settings.volume}
        min={0}
        max={100}
        step={5}
        format={pct}
        onChange={(volume) => patch({ volume })}
        testId="set-volume"
      />
      <RangeStepper
        label="Haptics"
        value={settings.hapticStrength}
        min={0}
        max={100}
        step={5}
        format={pct}
        onChange={(hapticStrength) => patch({ hapticStrength })}
        testId="set-haptics"
      />
    </SettingGroup>
  )
}

export function NetworkPanel() {
  const { settings, patch, pending } = useSettingsPatch()
  if (pending || !settings) return <PanelSkeleton />
  const grounded = settings.airplane
  return (
    <SettingGroup title="Radios">
      <SettingToggle
        label="Wi-Fi"
        checked={settings.wifi && !grounded}
        unavailable={grounded}
        reason="Airplane mode is on"
        onChange={(wifi) => patch({ wifi })}
        testId="set-wifi"
      />
      <SettingToggle
        label="Bluetooth"
        checked={settings.bluetooth && !grounded}
        unavailable={grounded}
        reason="Airplane mode is on"
        onChange={(bluetooth) => patch({ bluetooth })}
        testId="set-bluetooth"
      />
      <SettingToggle
        label="Airplane mode"
        checked={grounded}
        onChange={(airplane) => patch({ airplane })}
        testId="set-airplane"
      />
    </SettingGroup>
  )
}

export function StoragePanel() {
  const drives = useQuery(osQueries.drives())
  const push = useShell((s) => s.push)
  const notify = useShell((s) => s.notify)
  const items = drives.data?.items ?? []

  if (drives.isPending) return <PanelSkeleton />

  return (
    <>
      <SettingGroup title="Drives">
        {items.map((drive) => {
          const used = drive.root.sizeBytes
          const percent = Math.min(100, Math.round((used / drive.totalBytes) * 100))
          return (
            <button
              key={drive.id}
              type="button"
              className="sv-drive"
              data-testid="set-drive"
              data-drive={drive.id}
              onClick={() => push({ id: 'files', driveId: drive.id })}
            >
              <span className="sv-drive-head">
                <strong>{drive.label}</strong>
                <small className="os-dim">
                  {formatBytes(used)} of {formatBytes(drive.totalBytes)} used
                </small>
              </span>
              <span className="sv-drive-bar" aria-hidden="true">
                <span className="sv-drive-fill" style={{ width: `${percent}%` }} />
              </span>
            </button>
          )
        })}
      </SettingGroup>

      <SettingGroup title="Maintenance">
        <div className="sv-actions">
          <OsButton
            onClick={() => notify('Shader cache cleared.')}
            testId="set-clear-shader-cache"
          >
            Clear shader cache
          </OsButton>
        </div>
      </SettingGroup>
    </>
  )
}

export function SystemPanel() {
  const { settings, patch, pending, fieldError } = useSettingsPatch()
  const confirm = useShell((s) => s.confirm)
  const notify = useShell((s) => s.notify)
  const [draft, setDraft] = useState<string | null>(null)
  useFocusRejectedField(fieldError)

  if (pending || !settings) return <PanelSkeleton />

  // null draft = "showing the device's value"; typing takes ownership.
  const name = draft ?? settings.deviceName
  // On success hand the field back to the device's value; on failure keep what
  // the user typed so they can fix it.
  const applyName = () => patch({ deviceName: name }, { onSuccess: () => setDraft(null) })

  const factoryReset = async () => {
    const yes = await confirm({
      title: 'Factory reset',
      message:
        'Erase every game, save and setting on this device and return it to the state it shipped in. This cannot be undone.',
      confirmLabel: 'Erase everything',
      destructive: true,
    })
    if (yes) notify('Factory reset scheduled — the device will restart.')
  }

  return (
    <>
      <SettingGroup title="Identity">
        <TextField
          label="Device name"
          name="deviceName"
          value={name}
          onChange={setDraft}
          onCommit={applyName}
          error={fieldError?.field === 'deviceName' ? fieldError.message : null}
          hint="Shown on the network and in remote play. Esc leaves the field."
          testId="set-device-name"
        />
        <div className="sv-actions">
          <OsButton onClick={applyName} testId="set-device-name-apply">
            Apply
          </OsButton>
        </div>
      </SettingGroup>

      <SettingGroup title="Updates">
        <SettingToggle
          label="Automatic updates"
          checked={settings.autoUpdates}
          onChange={(autoUpdates) => patch({ autoUpdates })}
          testId="set-auto-updates"
        />
        <Stepper
          label="Update channel"
          value={settings.updateChannel}
          options={[
            { value: 'stable', label: 'Stable' },
            { value: 'beta', label: 'Beta' },
            { value: 'preview', label: 'Preview' },
          ]}
          onChange={(updateChannel) =>
            patch({ updateChannel: updateChannel as DeviceSettings['updateChannel'] })
          }
          testId="set-update-channel"
        />
      </SettingGroup>

      <section className="sv-group sv-danger" data-testid="settings-danger">
        <h2 className="sv-group-title">Danger zone</h2>
        <p className="os-dim">
          A factory reset erases everything installed, every save that is not in the cloud, and every
          setting on this screen.
        </p>
        <div className="sv-actions">
          <OsButton variant="danger" onClick={() => void factoryReset()} testId="set-factory-reset">
            Factory reset
          </OsButton>
        </div>
      </section>
    </>
  )
}

export function DeveloperPanel() {
  const { settings, patch, pending } = useSettingsPatch()
  const notify = useShell((s) => s.notify)
  // No device endpoint for these two yet; they are session-local until there
  // is one, which is better than pretending a toggle persisted.
  const [remoteDebug, setRemoteDebug] = useState(false)
  const [unthrottledShaders, setUnthrottledShaders] = useState(false)

  if (pending || !settings) return <PanelSkeleton />
  const off = !settings.developerMode

  return (
    <>
      <SettingGroup title="Developer mode">
        <SettingToggle
          label="Developer mode"
          checked={settings.developerMode}
          onChange={(developerMode) => patch({ developerMode })}
          testId="set-developer-mode"
        />
        <SettingToggle
          label="Remote debugging"
          checked={remoteDebug && !off}
          unavailable={off}
          reason="Turn on developer mode first"
          onChange={setRemoteDebug}
          testId="set-remote-debug"
        />
        <SettingToggle
          label="Unthrottled shader compile"
          checked={unthrottledShaders && !off}
          unavailable={off}
          reason="Turn on developer mode first"
          onChange={setUnthrottledShaders}
          testId="set-unthrottled-shaders"
        />
      </SettingGroup>

      <SettingGroup title="Diagnostics">
        <div className="sv-actions">
          <OsButton
            disabled={off}
            onClick={() => {
              if (off) return
              notify('System log copied to /home/deck/system.log')
            }}
            testId="set-copy-log"
          >
            Copy system log
          </OsButton>
        </div>
      </SettingGroup>
    </>
  )
}

export function AboutPanel() {
  const { settings, pending } = useSettingsPatch()
  const drives = useQuery(osQueries.drives())
  const client = useQueryClient()
  const notify = useShell((s) => s.notify)
  // Not a real update check — it re-reads the device services, which is the
  // honest version of the button on a mocked device.
  const check = useMutation({
    mutationFn: async () => client.invalidateQueries(),
    onSuccess: () => notify('This device is up to date.'),
  })

  if (pending || !settings) return <PanelSkeleton />

  const items = drives.data?.items ?? []
  const total = items.reduce((sum, drive) => sum + drive.totalBytes, 0)
  const used = items.reduce((sum, drive) => sum + drive.root.sizeBytes, 0)

  return (
    <>
      <SettingGroup title="Device">
        <InfoRow label="Device name" value={settings.deviceName} />
        <InfoRow label="Model" value={BUILD.model} />
        <InfoRow label="Serial" value={BUILD.serial} />
      </SettingGroup>

      <SettingGroup title="Software">
        <InfoRow label="Operating system" value={BUILD.os} />
        <InfoRow label="Build" value={BUILD.build} />
        <InfoRow label="Kernel" value={BUILD.kernel} />
        <InfoRow label="Firmware" value={BUILD.firmware} />
        <InfoRow label="Update channel" value={settings.updateChannel} />
      </SettingGroup>

      <SettingGroup title="Storage">
        {items.length === 0 ? (
          <InfoRow label="Drives" value="—" />
        ) : (
          <>
            {items.map((drive) => (
              <InfoRow
                key={drive.id}
                label={drive.label}
                value={`${formatBytes(drive.root.sizeBytes)} of ${formatBytes(drive.totalBytes)}`}
              />
            ))}
            <InfoRow
              label="Total"
              value={`${formatBytes(used)} of ${formatBytes(total)} across ${items.length} drives`}
            />
          </>
        )}
      </SettingGroup>

      <div className="sv-actions">
        <OsButton onClick={() => check.mutate()} testId="set-check-updates">
          Check for updates
        </OsButton>
      </div>
    </>
  )
}
