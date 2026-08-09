/** Data layer for the config console: query hooks + service/settings mutations. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mutations, queries } from '../shared/api/client'
import type { LogEntry, ServiceStatus, SystemSettings } from '../shared/api/db'

export type LogLevel = LogEntry['level']
export type LogFilter = LogLevel | 'all'
export type ServiceAction = 'start' | 'stop' | 'restart'

interface ServiceList {
  items: ServiceStatus[]
}

export function useSettings() {
  return useQuery(queries.settings())
}

export function useServices() {
  return useQuery(queries.services())
}

export function useLogs(level: LogFilter) {
  return useQuery({
    ...queries.logs(level === 'all' ? undefined : level),
    // Keep the previous page of lines mounted while the next filter loads:
    // an emptied list would delete the row the user is standing on.
    placeholderData: (previous: { items: LogEntry[] } | undefined) => previous,
  })
}

export function useSaveSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<SystemSettings>) => mutations.saveSettings(patch),
    // The PUT answers with the whole saved record, so seed the cache instead
    // of invalidating — no refetch, no second render pass under the form.
    onSuccess: (saved) => client.setQueryData(queries.settings().queryKey, saved),
  })
}

export function useServiceAction() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: ServiceAction }) =>
      mutations.serviceAction(id, action),
    // Patch the one row rather than invalidating the list: the table keeps its
    // identity, React reuses the row's DOM, and the focused button survives.
    onSuccess: (updated) =>
      client.setQueryData<ServiceList>(queries.services().queryKey, (list) =>
        list
          ? { items: list.items.map((service) => (service.id === updated.id ? updated : service)) }
          : list,
      ),
  })
}

export function useStopAllServices() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await mutations.serviceAction(id, 'stop')
    },
    onSuccess: () => client.invalidateQueries({ queryKey: queries.services().queryKey }),
  })
}
