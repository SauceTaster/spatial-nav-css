/**
 * The controls this screen needs on top of `ui/controls.tsx`.
 *
 * `Stepper`, `Toggle` and `OsButton` are reused as-is. Three gaps remain:
 *
 *  - **RangeStepper.** Brightness and volume are continuous, and enumerating
 *    26 options to fake a range is silly. It keeps `Stepper`'s shape (one stop,
 *    value plus two arrows) for the reason spelled out there: a native range
 *    input swallows the axis you also need to leave the control on.
 *  - **TextField.** A settings screen has free text; a QAM does not.
 *  - **SettingToggle.** A toggle that can become *unavailable* (Wi-Fi under
 *    airplane mode) without dropping out of the focus order.
 */
import { useId, type ReactNode, type RefObject } from 'react'
import { clsx } from 'clsx'
import { useFocusable } from 'spatial-nav-css/react'

export function RangeStepper({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  testId,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
  testId?: string
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n))
  const nextFor = (delta: number) => clamp(value + delta * step)

  // No navLeft/navRight: 'none' here, unlike the QAM's Stepper. See the
  // keydown handler — the ends of the range are this control's way out.
  const { ref, focused } = useFocusable<HTMLDivElement>()

  const percent = max > min ? ((clamp(value) - min) / (max - min)) * 100 : 0

  return (
    <div
      ref={ref}
      className={clsx('os-stepper', 'sv-range', focused && 'is-focused')}
      data-testid={testId}
      // role="group", not role="slider": the ARIA slider contract also claims
      // up/down, PageUp/PageDown and Home/End, and up/down here is how you get
      // to the next setting. Claiming a contract we deliberately break would be
      // worse for a screen reader than not claiming it.
      role="group"
      aria-label={label}
      onKeyDown={(event) => {
        const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
        if (delta === 0) return
        const next = nextFor(delta)
        // Consume the press only while the value can still move. At min/max
        // the press falls through to the engine, so a panel made entirely of
        // ranges still has a leftward door back to the category rail. (The
        // engine's keyboard adapter skips events that are already
        // defaultPrevented, which is what makes "consume or don't" work.)
        if (next === value) return
        event.preventDefault()
        onChange(next)
      }}
    >
      <span className="os-stepper-label">{label}</span>
      <span className="sv-range-track" aria-hidden="true">
        <span className="sv-range-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="os-stepper-value">
        <span aria-hidden="true" className={clsx('os-stepper-arrow', value <= min && 'is-off')}>
          ‹
        </span>
        <output data-testid={testId ? `${testId}-value` : undefined}>{format(value)}</output>
        <span aria-hidden="true" className={clsx('os-stepper-arrow', value >= max && 'is-off')}>
          ›
        </span>
      </span>
    </div>
  )
}

export function TextField({
  label,
  name,
  value,
  onChange,
  onCommit,
  error,
  hint,
  inputRef,
  testId,
}: {
  label: string
  /** The DeviceSettings key, so a server field error can find this input. */
  name: string
  value: string
  onChange: (value: string) => void
  onCommit?: () => void
  error?: string | null
  hint?: string
  inputRef?: RefObject<HTMLInputElement | null>
  testId?: string
}) {
  const id = useId()
  const messageId = `${id}-message`
  return (
    <label className={clsx('sv-field', error && 'is-invalid')} htmlFor={id}>
      <span className="sv-field-label">{label}</span>
      <input
        id={id}
        ref={inputRef}
        className="sv-field-input"
        type="text"
        value={value}
        data-settings-field={name}
        data-testid={testId}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // Enter commits. The keyboard adapter ignores mapped keys while the
          // target is editable, so Enter never becomes an activate intent here
          // and the field has to do this itself.
          if (event.key !== 'Enter') return
          event.preventDefault()
          onCommit?.()
        }}
      />
      <small className={clsx('sv-field-message', error && 'is-error')} id={messageId}>
        {error ?? hint ?? ''}
      </small>
    </label>
  )
}

export function SettingToggle({
  label,
  checked,
  onChange,
  unavailable,
  reason,
  testId,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  unavailable?: boolean
  reason?: string
  testId?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      // aria-disabled, never `disabled`: a disabled element leaves the
      // focusable set, so the D-pad highlight would vanish mid-column and the
      // user would never reach the row that explains *why* it is off.
      aria-disabled={unavailable || undefined}
      className={clsx('os-toggle', 'sv-toggle', unavailable && 'is-unavailable')}
      data-testid={testId}
      onClick={() => {
        if (unavailable) return
        onChange(!checked)
      }}
    >
      <span className="sv-toggle-label">
        {label}
        {unavailable && reason ? <small>{reason}</small> : null}
      </span>
      <span className={clsx('os-toggle-track', checked && 'is-on')} aria-hidden="true">
        <span className="os-toggle-thumb" />
      </span>
    </button>
  )
}

/** A non-focusable label/value pair. About and the storage summary are reading. */
export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="sv-info-row" data-testid="settings-info-row">
      <span className="sv-info-label">{label}</span>
      <span className="sv-info-value">{value}</span>
    </div>
  )
}

export function SettingGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sv-group">
      <h2 className="sv-group-title">{title}</h2>
      {children}
    </section>
  )
}

export function PanelSkeleton() {
  return (
    <p className="os-dim" data-testid="settings-loading">
      Reading device settings…
    </p>
  )
}
