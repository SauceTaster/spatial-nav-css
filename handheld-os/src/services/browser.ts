/** Service-worker mock for the running app and Storybook. */
import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)

let started: Promise<unknown> | null = null

/** Idempotent — the app, Storybook and HMR all call it. */
export function startOsServices(): Promise<unknown> {
  started ??= worker.start({ quiet: true, onUnhandledRequest: 'bypass' })
  return started
}
