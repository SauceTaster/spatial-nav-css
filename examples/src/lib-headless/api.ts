/** Data layer: the profile list both halves render, plus one mutation. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mutations, queries } from '../shared/api/client'
import type { MediaUser } from '../shared/api/db'

export function useMediaUsers() {
  return useQuery(queries.mediaUsers())
}

/**
 * Toggling access re-renders every widget that shows the profile — including
 * the one holding spatial focus, which is the point: a headless library's
 * focus manager and the engine both have to survive that render.
 */
export function useSetAccess() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      mutations.updateUser(id, { active }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['media-users'] }),
  })
}

export type { MediaUser }

/** Both halves render the same data and report into the same status line. */
export interface HalfProps {
  users: MediaUser[]
  pending: boolean
  onLog: (message: string) => void
}
