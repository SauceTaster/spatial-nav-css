/** Service-worker mock for the dev pages. Node/test wiring lives in node.ts. */
import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)

let started: Promise<unknown> | null = null

/**
 * Idempotent: several example pages call this at module scope, and Vite HMR
 * re-runs modules, but the worker must only register once.
 */
export function startMockApi(): Promise<unknown> {
  started ??= worker.start({
    quiet: true,
    // Vite serves its own assets and HMR socket — only intercept /api.
    onUnhandledRequest: 'bypass',
  })
  return started
}
