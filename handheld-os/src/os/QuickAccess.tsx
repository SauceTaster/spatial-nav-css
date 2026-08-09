/**
 * The quick-access menu — the SteamOS side panel that slides in over whatever
 * you were doing.
 *
 * It is a side sheet rather than a modal dialog: the screen behind stays
 * visible (you are adjusting brightness *while* looking at the game), but is
 * `inert`, so it is not reachable. Vertical tabs on the right edge, content to
 * their left, which is the layout that makes a thumb-reachable D-pad sensible.
 */
import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSpatialNavigation } from 'spatial-nav-css/react'
import { osMutations, osQueries } from '../services/api'
import type { DeviceSettings } from '../services/device'
import { useShell, type Overlay, type QuickAccessTab } from '../state/shell'
import { Stepper, Toggle } from '../ui/controls'

const TABS: Array<{ id: QuickAccessTab; label: string; glyph: string }> = [
  { id: 'performance', label: 'Performance', glyph: '◱' },
  { id: 'audio', label: 'Audio', glyph: '♪' },
  { id: 'network', label: 'Network', glyph: '≋' },
  { id: 'notifications', label: 'Notifications', glyph: '✦' },
  { id: 'power', label: 'Power', glyph: '⏻' },
]

export function QuickAccess({ overlay }: { overlay: Extract<Overlay, { kind: 'quick-access' }> }) {
  const nav = useSpatialNavigation()
  const panelRef = useRef<HTMLDivElement>(null)
  const setTab = useShell((s) => s.setQuickAccessTab)
  const closeOverlay = useShell((s) => s.closeOverlay)

  // Entry point: the panel is new DOM, so nothing in it is focused yet.
  // claimFocus() rather than focus() so a user who is already somewhere is
  // never yanked — see the library's recipes.
  useEffect(() => {
    const first = panelRef.current?.querySelector<HTMLElement>('[data-spatial-autofocus]')
    if (first) nav.focus(first)
  }, [nav])

  return (
    <div
      className="os-qam"
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Quick access"
      data-testid="qam"
      // `contain` covers the directional search; the stage's `inert` covers
      // everything else. Both, deliberately.
      data-spatial-container="contain remember"
    >
      <div className="os-qam-body" data-testid="qam-body">
        {overlay.tab === 'performance' ? <PerformancePane /> : null}
        {overlay.tab === 'audio' ? <AudioPane /> : null}
        {overlay.tab === 'network' ? <NetworkPane /> : null}
        {overlay.tab === 'notifications' ? <NotificationsPane /> : null}
        {overlay.tab === 'power' ? <PowerPane onClose={closeOverlay} /> : null}
      </div>

      <nav className="os-qam-tabs" aria-label="Quick access sections" data-spatial-container="remember">
        {TABS.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            className={`os-qam-tab${overlay.tab === tab.id ? ' is-active' : ''}`}
            data-testid="qam-tab"
            data-tab={tab.id}
            {...(i === 0 ? { 'data-spatial-autofocus': '' } : {})}
            aria-pressed={overlay.tab === tab.id}
            onClick={() => setTab(tab.id)}
          >
            <span aria-hidden="true">{tab.glyph}</span>
            <small>{tab.label}</small>
          </button>
        ))}
      </nav>
    </div>
  )
}

/** Settings edits are optimistic: a slider that lags the thumb feels broken. */
function useSettingsPatch() {
  const client = useQueryClient()
  const settings = useQuery(osQueries.settings())
  const mutation = useMutation({
    mutationFn: (patch: Partial<DeviceSettings>) => osMutations.saveSettings(patch),
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: ['settings'] })
      const previous = client.getQueryData<DeviceSettings>(['settings'])
      if (previous) client.setQueryData<DeviceSettings>(['settings'], { ...previous, ...patch })
      return { previous }
    },
    onError: (_e, _patch, context) => {
      if (context?.previous) client.setQueryData(['settings'], context.previous)
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['settings'] }),
  })
  return { settings: settings.data, patch: mutation.mutate, pending: settings.isPending }
}

