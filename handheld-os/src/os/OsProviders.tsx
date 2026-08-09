/**
 * The two providers the whole shell needs: the query cache and the navigation
 * engine. Split out from main.tsx so tests and Storybook mount the identical
 * environment.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SpatialNavigationProvider } from 'spatial-nav-css/react'
import { keyboardAdapter, gamepadAdapter, type SpatialNavigationOptions } from 'spatial-nav-css'
import { useState, type ReactNode } from 'react'

export function createOsQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // A handheld is offline half the time and the "server" is local: retries
      // buy nothing and make failures slow to surface.
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: 3_000 },
      mutations: { retry: false },
    },
  })
}

/**
 * The device's button map. A handheld has no Tab key and no mouse, so the
 * keyboard mapping here is really a *development* mapping that mirrors the
 * physical controls: arrows for the D-pad, Enter for A, Escape/Backspace for
 * B, Q for the quick-access button.
 */
export const osNavOptions: SpatialNavigationOptions = {
  adapters: [
    keyboardAdapter({
      keymap: {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        Enter: 'activate',
        ' ': 'activate',
        Escape: 'back',
        Backspace: 'back',
      },
    }),
    gamepadAdapter(),
  ],
  // Smooth scrolling fights a fast section jump: by the time the animation
  // lands the user has already moved twice more.
  scrollBehavior: 'instant',
}

export function OsProviders({
  children,
  client,
  nav,
}: {
  children: ReactNode
  client?: QueryClient
  nav?: SpatialNavigationOptions
}) {
  const [fallbackClient] = useState(createOsQueryClient)
  return (
    <QueryClientProvider client={client ?? fallbackClient}>
      <SpatialNavigationProvider {...(nav ?? osNavOptions)}>{children}</SpatialNavigationProvider>
    </QueryClientProvider>
  )
}
