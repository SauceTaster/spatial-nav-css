/**
 * Field widgets for the config console.
 *
 * Every control here is a *native* input, and that is the point. The keyboard
 * adapter ignores mapped keys whose target is editable, so arrows inside a
 * text/number field or a textarea edit the value instead of moving spatial
 * focus, and a horizontal range keeps left/right for its own value while
 * up/down still navigate out (docs/edge-cases.md, "Typing fields").
 * Re-implementing any of these as a div would throw all of that away.
 */
import type { ReactNode } from 'react'
import type { AnyFieldApi } from '@tanstack/react-form'
import { fieldDomId } from './form'

/** First error for a field, as text — TanStack stores errors as unknown[]. */
export function fieldError(field: AnyFieldApi): string | null {
  const first: unknown = field.state.meta.errors[0]
  if (first === undefined || first === null) return null
  if (typeof first === 'string') return first
  const message = (first as { message?: unknown }).message
  return typeof message === 'string' ? message : String(first)
}

interface FieldProps {
  field: AnyFieldApi
  label: string
  hint?: string
}

function FieldShell({ field, label, hint, children }: FieldProps & { children: ReactNode }) {
  const error = fieldError(field)
  return (
    <div className={`sa-field${error ? ' is-invalid' : ''}`} data-testid="field" data-field={field.name}>
      <label className="sa-field-label" htmlFor={fieldDomId(field.name)}>
        {label}
      </label>
      {children}
      {hint ? <p className="sa-field-hint">{hint}</p> : null}
      {error ? (
        <p className="sa-field-error" data-testid="field-error" data-field={field.name} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Attributes every control shares: stable id for focus-by-name, test hook. */
const controlProps = (field: AnyFieldApi) => ({
  id: fieldDomId(field.name),
  name: field.name,
  'data-testid': 'field-control',
  'data-field': field.name,
  onBlur: field.handleBlur,
})

export function TextField({ field, label, hint }: FieldProps) {
  return (
    <FieldShell field={field} label={label} hint={hint}>
      <input
        {...controlProps(field)}
        className="sa-input"
        type="text"
        value={String(field.state.value ?? '')}
        onChange={(event) => field.handleChange(event.target.value)}
      />
    </FieldShell>
  )
}

export function NumberField({
  field,
  label,
  hint,
  min,
  max,
}: FieldProps & { min?: number; max?: number }) {
  const value: unknown = field.state.value
  return (
    <FieldShell field={field} label={label} hint={hint}>
      <input
        {...controlProps(field)}
        className="sa-input sa-input-number"
        type="number"
        min={min}
        max={max}
        value={typeof value === 'number' && Number.isFinite(value) ? value : ''}
        onChange={(event) =>
          field.handleChange(event.target.value === '' ? Number.NaN : Number(event.target.value))
        }
      />
    </FieldShell>
  )
}

export function SelectField({
  field,
  label,
  hint,
  options,
}: FieldProps & { options: readonly string[] }) {
  return (
    <FieldShell field={field} label={label} hint={hint}>
      {/*
        A native <select> counts as editable, so the adapter hands it *every*
        arrow key: up/down cycle options and the user leaves with Tab, a
        pointer, or the panel's Escape handler. That is the browser's contract,
        not a bug — a custom listbox would be the thing that breaks it.
      */}
      <select
        {...controlProps(field)}
        className="sa-input sa-select"
        value={String(field.state.value ?? '')}
        onChange={(event) => field.handleChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

export function SwitchField({ field, label, hint }: FieldProps) {
  return (
    <FieldShell field={field} label={label} hint={hint}>
      {/*
        A checkbox is not editable by the adapter's definition, so arrows move
        focus off it normally and Enter toggles it. That asymmetry with the
        text fields above is the whole lesson of this panel.
      */}
      <input
        {...controlProps(field)}
        className="sa-switch"
        type="checkbox"
        role="switch"
        checked={Boolean(field.state.value)}
        onChange={(event) => field.handleChange(event.target.checked)}
      />
    </FieldShell>
  )
}

export function TextAreaField({ field, label, hint }: FieldProps) {
  return (
    <FieldShell field={field} label={label} hint={hint}>
      <textarea
        {...controlProps(field)}
        className="sa-input sa-textarea"
        rows={3}
        value={String(field.state.value ?? '')}
        onChange={(event) => field.handleChange(event.target.value)}
      />
    </FieldShell>
  )
}

export function RangeField({
  field,
  label,
  hint,
  min,
  max,
  step = 1,
}: FieldProps & { min: number; max: number; step?: number }) {
  const value = Number(field.state.value ?? min)
  return (
    <FieldShell field={field} label={label} hint={hint}>
      <div className="sa-range">
        {/*
          Focus stays on the native range input rather than on a wrapping row:
          the adapter leaves left/right to the browser (value) and keeps
          up/down as the exit directions, which is the documented recipe.
        */}
        <input
          {...controlProps(field)}
          className="sa-slider"
          type="range"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : min}
          onChange={(event) => field.handleChange(Number(event.target.value))}
        />
        <output className="sa-range-value" data-testid="range-value">
          {Number.isFinite(value) ? value : min}
        </output>
      </div>
    </FieldShell>
  )
}
