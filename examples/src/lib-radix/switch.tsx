/**
 * Radix Switch — the control case.
 *
 * INTEGRATION REQUIREMENT: none.
 *
 * `Switch.Root` is a real `<button role="switch">` in the normal tree, so the
 * default focusable selector already matches it and `nav.activate()`'s
 * synthetic `.click()` drives Radix's own `onClick`. The hidden form input
 * Radix renders alongside it carries `aria-hidden` + `tabindex="-1"`, so the
 * engine skips it and the row is exactly one spatial stop.
 */
import * as Switch from '@radix-ui/react-switch'

export function SettingSwitch({
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (next: boolean) => void
}) {
  return (
    <div className="rx-row">
      <div className="rx-row-text">
        <span className="rx-row-label">{label}</span>
        <span className="rx-row-hint">{hint}</span>
      </div>
      <Switch.Root
        className="rx-switch"
        data-testid="switch"
        data-switch={label}
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      >
        <Switch.Thumb className="rx-switch-thumb" />
      </Switch.Root>
    </div>
  )
}
