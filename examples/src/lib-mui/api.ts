/** Data layer for the MUI admin screen: accounts + system settings. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mutations, queries } from '../shared/api/client'
import type { MediaUser, SystemSettings } from '../shared/api/db'

export function useAccounts() {
  return useQuery(queries.mediaUsers())
}

export function useSettings() {
  return useQuery(queries.settings())
}

/**
 * Optimistic account patch. The row's Select and Switch are controlled by this
 * cache, so every change re-renders the control that currently holds focus —
 * the case where an integration built on component-registration (rather than
 * live geometry) loses the focused element.
 */
export function useUpdateAccount() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<MediaUser> }) =>
      mutations.updateUser(id, patch),
    onMutate: async ({ id, patch }) => {
      await client.cancelQueries({ queryKey: ['media-users'] })
      const previous = client.getQueryData<{ items: MediaUser[] }>(['media-users'])
      if (previous) {
        client.setQueryData<{ items: MediaUser[] }>(['media-users'], {
          items: previous.items.map((user) => (user.id === id ? { ...user, ...patch } : user)),
        })
      }
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(['media-users'], context.previous)
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['media-users'] }),
  })
}

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
