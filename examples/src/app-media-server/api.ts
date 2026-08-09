/**
 * Data layer for the media-server admin screen: four read queries and three
 * mutations. Query keys come from the shared client's `queryOptions` objects
 * rather than being retyped here, so a key change can't silently desync the
 * optimistic writers from the readers.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mutations, queries } from '../shared/api/client'
import type { MediaUser } from '../shared/api/db'

export function useLibraries() {
  return useQuery(queries.libraries())
}

export function useSessions() {
  return useQuery(queries.sessions())
}

export function useMediaUsers() {
  return useQuery(queries.mediaUsers())
}

export function useStoragePools() {
  return useQuery(queries.storage())
}

/**
 * Scanning is optimistic: the card the user is standing on has to change the
 * moment they press A, not a round trip later. Focus stays on the button
 * because the element identity survives the re-render.
 */
export function useScanLibrary() {
  const client = useQueryClient()
  const key = queries.libraries().queryKey
  return useMutation({
    mutationFn: (id: string) => mutations.scanLibrary(id),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: key })
      const snapshot = client.getQueryData(key)
      client.setQueryData(key, (current) =>
        current
          ? { items: current.items.map((lib) => (lib.id === id ? { ...lib, scanning: true } : lib)) }
          : current,
      )
      return { snapshot }
    },
    onError: (_error, _id, context) => {
      if (context?.snapshot) client.setQueryData(key, context.snapshot)
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  })
}

/**
 * Stopping a stream is deliberately *not* optimistic. Yanking the row out
 * before the server agrees would destroy the focused element on a request that
 * might still fail; letting the row survive until the response lands keeps the
 * failure case honest (and the success case still re-renders in one step).
 */
export function useStopSession() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => mutations.stopSession(id),
    onSuccess: () => client.invalidateQueries({ queryKey: queries.sessions().queryKey }),
  })
}

/** Optimistic row patch — the control that triggered it must not blink. */
export function useUpdateUser() {
  const client = useQueryClient()
  const key = queries.mediaUsers().queryKey
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<MediaUser> }) =>
      mutations.updateUser(id, patch),
    onMutate: async ({ id, patch }) => {
      await client.cancelQueries({ queryKey: key })
      const snapshot = client.getQueryData(key)
      client.setQueryData(key, (current) =>
        current
          ? { items: current.items.map((user) => (user.id === id ? { ...user, ...patch } : user)) }
          : current,
      )
      return { snapshot }
    },
    onError: (_error, _vars, context) => {
      if (context?.snapshot) client.setQueryData(key, context.snapshot)
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  })
}
