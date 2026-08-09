/**
 * Material UI as a spatial citizen — a server admin screen.
 *
 * MUI is the hard case for a spatial engine: Dialog, Menu and Select all
 * portal to `document.body`, each one wraps its content in MUI's own
 * FocusTrap, and Tabs, Menu and Select are roving-tabindex collections whose
 * items are `tabindex="-1"`. Every wrapper module documents what its
 * component needs; the short version:
 *
 *   Switch / Checkbox   nothing (a real input in the normal tree)
 *   TextField           nothing — and keeps its arrow keys, by design
 *   Tabs                `data-focusable` per tab
 *   Menu                the above, plus `contain` on the list
 *   Select              the above, plus an app-owned open path (KNOWN GAP)
 *   Dialog              `contain` on the paper + an explicit entry target
 *
 * Accounts and settings come from the mock API through TanStack Query, so
 * every control is driven by cache data and re-renders under the focused
 * element on each change.
 */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import { ThemeProvider } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { useRef, useState } from 'react'
import { useSpatialEvent } from 'spatial-nav-css/react'
import { useContentFocus } from '../shared/useContentFocus'
import { AccountList } from './accounts'
import { SettingCheckbox, SettingSwitch, SettingText } from './controls'
import { ConfirmDialog } from './dialog'
import { SpatialSelect } from './select'
import { SettingsTabs, type TabSpec } from './tabs'
import { theme } from './theme'
import { useAccounts, useSaveSettings, useSettings, useUpdateAccount } from './api'
import type { MediaUser, SystemSettings } from '../shared/api/db'

const CHANNELS = [
  { value: 'stable', label: 'Stable' },
  { value: 'beta', label: 'Beta' },
  { value: 'nightly', label: 'Nightly' },
]

const DEFAULTS: Partial<SystemSettings> = {
  hostname: 'mediavault',
  automaticUpdates: true,
  telemetry: false,
  remoteAccess: true,
  updateChannel: 'stable',
}

export function App() {
  const [tab, setTab] = useState('accounts')
  const [resetOpen, setResetOpen] = useState(false)
  const resetTrigger = useRef<HTMLButtonElement>(null)
  const [log, setLog] = useState('Arrow keys move · Enter activates · Escape closes overlays')

  const accounts = useAccounts()
  const settings = useSettings()
  const updateAccount = useUpdateAccount()
  const save = useSaveSettings()

  useSpatialEvent('spatial:nofocustarget', (event) => {
    setLog(`No target: ${event.detail.direction}`)
  })

  // Provider `autofocus` fires at start(), while this screen is still
  // skeletons. Claim focus for the tablist once the accounts land.
  useContentFocus(!accounts.isPending, '[data-testid="tab"]')

  const current = settings.data
  const patch = (next: Partial<SystemSettings>) => save.mutate(next)

  const accountsPanel = (
    <AccountList
      users={accounts.data?.items ?? []}
      loading={accounts.isPending}
      onRole={(user: MediaUser, role) => {
        updateAccount.mutate({ id: user.id, patch: { role } })
        setLog(`${user.name} → ${role}`)
      }}
      onActive={(user: MediaUser, active) => {
        updateAccount.mutate({ id: user.id, patch: { active } })
        setLog(`${user.name} ${active ? 'enabled' : 'suspended'}`)
      }}
      onAction={(user: MediaUser, action) => setLog(`${action} · ${user.name}`)}
    />
  )

  const serverPanel = current ? (
    <Paper sx={{ px: 2, py: 1 }}>
      <SettingText
        label="Hostname"
        hint="Enter commits; arrows stay inside the field."
        value={current.hostname}
        onCommit={(hostname) => patch({ hostname })}
      />
      <SettingSwitch
        label="Automatic updates"
        hint="Install patches during the nightly maintenance window."
        checked={current.automaticUpdates}
        onChange={(automaticUpdates) => patch({ automaticUpdates })}
      />
      <SettingCheckbox
        label="Telemetry"
        hint="Send anonymous crash reports."
        checked={current.telemetry}
        onChange={(telemetry) => patch({ telemetry })}
      />
      <Box sx={{ py: 1.25 }}>
        <SpatialSelect
          label="Update channel"
          value={current.updateChannel}
          options={CHANNELS}
          onChange={(updateChannel) =>
            patch({ updateChannel: updateChannel as SystemSettings['updateChannel'] })
          }
        />
      </Box>
    </Paper>
  ) : (
    <Typography variant="body2" color="text.secondary" data-testid="settings-loading">
      Loading settings…
    </Typography>
  )

  const dangerPanel = (
    <Paper sx={{ px: 2, py: 2 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack>
          <Typography variant="body2">Reset configuration</Typography>
          <Typography variant="caption" color="text.secondary">
            Restore every server setting to its shipped default.
          </Typography>
        </Stack>
        <Button
          ref={resetTrigger}
          color="error"
          variant="outlined"
          data-testid="reset-trigger"
          onClick={() => setResetOpen(true)}
        >
          Reset…
        </Button>
      </Stack>
      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        restoreTo={resetTrigger}
        onConfirm={() => {
          patch(DEFAULTS)
          setLog('Configuration reset')
        }}
        title="Reset configuration?"
        body="Every server setting returns to its shipped default. Accounts and running services are left alone."
        confirmLabel="Reset"
      />
    </Paper>
  )

  const tabs: TabSpec[] = [
    { id: 'accounts', label: 'Accounts', content: accountsPanel },
    { id: 'server', label: 'Server', content: serverPanel },
    { id: 'danger', label: 'Danger zone', content: dangerPanel },
  ]

  return (
    <ThemeProvider theme={theme}>
      <Box className="mui-root" sx={{ maxWidth: 860, mx: 'auto' }}>
        <Paper sx={{ px: 2, py: 1, mb: 2 }} data-spatial-container="remember" data-testid="header">
          <Typography variant="h6">{current?.hostname ?? 'mediavault'}</Typography>
          <SettingSwitch
            label="Remote access"
            hint="Reachable from outside the LAN."
            checked={current?.remoteAccess ?? false}
            onChange={(remoteAccess) => patch({ remoteAccess })}
          />
        </Paper>

        <SettingsTabs tabs={tabs} value={tab} onChange={setTab} />

        <Typography
          variant="caption"
          color="text.secondary"
          component="p"
          sx={{ mt: 2 }}
          data-testid="log"
        >
          {log}
        </Typography>
      </Box>
    </ThemeProvider>
  )
}
