/**
 * The primitive controls.
 *
 * All plain DOM: a `<button>` is a spatial stop for free, needs no bridge, and
 * behaves identically under a D-pad, a keyboard and a mouse. That is the whole
 * argument for not reaching for a roving-tabindex collection library here.
 *
 * `Stepper` is the important one. A native `<input type="range">` swallows
 * left/right (the engine deliberately leaves the widget's own axis alone), so
 * on a device where left/right is *also* how you leave the control, a slider
 * is a trap. A stepper — value plus two arrows — is what console UIs actually
 * use, and it composes with directional input instead of fighting it.
 */
import { clsx } from 'clsx'
import { useFocusable } from 'spatial-nav-css/react'
import type { ReactNode } from 'react'

export interface StepperOption<T> {
  value: T
  label: string
}

export function Stepper<T extends string | number>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string
  value: T
  options: Array<StepperOption<T>>
  onChange: (value: T) => void
  testId?: string
}) {
  const index = options.findIndex((o) => o.value === value)
  const safeIndex = index < 0 ? 0 : index
  const step = (delta: number) => {
    const next = options[Math.max(0, Math.min(options.length - 1, safeIndex + delta))]
    if (next && next.value !== value) onChange(next.value)
  }

  const { ref, focused } = useFocusable<HTMLDivElement>({
    // Left/right adjust; the engine still owns up/down, so the control is
    // never a dead end.
    navLeft: 'none',
    navRight: 'none',
  })

  return (
    <div
      ref={ref}
      className={clsx('os-stepper', focused && 'is-focused')}
      data-testid={testId}
      data-focusable
      role="group"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          step(-1)
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          step(1)
        }
      }}
    >
      <span className="os-stepper-label">{label}</span>
      <span className="os-stepper-value">
        <span aria-hidden="true" className={clsx('os-stepper-arrow', safeIndex === 0 && 'is-off')}>
          ‹
        </span>
        <output data-testid={testId ? `${testId}-value` : undefined}>
          {options[safeIndex]?.label ?? '—'}
        </output>
        <span
          aria-hidden="true"
          className={clsx('os-stepper-arrow', safeIndex === options.length - 1 && 'is-off')}
        >
          ›
        </span>
      </span>
    </div>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  testId?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="os-toggle"
      data-testid={testId}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className={clsx('os-toggle-track', checked && 'is-on')} aria-hidden="true">
        <span className="os-toggle-thumb" />
      </span>
    </button>
  )
}

export function OsButton({
  children,
  onClick,
  variant = 'default',
  autofocus,
  testId,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  autofocus?: boolean
  testId?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={clsx('os-btn', `os-btn-${variant}`)}
      data-testid={testId}
      onClick={onClick}
      // aria-disabled, not `disabled`: a disabled element stops being a
      // spatial stop, so the highlight would vanish mid-interaction.
      aria-disabled={disabled || undefined}
      {...(autofocus ? { 'data-spatial-autofocus': '' } : {})}
    >
      {children}
    </button>
  )
}
