/**
 * MUI Select — a `div[role="combobox"]` plus a portaled listbox (a Menu).
 *
 * INTEGRATION REQUIREMENTS
 *
 * 1. The trigger itself needs nothing: MUI renders it as
 *    `div[role="combobox"][tabindex="0"]`, which the default focusable
 *    selector already matches.
 *
 * 2. The listbox is a Menu, so it needs the same two markers: `contain` on
 *    the list slot and `data-focusable` per option (roving tabindex again).
 *
 * 3. KNOWN GAP — activation. MUI opens the Select from `onMouseDown` and
 *    `onKeyDown`; the display element has no click handler at all. The
 *    engine's activate path calls `element.click()`, which dispatches a click
 *    and nothing else, so a gamepad A / remote OK / `nav.activate()` opens
 *    nothing. Keyboard Enter still works, but only because MUI's own keydown
 *    handler runs first and calls `preventDefault()`, after which the
 *    keyboard adapter stands down.
 *
 *    The workaround is to own the open state and drive it from the semantic
 *    intent: listen for `spatial:activate`, `preventDefault()` it so the
 *    dead click is never synthesized, and open. Pinned in mui.test.tsx.
 */
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import { useId, useRef, useState } from 'react'
import { useSpatialEvent } from 'spatial-nav-css/react'
import { slotAttrs, useSpatialBack } from './spatial'

const listSlot = slotAttrs({ 'data-spatial-container': 'contain', 'data-testid': 'listbox' })

export interface Option {
  value: string
  label: string
}

export function SpatialSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Option[]
  onChange: (next: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const labelId = useId()
  useSpatialBack(open, () => setOpen(false))

  // See (3): the semantic activate intent has to open the listbox, because
  // the click the engine would synthesize lands on no handler.
  useSpatialEvent('spatial:activate', (event) => {
    const target = event.target as HTMLElement | null
    if (open || !target || !wrapper.current?.contains(target)) return
    event.preventDefault()
    setOpen(true)
  })

  return (
    <div ref={wrapper}>
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel id={labelId}>{label}</InputLabel>
        <Select
          labelId={labelId}
          label={label}
          value={value}
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
          onChange={(event) => onChange(String(event.target.value))}
          // The listbox is a Menu of its own, reached through MenuProps —
          // Select's `slotProps` covers its input slots, not the popup's.
          MenuProps={{ slotProps: { list: listSlot } }}
        >
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value} data-focusable data-testid="option">
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </div>
  )
}
