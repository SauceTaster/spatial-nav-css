// Vitest setup: jsdom DOM matchers + the browser APIs RAC / React Flow expect
// but jsdom doesn't implement.
import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './api/node'
import { resetDb } from './api/db'
import { setLatency } from './api/handlers'

// The same MSW handlers the dev pages run behind a service worker serve the
// tests here, so components exercise their real fetch → cache → render path.
// Zero latency keeps queries resolving on the first flush.
beforeAll(() => {
  setLatency(0)
  server.listen({ onUnhandledRequest: 'bypass' })
})
afterEach(() => {
  server.resetHandlers()
  resetDb()
})
afterAll(() => server.close())

const win = window as unknown as Record<string, unknown>

if (typeof window.matchMedia !== 'function') {
  win.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}

// jsdom has no canvas backend; calling getContext logs a noisy "not
// implemented" notice. No test renders pixels, so stub it to null — the
// ECharts example's guard then cleanly skips init under jsdom.
;(HTMLCanvasElement.prototype as unknown as { getContext: () => null }).getContext = () => null

// Radix/Ark/Headless UI listboxes call scrollIntoView when they open; jsdom
// does not implement it and the throw unmounts the popup mid-render.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {}
}

// floating-ui's autoUpdate (Headless UI anchored popovers) observes
// intersection; jsdom has no implementation and the throw surfaces as an
// unhandled rejection rather than a useful failure.
if (!('IntersectionObserver' in globalThis)) {
  ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
}

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
