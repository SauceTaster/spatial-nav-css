/** @jsxImportSource solid-js */
/**
 * Solid example — the documented "no dedicated adapter" pattern.
 *
 * Surfaces:
 *  - ONE core createSpatialNavigation() tied to the client mount boundary:
 *    created in onMount, destroyed in onCleanup — the entire lifecycle story
 *  - declarative config the engine reads straight from rendered markup:
 *    data-spatial-container zones, data-spatial-autofocus, data-focusable
 *  - useSpatialFocused(): a ~10-line signal fed by the bubbling
 *    'spatial:focus' DOM event — the whole idiomatic binding, no adapter
 *    package needed
 *  - the EXCLUSION gotcha: a plain <div> is invisible to the engine unless it
 *    opts in with data-focusable; native buttons are stops for free
 *
 * `options`/`onReady` props let the test inject deterministic engine options
 * and grab the nav handle; the browser entry uses the defaults.
 */
import { createSignal, onCleanup, onMount } from 'solid-js'
import { createSpatialNavigation } from 'spatial-nav-css'
import type { SpatialEvent, SpatialNavigation, SpatialNavigationOptions } from 'spatial-nav-css'

/** Spatial focus as a Solid signal — the engine's event stream is the API. */
function useSpatialFocused() {
  const [focused, setFocused] = createSignal<{ el: HTMLElement; source: string } | null>(null)
  onMount(() => {
    // 'spatial:focus' bubbles from every engine move; e.target is the stop.
    const onFocus = (e: Event) =>
      setFocused({ el: e.target as HTMLElement, source: (e as SpatialEvent).detail.source })
    document.addEventListener('spatial:focus', onFocus)
    onCleanup(() => document.removeEventListener('spatial:focus', onFocus))
  })
  return focused
}

const CARDS = ['Garnet', 'Halite', 'Iolite', 'Jasper', 'Kyanite', 'Larimar'].map((label, i) => ({
  id: `card-${i}`,
  label,
}))

export function SolidExample(props: {
  options?: SpatialNavigationOptions
  onReady?: (nav: SpatialNavigation) => void
}) {
  const focused = useSpatialFocused()
  const focusedId = () => focused()?.el.id
  const status = () => {
    const f = focused()
    return f ? `focused #${f.el.id} via ${f.source}` : 'nothing focused yet'
  }

  onMount(() => {
    // The one client-mount instance — the data attributes above do the rest.
    const nav = createSpatialNavigation(props.options ?? { autofocus: true })
    nav.start()
    props.onReady?.(nav)
    onCleanup(() => nav.destroy())
  })

  return (
    <div class="ex-body" style="grid-template-columns:200px 1fr;align-items:start">
      <nav class="ex-panel" data-spatial-container="wrap remember" aria-label="Sections">
        <h2>Menu — wrap + remember</h2>
        <p class="hint">
          Plain markup: <code>data-spatial-container="wrap remember"</code> on the zone,{' '}
          <code>data-spatial-autofocus</code> on Home. The column wraps vertically; re-entering the
          menu restores its last stop.
        </p>
        <div class="ex-row" style="flex-direction:column;align-items:stretch">
          <button class="btn" id="menu-home" data-spatial-autofocus="">🏠 Home</button>
          <button class="btn" id="menu-library">📚 Library</button>
          <button class="btn" id="menu-settings">⚙ Settings</button>
        </div>
      </nav>

      {/* No wrap here: a wrapping grid would trap left-presses in the row
          instead of exiting to the menu. */}
      <section class="ex-panel" data-spatial-container="remember">
        <h2>Cards — a remember zone, and the focus signal</h2>
        <p class="hint">
          Buttons are stops for free; the Promo tile is a <code>&lt;div&gt;</code> opted in with{' '}
          <code>data-focusable</code>; the hatched <code>&lt;div&gt;</code> has no hook — never a
          stop. The status line is a Solid signal fed by <code>spatial:focus</code>.
        </p>
        <div class="ex-grid">
          {CARDS.map((c) => (
            <button class="tile" id={c.id} data-focused={focusedId() === c.id ? 'true' : 'false'}>
              {c.label}
              <span class="tag">{focusedId() === c.id ? '◉ focused' : 'card'}</span>
            </button>
          ))}
          <div class="tile" id="promo" data-focusable="">
            Promo
            <span class="tag">a div opted in via data-focusable</span>
          </div>
          <div class="tile decoration" id="decoration">
            <span class="tag">decorative — not focusable</span>
          </div>
        </div>
        <p class="status" id="status">{status()}</p>
      </section>
    </div>
  )
}
