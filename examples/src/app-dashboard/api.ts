/** Data layer for the ops dashboard: one hook per panel + the service action. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mutations, queries } from '../shared/api/client'
import type { ServiceStatus } from '../shared/api/db'

export function useMetrics() {
  return useQuery(queries.metrics())
}

export function useServices() {
  return useQuery(queries.services())
}

export function useStorage() {
  return useQuery(queries.storage())
}

/** The grid's dataset: all 48 rows in one page, sorted/filtered client-side. */
export function useCatalog() {
  return useQuery(queries.games())
}

export function useEventLog() {
  return useQuery(queries.logs())
}

type ServiceAction = 'start' | 'stop' | 'restart'

/**
 * Optimistic service action. The button that started it re-renders with a new
 * label before the request settles, which is the exact moment a focus system
 * tends to drop the highlight — pinned in dashboard.test.tsx.
 */
export function useServiceAction() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: ServiceAction }) =>
      mutations.serviceAction(id, action),
    onMutate: async ({ id, action }) => {
      await client.cancelQueries({ queryKey: ['services'] })
      const snapshot = client.getQueryData<{ items: ServiceStatus[] }>(['services'])
      if (snapshot) {
        client.setQueryData<{ items: ServiceStatus[] }>(['services'], {
          items: snapshot.items.map((service) =>
            service.id === id
              ? { ...service, state: action === 'stop' ? 'stopped' : 'running' }
              : service,
          ),
        })
      }
      return { snapshot }
    },
    onError: (_error, _vars, context) => {
      if (context?.snapshot) client.setQueryData(['services'], context.snapshot)
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['services'] }),
  })
}
