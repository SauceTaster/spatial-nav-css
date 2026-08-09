/**
 * The accounts panel: one row per media user, each carrying three of the
 * components this example is about (Select, Switch, Menu).
 *
 * The row is a spatial zone with `remember`, so crossing out to the tablist
 * and back returns to the control you left rather than the first one.
 */
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { AccountMenu, type AccountAction } from './menu'
import { SpatialSelect } from './select'
import { slotAttrs } from './spatial'
import type { MediaUser } from '../shared/api/db'

const ROLES = [
  { value: 'admin', label: 'Administrator' },
  { value: 'user', label: 'Standard' },
  { value: 'guest', label: 'Guest' },
]


export function AccountRow({
  user,
  onRole,
  onActive,
  onAction,
}: {
  user: MediaUser
  onRole: (role: MediaUser['role']) => void
  onActive: (active: boolean) => void
  onAction: (action: AccountAction) => void
}) {
  return (
    <Stack
      direction="row"
      spacing={2}
      data-spatial-container="remember"
      data-testid="account-row"
      data-account-id={user.id}
      sx={{ alignItems: 'center', py: 1, borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      <Stack sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap>
          {user.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {user.email}
        </Typography>
      </Stack>
      <SpatialSelect
        label="Role"
        value={user.role}
        options={ROLES}
        onChange={(next) => onRole(next as MediaUser['role'])}
      />
      <Switch
        checked={user.active}
        onChange={(_event, next: boolean) => onActive(next)}
        slotProps={{
          input: slotAttrs({ 'aria-label': `${user.name} active`, 'data-testid': 'account-active' }),
        }}
      />
      <AccountMenu user={user} onAction={onAction} />
    </Stack>
  )
}

export function AccountList({
  users,
  loading,
  onRole,
  onActive,
  onAction,
}: {
  users: MediaUser[]
  loading: boolean
  onRole: (user: MediaUser, role: MediaUser['role']) => void
  onActive: (user: MediaUser, active: boolean) => void
  onAction: (user: MediaUser, action: AccountAction) => void
}) {
  return (
    <Paper sx={{ px: 2, py: 1 }}>
      {loading
        ? Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height={52} data-testid="account-skeleton" />
          ))
        : users.map((user) => (
            <AccountRow
              key={user.id}
              user={user}
              onRole={(role) => onRole(user, role)}
              onActive={(active) => onActive(user, active)}
              onAction={(action) => onAction(user, action)}
            />
          ))}
    </Paper>
  )
}
