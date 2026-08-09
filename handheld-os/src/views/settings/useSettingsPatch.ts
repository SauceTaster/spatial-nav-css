/**
 * Optimistic settings edits — the same pattern the quick-access menu uses, with
 * the one thing a full settings screen additionally needs: the server's verdict
 * attached to a *field*.
 *
 * Deliberately a copy of the QAM's hook rather than an import from it. The QAM
 * is an overlay component; a view reaching into it for a hook would couple two
 * shell layers that otherwise never touch, forever. The duplicated part is four
 * lines of cache juggling.
 *
 * Why optimistic at all: a brightness step that waits for a round trip feels
 * like a broken device. Why a rollback: the firmware validates (TDP range,
 * non-empty device name) and a rejected value must not linger on screen.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { OsError, osMutations, osQueries } from '../../services/api'
import type { DeviceSettings } from '../../services/device'

export interface SettingsFieldError {
  /** The DeviceSettings key the server blamed, when it named one. */
  field?: string
  message: string
}

const SETTINGS_KEY = ['settings'] as const

export function useSettingsPatch() {
  const client = useQueryClient()
  const settings = useQuery(osQueries.settings())
  const [fieldError, setFieldError] = useState<SettingsFieldError | null>(null)

  const mutation = useMutation({
    mutationFn: (patch: Partial<DeviceSettings>) => osMutations.saveSettings(patch),
    onMutate: async (patch) => {
      setFieldError(null)
      await client.cancelQueries({ queryKey: SETTINGS_KEY })
      const previous = client.getQueryData<DeviceSettings>(SETTINGS_KEY)
      if (previous) client.setQueryData<DeviceSettings>(SETTINGS_KEY, { ...previous, ...patch })
      return { previous }
    },
    onError: (error, _patch, context) => {
      if (context?.previous) client.setQueryData(SETTINGS_KEY, context.previous)
      setFieldError({
        field: error instanceof OsError ? error.field : undefined,
        message: error.message,
      })
    },
    onSettled: () => client.invalidateQueries({ queryKey: SETTINGS_KEY }),
  })

  return {
    settings: settings.data,
    pending: settings.isPending,
    saving: mutation.isPending,
    patch: mutation.mutate,
    fieldError,
    /** Local validation ("that isn't a number") reports through the same slot. */
    setFieldError,
  }
}
