/**
 * Radix UI primitives as spatial citizens — a server settings screen.
 *
 * Radix is the hard case for a spatial engine: its overlays are portaled to
 * `document.body`, outside whatever subtree the app thinks of as its nav root,
 * and each primitive brings its own focus manager. Every wrapper module in
 * this folder documents what its primitive needs; the short version:
 *
 *   Switch        nothing (a real button in the normal tree)
 *   Tabs          `data-focusable` per trigger to get controller-usable tabs
 *   Select        `data-focusable` per option + `contain` on the content
 *   DropdownMenu  the above, plus an app-owned open path and an entry fix
 *   Dialog        `contain` on the content; entry/restore stay Radix's
 *
 * Settings and services come from the mock API through TanStack Query, so the
 * switches and selects are controlled by cache data and re-render under the
 * focused control on every change.
 */
import { useState } from 'react'
import { useSpatialEvent } from 'spatial-nav-css/react'
import { useSaveSettings, useServiceAction, useServices, useSettings } from './api'
import { ConfirmDialog } from './dialog'
import { ServiceMenu } from './menu'
import { SettingSelect } from './select'
import { SettingsTabs, type TabSpec } from './tabs'
import { SettingSwitch } from './switch'
import type { ServiceStatus, SystemSettings } from '../shared/api/db'

const CHANNELS = [
  { value: 'stable', label: 'Stable' },
  { value: 'beta', label: 'Beta' },
  { value: 'nightly', label: 'Nightly' },
]

const LOG_LEVELS = [
  { value: 'error', label: 'Error' },
  { value: 'warn', label: 'Warning' },
  { value: 'info', label: 'Info' },
  { value: 'debug', label: 'Debug' },
]

const DEFAULTS: Partial<SystemSettings> = {
  automaticUpdates: true,
  telemetry: false,
  sshPasswordAuth: false,
  remoteAccess: true,
  updateChannel: 'stable',
  logLevel: 'info',
}

export function App() {
  const [tab, setTab] = useState('general')
  const [resetOpen, setResetOpen] = useState(false)
  const [log, setLog] = useState('Arrow keys move · Enter activates · Escape closes overlays')

  const settings = useSettings()
  const services = useServices()
  const save = useSaveSettings()
  const act = useServiceAction()

  useSpatialEvent('spatial:nofocustarget', (event) => {
    setLog(`No target: ${event.detail.direction}`)
  })

  const current = settings.data
  const patch = (next: Partial<SystemSettings>) => save.mutate(next)

  const general = current ? (
    <>
      <SettingSwitch
        label="Automatic updates"
        hint="Install patches during the nightly maintenance window."
        checked={current.automaticUpdates}
        onCheckedChange={(automaticUpdates) => patch({ automaticUpdates })}
      />
      <SettingSwitch
        label="Telemetry"
        hint="Send anonymous crash reports."
        checked={current.telemetry}
        onCheckedChange={(telemetry) => patch({ telemetry })}
      />
      <SettingSelect
        label="Update channel"
        hint="Which build stream this box tracks."
        value={current.updateChannel}
        options={CHANNELS}
        onValueChange={(updateChannel) =>
          patch({ updateChannel: updateChannel as SystemSettings['updateChannel'] })
        }
      />
    </>
  ) : (
    <p className="rx-muted" data-testid="settings-loading">
      Loading settings…
    </p>
  )

  const serviceRows = services.data?.items ?? []
  const servicesTab = (
    <div className="rx-services">
      {services.isPending ? (
        <p className="rx-muted" data-testid="services-loading">
          Loading services…
        </p>
      ) : (
        serviceRows.map((service: ServiceStatus) => (
          <div className="rx-row" key={service.id} data-testid="service-row">
            <div className="rx-row-text">
              <span className="rx-row-label">{service.name}</span>
              <span className="rx-row-hint">
                {service.state} · {service.cpuPercent}% CPU · {service.memoryMB} MB
              </span>
            </div>
            <ServiceMenu
              service={service}
              onAction={(action) => {
                act.mutate({ id: service.id, action })
                setLog(`${action} ${service.name}`)
              }}
            />
          </div>
        ))
      )}
    </div>
  )

  const advanced = current ? (
    <>
      <SettingSwitch
        label="SSH password auth"
        hint="Keys only when off."
        checked={current.sshPasswordAuth}
        onCheckedChange={(sshPasswordAuth) => patch({ sshPasswordAuth })}
      />
      <SettingSelect
        label="Log level"
        hint="Verbosity of the system journal."
        value={current.logLevel}
        options={LOG_LEVELS}
        onValueChange={(logLevel) => patch({ logLevel: logLevel as SystemSettings['logLevel'] })}
      />
      <div className="rx-row">
        <div className="rx-row-text">
          <span className="rx-row-label">Reset configuration</span>
          <span className="rx-row-hint">Restore every setting on this page to its default.</span>
        </div>
        <ConfirmDialog
          open={resetOpen}
          onOpenChange={setResetOpen}
          title="Reset configuration?"
          body="Every setting on this page returns to its shipped default. Running services are not restarted."
          confirmLabel="Reset"
          onConfirm={() => {
            patch(DEFAULTS)
            setLog('Configuration reset')
          }}
          trigger={
            <button type="button" className="rx-btn rx-btn-danger" data-testid="reset-trigger">
              Reset…
            </button>
          }
        />
      </div>
    </>
  ) : null

  const tabs: TabSpec[] = [
    { id: 'general', label: 'General', content: general },
    { id: 'services', label: 'Services', content: servicesTab },
    { id: 'advanced', label: 'Advanced', content: advanced },
  ]

  return (
    <div className="rx-root">
      <header className="rx-head" data-spatial-container="remember">
        <div>
          <h1 className="rx-title">{current?.hostname ?? 'mediavault'}</h1>
          <p className="rx-muted">Radix primitives, driven by direction keys</p>
        </div>
        {current ? (
          <SettingSwitch
            label="Remote access"
            hint="Reachable from outside the LAN."
            checked={current.remoteAccess}
            onCheckedChange={(remoteAccess) => patch({ remoteAccess })}
          />
        ) : null}
      </header>

      <SettingsTabs tabs={tabs} value={tab} onValueChange={setTab} />

      <footer className="rx-foot" data-testid="log">
        {log}
      </footer>
    </div>
  )
}
