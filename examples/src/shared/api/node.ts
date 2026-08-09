/** Node/jsdom mock server for the headless tests. See browser.ts for pages. */
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
