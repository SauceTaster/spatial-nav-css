/** Data layer for the Radix settings screen: settings + services. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mutations, queries } from '../shared/api/client'
import type { SystemSettings } from '../shared/api/db'

export function useSettings() {
  return useQuery(queries.settings())
}

export function useServices() {
  return useQuery(queries.services())
}

/**
 * Optimistic settings patch. Radix's Switch and Select are controlled by this
 * cache, so a toggle re-renders the focused control immediately — the case
 * where a naive integration loses spatial focus.
 */
export function useSaveSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<SystemSettings>) => mutations.saveSettings(patch),
    onMutate: async (patch: Partial<SystemSettings>) => {
      await client.cancelQueries({ queryKey: ['settings'] })
      const previous = client.getQueryData<SystemSettings>(['settings'])
      if (previous) client.setQueryData<SystemSettings>(['settings'], { ...previous, ...patch })
      return { previous }
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) client.setQueryData(['settings'], context.previous)
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['settings'] }),
  })
}

export function useServiceAction() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'start' | 'stop' | 'restart' }) =>
      mutations.serviceAction(id, action),
    onSettled: () => client.invalidateQueries({ queryKey: ['services'] }),
  })
}
