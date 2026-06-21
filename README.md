# spatial-nav-css

[![CI](https://github.com/SauceTaster/spatial-nav-css/actions/workflows/ci.yml/badge.svg)](https://github.com/SauceTaster/spatial-nav-css/actions/workflows/ci.yml)
[![CodeQL](https://github.com/SauceTaster/spatial-nav-css/actions/workflows/codeql.yml/badge.svg)](https://github.com/SauceTaster/spatial-nav-css/actions/workflows/codeql.yml)
[![npm](https://img.shields.io/npm/v/spatial-nav-css)](https://www.npmjs.com/package/spatial-nav-css)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![zero runtime deps](https://img.shields.io/badge/runtime%20deps-0-brightgreen)

Spatial (directional) navigation for web UIs, configured through CSS, driven by
any input device — in the spirit of **Valve's Panorama UI** (Dota 2 / CS2 /
Steam Deck) and the **discontinued W3C CSS Spatial Navigation Level 1** spec
(`css-nav-1`, later parked in the WICG and abandoned, alongside FOSS efforts
like `js-spatial-navigation` and the WICG polyfill).

Press **right** and focus moves to the thing that is spatially to the right.
Works with keyboard, every gamepad the browser can see (XInput/DirectX, Steam
Input, DualSense, …), TV/IR remotes, and anything else you can write an
adapter for.

```
npm install        # then:
npm run build      # ESM + CJS + .d.ts into dist/
npm test           # vitest suite
npm run demo       # demo gallery at http://localhost:4173/demo/
```

The demo gallery opens with a **quick start** page (a live UI next to the
three steps of code that drive it) and a **production toolkit** page
(`spatialAlert`/`spatialConfirm` dialogs, long-press via
`spatial:activaterelease`, `autoRestoreFocus`, held-key throttling, the debug
overlay), then showcases the engine across UI archetypes: a Plex-style
**media center** (rails, settings modal, long-press tile removal), a retro
**emulator frontend**, a **VR panel** scene (3D transforms), a console
**controller-settings UI** with a live gamepad tester, the original
Steam-style launcher (press `D` for the debug overlay), a **virtualized
10,000-item list**, and the zero-framework web-components page. Every page is
one self-contained HTML file — View Source is the tutorial.

For **framework integrations** (React, Vue, Svelte, React Aria, Web Components)
and **real-world library remixes** (TanStack Table, ECharts, React Flow), see
[`examples/`](examples/) — a standalone package (its own `package.json`, so it
doesn't bloat the root install) where every example is both runnable
(`npm run dev`) and a regression test (`npm test`). It's also the canonical
reference for **making elements non-focusable**.

## Quick start

```ts
import { createSpatialNavigation } from 'spatial-nav-css'
import 'spatial-nav-css/css' // focus ring + theming variables

const nav = createSpatialNavigation({ autofocus: true })
nav.start()
```

That's it — keyboard arrows and any connected gamepad now move focus
spatially. Anything natively focusable participates; add `data-focusable` to
make non-interactive elements (cards, tiles) join in.

## Framework adapters

The core is framework-agnostic; thin idiomatic bindings ship as subpath
exports (React and Vue are optional peer dependencies; Svelte and the web
components need nothing):

| Import | What you get |
| --- | --- |
| `spatial-nav-css/react` | `<SpatialNavigationProvider>`, `useFocusable` → `{ref, focused}`, `<SpatialContainer>`, `useSpatialNavigation`, `useSpatialEvent` |
| `spatial-nav-css/react-aria` | react-aria-components interop: `spatialFocusable()`, `spatialZone()`, `useSpatialFocused()` — RAC collections become single spatial stops, no key double-handling |
| `spatial-nav-css/vue` | `SpatialNavigationPlugin`, `useFocusable` (reactive), `v-focusable`, `v-spatial-container` directives |
| `spatial-nav-css/svelte` | `use:focusable`, `use:spatialContainer` actions, `createSpatialNav` with a `focused` store (Svelte 3/4/5) |
| `spatial-nav-css/elements` | `<spatial-nav>` + `<spatial-container>` custom elements, fully declarative |
| `spatial-nav-css/dialogs` | `spatialAlert()` / `spatialConfirm()` — gamepad-navigable replacements for the native blocking dialogs |
| `spatial-nav-css/virtual` | `attachVirtualEdges()` — continue navigation past a virtualized list's mounted window (TanStack Virtual, react-window) |
| `spatial-nav-css/debug` | `attachDebugOverlay()` — paint the engine's view (focusables, zones, current focus) for debugging |

See [docs/frameworks.md](docs/frameworks.md) for full usage, including the
Angular/Solid/anything-else pattern.

## Documentation

- [docs/guide.md](docs/guide.md) — getting started & core concepts
- [docs/css-api.md](docs/css-api.md) — the complete spatial CSS reference
- [docs/js-api.md](docs/js-api.md) — the complete JS/TS API reference
- [docs/input-devices.md](docs/input-devices.md) — device matrix, Steam Input details, custom adapters (Steamworks, WebHID IR)
- [docs/frameworks.md](docs/frameworks.md) — React, Vue, Svelte, Web Components
- [docs/recipes.md](docs/recipes.md) — TV rails, launchers, modals, pagination, forms, virtualized lists
- [docs/edge-cases.md](docs/edge-cases.md) — behavior at the boundaries, each pinned by a test
- [docs/performance.md](docs/performance.md) — measured cost per keypress, V8 microbenchmarks, and the CI-pinned style-read budget
- [docs/virtualization.md](docs/virtualization.md) — TanStack Virtual (`spatial-nav-css/virtual` edge bridge) and React Aria Virtualizer, both test-pinned against the real libraries

## The spatial CSS surface

Everything is declarative. Each knob exists both as a **CSS custom property**
(participates in the cascade, media queries, themes) and a **data attribute**
(wins when both are set):

| CSS custom property | Data attribute | Meaning |
| --- | --- | --- |
| `--nav-up/down/left/right: "<selector>" \| none` | `data-nav-up/down/left/right` | Explicit override for one direction (`none` blocks it). Echoes the old CSS3-UI `nav-*` properties. |
| `--spatial-container: contain wrap remember` | `data-spatial-container="…"` | Marks a focus group. Tokens: `contain` traps focus inside, `wrap` wraps around edges, `remember` restores the last-focused child on re-entry. Bare value = plain group. |
| `--spatial-default-focus: auto` | `data-spatial-autofocus` | Preferred entry element of a container (and of the page for `focusFirst()`). |

```html
<nav data-spatial-container="remember">…sidebar…</nav>

<div class="carousel" data-spatial-container="wrap remember">
  <div class="card" data-focusable>…</div>
  …
</div>

<button data-nav-down="none">bottom of menu</button>
```

Or purely in CSS:

```css
.modal   { --spatial-container: contain; }
.carousel { --spatial-container: wrap remember; }
.carousel .card:first-child { --spatial-default-focus: auto; }
```

Theming variables for the focus ring live in [css/spatial.css](css/spatial.css)
(`--spatial-focus-ring-color`, `-width`, `-offset`, glow, etc.). Add
`.spatial-pop` for the Panorama-style scale-up on focus. `prefers-reduced-motion`
is respected for both the ring transition and smooth scrolling.

## Input devices

Adapters translate physical input into semantic intents
(`direction` / `activate` / `back`). Two ship in the box and cover more than
they appear to:

| Device | How it's covered |
| --- | --- |
| Xbox controllers (XInput — what "DirectX input" is on modern Windows) | `gamepadAdapter()` via the browser Gamepad API, standard mapping |
| Steam Input (Steam Deck, Big Picture, overlay browser, any rebinding) | Steam Input remaps to a standard gamepad *before* the page sees it — `gamepadAdapter()` just works, user bindings included |
| DualShock/DualSense, Switch Pro, generic HID pads | `gamepadAdapter()` |
| IR / TV remotes (webOS, Tizen, HbbTV, set-top boxes) | platforms deliver remote buttons as keyboard events — `keyboardAdapter()` ships the standard keycodes (37–40, 13, 461, 10009) |
| Keyboard | `keyboardAdapter()` (arrows, Enter, Escape; remappable) |
| Mouse / touch | native — the engine adopts focus from `focusin`, so clicking syncs spatial state |

```ts
import { createSpatialNavigation, keyboardAdapter, gamepadAdapter } from 'spatial-nav-css'

const nav = createSpatialNavigation({
  adapters: [
    keyboardAdapter({ keyCodeMap: { 10182: 'back' } }), // add a vendor key
    gamepadAdapter({ deadzone: 0.4, repeatIntervalMs: 100 }),
  ],
})
```

### Writing an adapter (future devices: Steamworks, dedicated IR, anything)

```ts
import type { InputAdapter } from 'spatial-nav-css'

export function steamworksAdapter(steam: SteamworksClient): InputAdapter {
  let timer: number | undefined
  return {
    id: 'steamworks',
    start(ctx) {
      // e.g. in Electron with steamworks.js: poll action sets and forward
      timer = window.setInterval(() => {
        const d = steam.input.getDigitalAction('menu_nav')
        if (d.up) ctx.dispatch({ type: 'direction', direction: 'up', repeat: false, source: 'steamworks' })
        if (steam.input.getDigitalAction('menu_select').pressed)
          ctx.dispatch({ type: 'activate', source: 'steamworks' })
      }, 16)
    },
    stop() { clearInterval(timer) },
  }
}

nav.addAdapter(steamworksAdapter(steam))
```

Use the same shape for a raw IR receiver (WebHID/WebUSB/serial), Kinect, MIDI
pads — anything that can say "up happened".

## Events

All bubble from the focused element, so one `document` listener works:

| Event | Cancelable | Fired when |
| --- | --- | --- |
| `spatial:beforefocus` | yes — vetoes the move | before focus moves to a target |
| `spatial:focus` | — | after focus moved (`detail: { direction, from, source }`) |
| `spatial:nofocustarget` | — | navigation hit the edge — hook to paginate / lazy-load |
| `spatial:activate` | yes — suppresses the synthetic click | A button / Enter / OK pressed |
| `spatial:activaterelease` | — | activate control released (`detail.durationMs` = hold time, for long-press) |
| `spatial:back` | yes — `preventDefault()` = "handled" | B button / Escape / remote BACK |

## Programmatic API

```ts
nav.navigate('down')      // move focus; true if it moved
nav.focus('#search')      // focus element or selector
nav.focusFirst()
nav.getFocused()
nav.activate()
nav.addAdapter(adapter); nav.removeAdapter(adapter)
nav.stop(); nav.destroy()
nav.engine                // SpatialEngine for advanced use (findTarget, …)
```

Low-level pure functions (`findBestCandidate`, `distanceScore`,
`classifyDirection`, `wrapOrigin`, …) are exported for testing and for
building your own engine on top.

## How targets are chosen

A simplified, predictable take on the `css-nav-1` distance function:

```
score = euclideanGap                       distance between closest edges
      + spanOffset × 5                     off-axis travel actually needed
      + centerOffset × 0.1                 mild "most in line" tie-break
      + (aligned ? 0 : 1e6)                row/column grouping
```

`spanOffset` measures drift to the candidate's *span* on the orthogonal
axis — zero when the origin sits laterally inside it — so wide zones (a
scrolled carousel band) aren't penalized for their breadth.

"Aligned" means the candidate overlaps the origin's projection on the axis
orthogonal to travel — i.e. it's in the same row (for ←/→) or column (for
↑/↓) — by at least 20% of the origin's extent (`alignedOverlapRatio`, so a
1px graze doesn't count as "same row"). Aligned candidates always beat
misaligned ones, which is how console UIs feel: pressing right stays in the
row, even if a diagonal neighbor is closer. The weights are tunable via the
`scoring` option.

Search is **zone-scoped**, the way css-nav-1 scoped it: it starts in the
innermost container and escalates outward through non-`contain` containers.
At each level, sibling containers compete as single candidates — one rect per
zone (a sidebar, a header, a carousel; scrollable zones count their full
content extent as a band). When a zone wins, the search descends into it.
This is what keeps "right from the sidebar" landing in the content area
instead of on whatever stray element is diagonally nearest. Entering a
container honors its `remember` memory, then its declared default focus, then
raw geometry.

## Project layout

```
src/core/geometry.ts   pure candidate search & scoring (css-nav-1-inspired)
src/core/config.ts     the spatial-CSS reader (custom props + data attrs)
src/core/engine.ts     focus engine: zones, containers, memory, wrap, events
src/core/dom.ts        focusability & visibility
src/input/*            adapter contract, keyboard, gamepad, manager
src/events.ts          spatial:* DOM events
src/react/             React provider, hooks, components
src/vue/               Vue plugin, composables, directives
src/svelte/            Svelte actions + stores (no svelte dependency)
src/elements/          <spatial-nav> / <spatial-container> custom elements
css/spatial.css        focus ring, theming variables, @property registrations
docs/                  guide, CSS & JS reference, devices, recipes, edge cases
demo/                  demo gallery: quickstart, toolkit, media center, … (npm run demo)
tests/                 vitest suite (190+ tests: geometry, engine, config,
                       inputs, adapters, virtualization, integration,
                       weird-DOM/CSS edge cases, perf budgets)
```

## Project infrastructure

Tooling mirrors what the major OSS libraries (TanStack et al.) run, sized
for a single-package repo:

- **Lint + format**: [Biome](https://biomejs.dev) — one fast tool, enforced
  in CI (`npm run lint`).
- **Tests**: Vitest (jsdom, injectable geometry), 190+ tests, V8 coverage
  with enforced thresholds (`npm run test:coverage`).
- **Package correctness**: `publint` and `@arethetypeswrong/cli` validate
  the packed tarball's exports/types across node10/node16/bundler
  resolution on every CI run.
- **CI**: GitHub Actions — Biome, typecheck, build, package checks, and the
  test matrix on Node 20/22/24.
- **SAST/SCA**: CodeQL (`security-and-quality`, weekly + per-PR),
  dependency-review on PRs, Dependabot for npm + Actions.
- **Releases**: Changesets — merging the auto-generated "Version Packages"
  PR publishes to npm with provenance. See [CONTRIBUTING.md](CONTRIBUTING.md).
- `npm run ci` reproduces the full pipeline locally.

## Notes & roadmap

- **Pointer harmony**: mouse clicks update spatial state automatically via
  `focusin`; no pointer adapter is needed.
- **Shadow DOM**: an engine rooted inside an open shadow root works (focus
  is resolved through `shadowRoot.activeElement`, pinned by test); piercing
  *across* shadow boundaries from an outer root is on the roadmap.
- **Steamworks action sets**: first-class adapter (via `steamworks.js` in
  Electron) is sketched above and slots into `InputAdapter` — planned.
- **WebHID IR receivers**: same story — the adapter contract is the extension
  point.

MIT licensed.
