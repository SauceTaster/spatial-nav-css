/**
 * The straightforward MUI controls: Switch, Checkbox, TextField.
 *
 * INTEGRATION REQUIREMENTS
 *
 * 1. Switch and Checkbox need nothing. MUI's real focus target is a visually
 *    hidden `<input type="checkbox">` stretched over the whole control, so it
 *    is matched by the default focusable selector and it measures with the
 *    control's own box — geometry and activation (a synthesized click on a
 *    checkbox toggles it) both work untouched.
 *
 * 2. Their focus *ring* does need help. MUI paints `.Mui-focusVisible` on the
 *    wrapper span, driven by `:focus-visible`, which a controller-driven
 *    programmatic focus move does not reliably set; and the engine's own ring
 *    lands on the invisible input. mui.css hoists it to the wrapper with
 *    `:has([data-spatial-focused])` — the *attribute*, never the
 *    `.spatial-focused` class, because emotion rewrites `className` on every
 *    re-render and would drop a class-based ring.
 *
 * 3. TextField needs nothing, and deliberately gets nothing: the keyboard
 *    adapter ignores mapped keys while the target is editable, so arrows,
 *    Enter and Escape stay the field's. Focus therefore *sticks* in the input
 *    until Tab, a pointer, or app-level handling moves it — the documented
 *    trade-off (docs/recipes.md, "Settings form"). A remote-only product
 *    needs an on-screen keyboard or an explicit exit affordance here.
 */
import Checkbox from '@mui/material/Checkbox'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { slotAttrs } from './spatial'
import type { ReactNode } from 'react'

const textInput = slotAttrs({ 'data-testid': 'text-input' })

export function SettingRow({
  label,
  hint,
  control,
}: {
  label: string
  hint?: string
  control: ReactNode
}) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{
        alignItems: 'center',
        justifyContent: 'space-between',
        py: 1.25,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <Stack sx={{ minWidth: 0 }}>
        <Typography variant="body2">{label}</Typography>
        {hint ? (
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        ) : null}
      </Stack>
      {control}
    </Stack>
  )
}

export function SettingSwitch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <SettingRow
      label={label}
      hint={hint}
      control={
        <Switch
          checked={checked}
          onChange={(_event, next: boolean) => onChange(next)}
          slotProps={{ input: slotAttrs({ 'aria-label': label, 'data-testid': 'switch' }) }}
        />
      }
    />
  )
}

export function SettingCheckbox({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <SettingRow
      label={label}
      hint={hint}
      control={
        <Checkbox
          checked={checked}
          onChange={(_event, next: boolean) => onChange(next)}
          slotProps={{ input: slotAttrs({ 'aria-label': label, 'data-testid': 'checkbox' }) }}
        />
      }
    />
  )
}

export function SettingText({
  label,
  hint,
  value,
  onCommit,
}: {
  label: string
  hint?: string
  value: string
  onCommit: (next: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const commit = () => {
    if (draft !== value) onCommit(draft)
  }
  return (
    <SettingRow
      label={label}
      hint={hint}
      control={
        <TextField
          size="small"
          value={draft}
          aria-label={label}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
          }}
          slotProps={{ htmlInput: textInput }}
        />
      }
    />
  )
}