function PerformancePane() {
  const { settings, patch, pending } = useSettingsPatch()
  if (pending || !settings) return <PaneSkeleton title="Performance" />
  return (
    <Pane title="Performance">
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
        testId="qam-frame-limit"
      />
      <Stepper
        label="Refresh rate"
        value={settings.refreshHz}
        options={[
          { value: 60, label: '60 Hz' },
          { value: 90, label: '90 Hz' },
        ]}
        onChange={(refreshHz) => patch({ refreshHz: refreshHz as DeviceSettings['refreshHz'] })}
        testId="qam-refresh"
      />
      <Stepper
        label="TDP limit"
        value={settings.tdpWatts}
        options={[6, 9, 12, 15, 18, 22].map((w) => ({ value: w, label: `${w} W` }))}
        onChange={(tdpWatts) => patch({ tdpWatts: Number(tdpWatts) })}
        testId="qam-tdp"
      />
      <Stepper
        label="Overlay"
        value={settings.performanceOverlay}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'fps', label: 'FPS' },
          { value: 'detailed', label: 'Detailed' },
        ]}
        onChange={(performanceOverlay) =>
          patch({ performanceOverlay: performanceOverlay as DeviceSettings['performanceOverlay'] })
        }
        testId="qam-overlay"
      />
    </Pane>
  )
}

function AudioPane() {
  const { settings, patch, pending } = useSettingsPatch()
  if (pending || !settings) return <PaneSkeleton title="Audio" />
  return (
    <Pane title="Audio">
      <Stepper
        label="Volume"
        value={settings.volume}
        options={[0, 15, 30, 45, 60, 75, 90, 100].map((v) => ({ value: v, label: `${v}%` }))}
        onChange={(volume) => patch({ volume: Number(volume) })}
        testId="qam-volume"
      />
      <Stepper
        label="Haptics"
        value={settings.hapticStrength}
        options={[0, 20, 40, 60, 80, 100].map((v) => ({ value: v, label: `${v}%` }))}
        onChange={(hapticStrength) => patch({ hapticStrength: Number(hapticStrength) })}
        testId="qam-haptics"
      />
    </Pane>
  )
}

function NetworkPane() {
  const { settings, patch, pending } = useSettingsPatch()
  if (pending || !settings) return <PaneSkeleton title="Network" />
  return (
    <Pane title="Network">
      <Toggle
        label="Wi-Fi"
        checked={settings.wifi}
        onChange={(wifi) => patch({ wifi })}
        testId="qam-wifi"
      />
      <Toggle
        label="Bluetooth"
        checked={settings.bluetooth}
        onChange={(bluetooth) => patch({ bluetooth })}
        testId="qam-bluetooth"
      />
      <Toggle
        label="Airplane mode"
        checked={settings.airplane}
        onChange={(airplane) => patch({ airplane })}
        testId="qam-airplane"
      />
    </Pane>
  )
}

function NotificationsPane() {
  const downloads = useQuery(osQueries.downloads())
  const active = (downloads.data?.items ?? []).filter((job) => job.state !== 'done')
  return (
    <Pane title="Notifications">
      {active.length === 0 ? (
        <p className="os-dim">Nothing in progress.</p>
      ) : (
        <ul className="os-qam-list">
          {active.slice(0, 6).map((job) => (
            <li key={job.id}>
              <button type="button" className="os-qam-row" data-testid="qam-notification">
                <span>{job.title}</span>
                <small className="os-dim">
                  {job.state === 'downloading'
                    ? `${Math.round((job.doneBytes / job.totalBytes) * 100)}%`
                    : job.state}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Pane>
  )
}

function PowerPane({ onClose }: { onClose: () => void }) {
  const confirm = useShell((s) => s.confirm)
  const notify = useShell((s) => s.notify)
  const act = async (label: string) => {
    const yes = await confirm({
      title: label,
      message: `${label} the device now?`,
      confirmLabel: label,
      destructive: label === 'Shut down',
    })
    if (yes) {
      notify(`${label}…`)
      onClose()
    }
  }
  return (
    <Pane title="Power">
      {['Sleep', 'Restart', 'Shut down'].map((label) => (
        <button
          key={label}
          type="button"
          className="os-qam-row"
          data-testid="qam-power"
          onClick={() => void act(label)}
        >
          {label}
        </button>
      ))}
    </Pane>
  )
}

function Pane({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="os-qam-pane">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function PaneSkeleton({ title }: { title: string }) {
  return (
    <section className="os-qam-pane">
      <h2>{title}</h2>
      <p className="os-dim">Loading…</p>
    </section>
  )
}
