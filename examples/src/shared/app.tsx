/**
 * Shared app shell for the data-driven examples.
 *
 * Every "real app" example mounts through here so the wiring is identical
 * between a dev page and a test: one QueryClient, one spatial navigation
 * instance, and the mock API already running.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SpatialNavigationProvider } from 'spatial-nav-css/react'
import type { ReactNode } from 'react'
import type { SpatialNavigationOptions } from 'spatial-nav-css'

/**
 * Retries and refetch-on-focus make tests slow and non-deterministic without
 * adding realism, so they are off everywhere; the cache itself stays real.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5_000 },
      mutations: { retry: false },
    },
  })
}

export interface AppShellProps {
  children: ReactNode
  client?: QueryClient
  /** Engine options — tests inject deterministic rects and no input adapters. */
  nav?: SpatialNavigationOptions
}

export function AppShell({ children, client, nav }: AppShellProps) {
  const queryClient = client ?? createQueryClient()
  return (
    // Deliberately no `autofocus`: these screens are data-driven, so at
    // start() the only focusable things are page chrome. Each app calls
    // nav.claimFocus() when its content arrives instead — see
    // shared/useContentFocus.ts and docs/recipes.md.
    <QueryClientProvider client={queryClient}>
      <SpatialNavigationProvider {...nav}>{children}</SpatialNavigationProvider>
    </QueryClientProvider>
  )
}
