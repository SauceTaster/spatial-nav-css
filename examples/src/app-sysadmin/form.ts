/**
 * Form logic for the config console, kept out of the components so the
 * interesting part is readable on its own: turning a server 422 into a
 * per-field error the UI can stand on.
 */
import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useSaveSettings } from './api'
import type { SystemSettings } from '../shared/api/db'

export type CategoryId = 'general' | 'network' | 'updates' | 'logging' | 'services' | 'danger'

export interface Category {
  id: CategoryId
  label: string
  blurb: string
}

export const CATEGORIES: Category[] = [
  { id: 'general', label: 'General', blurb: 'Identity, locale, login banner' },
  { id: 'network', label: 'Network', blurb: 'SSH, remote access, limits' },
  { id: 'updates', label: 'Updates', blurb: 'Channel and unattended upgrades' },
  { id: 'logging', label: 'Logging', blurb: 'Verbosity and the journal' },
  { id: 'services', label: 'Services', blurb: 'Daemons and their state' },
  { id: 'danger', label: 'Danger zone', blurb: 'Irreversible operations' },
]

export type SettingKey = keyof SystemSettings

/**
 * Which panel owns each field. Needed because a rejected field can live in a
 * category the user is not looking at — the console has to reveal it before
 * it can put focus on it.
 */
export const FIELD_CATEGORY: Record<SettingKey, CategoryId> = {
  hostname: 'general',
  timezone: 'general',
  motd: 'general',
  transcodeThreads: 'general',
  sshPort: 'network',
  sshPasswordAuth: 'network',
  remoteAccess: 'network',
  maxUploadMB: 'network',
  automaticUpdates: 'updates',
  updateChannel: 'updates',
  telemetry: 'updates',
  logLevel: 'logging',
}

const SETTING_KEYS = Object.keys(FIELD_CATEGORY) as SettingKey[]

/** DOM id of a field's control, so an error handler can focus it by name. */
export const fieldDomId = (name: string): string => `cfg-${name}`

export const TIMEZONES = ['UTC', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo']

export const FACTORY_DEFAULTS: SystemSettings = {
  hostname: 'mediavault',
  timezone: 'UTC',
  sshPort: 22,
  sshPasswordAuth: false,
  automaticUpdates: true,
  updateChannel: 'stable',
  telemetry: false,
  logLevel: 'info',
  maxUploadMB: 512,
  transcodeThreads: 4,
  remoteAccess: true,
  motd: 'Authorized access only.',
}

/**
 * The API rejects an out-of-range port with `422 { error, field }`, but the
 * shared fetch client collapses an error body to `new Error(body.error)` and
 * drops everything else — so the machine-readable `field` never reaches us.
 * Recovering it from the message is the only option that does not change
 * shared code.
 */
export function serverErrorField(message: string): SettingKey | null {
  return SETTING_KEYS.find((key) => message.includes(key)) ?? null
}

export interface ServerFieldError {
  field: SettingKey
  message: string
  /** Bumped per failure so two identical rejections still both reveal+focus. */
  attempt: number
}

export function useSettingsForm(initial: SystemSettings) {
  const save = useSaveSettings()
  const [serverError, setServerError] = useState<ServerFieldError | null>(null)

  const form = useForm({
    defaultValues: initial,
    validators: {
      /**
       * The PUT runs as the submit *validator*, not in the submit handler: a
       * validator's return value is the only thing TanStack Form will spread
       * onto individual fields, and a 422 has to become a field error.
       */
      onSubmitAsync: async ({ value }) => {
        try {
          await save.mutateAsync(value)
          return null
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Save failed'
          const field = serverErrorField(message)
          if (!field) return { form: message, fields: {} }
          setServerError((previous) => ({
            field,
            message,
            attempt: (previous?.attempt ?? 0) + 1,
          }))
          const fields: Partial<Record<SettingKey, string>> = { [field]: message }
          return { form: message, fields }
        }
      },
    },
    onSubmit: ({ value, formApi }) => {
      // Adopting the just-saved values as the new defaults is what clears the
      // dirty flag; there is no separate "mark clean" call.
      setServerError(null)
      formApi.reset(value)
    },
  })

  return { form, serverError }
}

export type SettingsForm = ReturnType<typeof useSettingsForm>['form']
