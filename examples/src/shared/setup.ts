// Vitest setup: jsdom DOM matchers + the browser APIs RAC / React Flow expect
// but jsdom doesn't implement.
import '@testing-library/jest-dom/vitest'

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

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
