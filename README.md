# spatial-nav-css

[![CI](https://github.com/SauceTaster/spatial-nav-css/actions/workflows/ci.yml/badge.svg)](https://github.com/SauceTaster/spatial-nav-css/actions/workflows/ci.yml)
[![CodeQL](https://github.com/SauceTaster/spatial-nav-css/actions/workflows/codeql.yml/badge.svg)](https://github.com/SauceTaster/spatial-nav-css/actions/workflows/codeql.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![zero runtime deps](https://img.shields.io/badge/runtime%20deps-0-brightgreen)

> **Pre-release:** the source is public, but `spatial-nav-css` has not yet
> been published to npm. The package-name imports below describe the intended
> first-release surface; evaluate the library from a reviewed repository clone
> until the initial release checklist is complete.

Spatial (directional) navigation for web UIs, configured through CSS and driven
by pluggable input adapters. Its interaction model is inspired by **Valve's
Panorama UI** in Dota 2 and Counter-Strike and by the
**[W3C CSS Spatial Navigation Level 1 Working Draft](https://www.w3.org/TR/css-nav-1/)**
(`css-nav-1`, last published in 2019 and not broadly implemented by browsers).
This is an independent JavaScript library, not a standards polyfill or a
Panorama compatibility layer.

Press **right** and focus moves to the thing that is spatially to the right.
The built-in adapters cover keyboards, browser-exposed standard-mapping
gamepads, and common TV-remote key events. The adapter interface supports
host-specific input such as Steamworks actions, dedicated IR hardware, or
other devices.

The supported repository-tooling environment is Node.js 22 or newer with the
`packageManager`-declared npm version. From a repository clone:

```sh
npm ci             # then:
npm run build      # ESM + CJS + .d.ts into dist/
npm test           # vitest suite
npm run demo       # demo gallery at http://localhost:4173/demo/
```

The demo gallery opens with a **quick start** page (a live UI next to the
three steps of code that drive it) and an **advanced toolkit** page
(`spatialAlert`/`spatialConfirm` dialogs, long-press via
`spatial:activaterelease`, `autoRestoreFocus`, held-key throttling, the debug
overlay), then showcases the engine across UI archetypes: a Plex-style
**media center** (rails, settings modal, long-press tile removal), a retro
**emulator frontend**, a **VR panel** scene (3D transforms), a console
**controller-settings UI** with a live gamepad tester, the original
Steam-style launcher (press `D` for the debug overlay), a **virtualized
10,000-item list**, and the zero-framework web-components page. Each demo keeps
its app markup, styles, and script together in one HTML file and imports the
built library and shared stylesheet from adjacent files.

[`examples/`](https://github.com/SauceTaster/spatial-nav-css/tree/main/examples)
is a standalone package (its own `package.json`, so none of it lands in your
install) with three kinds of example. Every one is runnable with
`npm run dev` and is also a headless regression test (`npm test`).

- **Complete applications** — the ones to copy from. A game launcher, a media
  server admin console, a sysadmin settings screen, a TV guide, an ops
  dashboard, and a game pause screen: real component structure, with the
  network mocked by **MSW** and cached by **TanStack Query**, so you get
  genuine loading, refetch, optimistic-update, and validation-error states
  rather than hardcoded arrays.
- **Framework and library integrations** — React, Vue, Svelte, Solid, Lit,
  React Aria, Web Components; Radix UI, Material UI, Headless UI, Ark UI;
  TanStack Table/Virtual, ECharts, React Flow. The component-library pages
  document exactly what portals, focus traps, and roving tabindex require.
- **UI patterns** — an on-screen TV search keyboard, and the focus
  inclusion/exclusion cheat-sheet.

Because the MSW handlers run in both the browser and the tests, those examples
exercise the same data lifecycle in CI that you see on the page.

## Quick start

```ts
import { createSpatialNavigation } from 'spatial-nav-css'
import 'spatial-nav-css/css' // focus ring + theming variables

const nav = createSpatialNavigation({ autofocus: true })
nav.start()
```

No build tools? A minified IIFE bundle ships as `dist/spatial-nav.global.js`
(exposed via the `unpkg`/`jsdelivr` fields) with the framework-free surface —
core, `<spatial-nav>` elements, dialogs, virtual-list helper, and debug
overlay — on `window.SpatialNav`:

```html
<link rel="stylesheet" href="https://unpkg.com/spatial-nav-css/css/spatial.css">
<script src="https://unpkg.com/spatial-nav-css"></script>
<script>
  SpatialNav.createSpatialNavigation({ autofocus: true }).start()
</script>
```

Keyboard arrows and browser-exposed standard-mapping gamepads can now move
focus spatially. The default selector includes links, enabled form controls,
the first summary in a details element, elements carrying `contenteditable`
other than `false`, media elements with controls, iframes, and elements with a
non-negative `tabindex`. Add `data-focusable` for an intentional spatial
stop, or set `focusableSelector` when your application needs a different
definition.

### Accessibility and native semantics

Spatial focus is real DOM focus, but moving DOM focus does not by itself make a
custom control accessible. Prefer native `<button>`, `<a>`, and form controls
for actions. If a custom element is unavoidable, give it the appropriate
accessible name, role, state, and keyboard behavior, then test it with the
assistive technologies you support.

A non-native `data-focusable` element with no existing `tabindex` receives
`tabindex="-1"` on first spatial focus; it therefore does not automatically
join the Tab order. Add `tabindex="0"` only when the element should also be an
independent Tab stop. `contain` constrains this library's directional search
only—it is not a general focus trap and does not contain Tab, pointer, or
assistive-technology navigation. Use native modal dialogs or a complete
accessible modal pattern for modal UI, and use `inert`, `hidden`, disabling, or
removal for unavailable content.

`aria-disabled="true"` communicates state but does not disable native focus or
click behavior, and the engine does not exclude it like native `:disabled`.
An aria-disabled custom control must suppress its own activation while
preserving the expected focus and state semantics.

### Runtime expectations

The distributed JavaScript targets ES2020. Automated tests exercise DOM and
adapter contracts in jsdom, and Playwright covers selected real-browser
integration paths; the repository also includes a browser benchmark page. It
does not certify every TV browser, webview, controller, or
assistive-technology combination. For embedded and TV products, maintain a
tested matrix of exact OS/browser versions, input mappings, CSS `@property`
behavior, native `<dialog>` support, and target-device performance. The
data-attribute configuration path avoids reliance on `@property` for
non-inheritance.

## Framework adapters

The core is framework-agnostic; thin idiomatic bindings ship as subpath
exports (React and Vue are optional peer dependencies; Svelte and the web
components need nothing):

| Import | What you get |
| --- | --- |
| `spatial-nav-css/react` | `<SpatialNavigationProvider>`, `useFocusable` → `{ref, focused}`, `<SpatialContainer>`, `useSpatialNavigation`, `useSpatialEvent` |
| `spatial-nav-css/react-aria` | react-aria-components interop: `spatialFocusable()`, `spatialZone()`, `useSpatialFocused()` — helpers for coordinating tested roving-tabindex collection patterns; see framework caveats |
| `spatial-nav-css/vue` | `SpatialNavigationPlugin`, `useFocusable` with a reactive focused ref, `v-focusable`, `v-spatial-container` directives |
| `spatial-nav-css/svelte` | `use:focusable`, `use:spatialContainer` actions, `createSpatialNav` with a `focused` store (Svelte 3/4/5) |
| `spatial-nav-css/elements` | `<spatial-nav>` + `<spatial-container>` declarative light-DOM wrappers, after explicit registration |
| `spatial-nav-css/dialogs` | `spatialAlert()` / `spatialConfirm()` — asynchronous `<dialog>` helpers that work with a running navigation instance |
| `spatial-nav-css/virtual` | `attachVirtualEdges()` — bridge navigation past a virtualized list's mounted window |
| `spatial-nav-css/debug` | `attachDebugOverlay()` — paint approximate DOM boxes for focusables, containers, and the current spatial target |

The React provider is safe to render during SSR: it supplies a no-op facade on
the server and creates the live engine on the client. Navigation, focus, and
activate methods return `false`; `getFocused()` returns `null`; lifecycle and
adapter methods are no-ops; and `.engine` throws. `createSpatialNavigation()`
uses the same facade when called without a DOM; direct `new SpatialEngine()`
construction requires a DOM root.

See [docs/frameworks.md](docs/frameworks.md) for full usage, including the
Angular/Solid/anything-else pattern.

## Documentation

- [docs/guide.md](docs/guide.md) — getting started & core concepts
- [docs/css-api.md](docs/css-api.md) — spatial CSS reference
- [docs/js-api.md](docs/js-api.md) — JS/TS API reference
- [docs/input-devices.md](docs/input-devices.md) — device matrix, Steam Input details, custom adapters (Steamworks, WebHID IR)
- [docs/frameworks.md](docs/frameworks.md) — React, Vue, Svelte, Web Components
- [docs/recipes.md](docs/recipes.md) — TV rails, launchers, modals, pagination, forms, virtualized lists
- [docs/edge-cases.md](docs/edge-cases.md) — boundary behavior and runtime caveats
- [docs/performance.md](docs/performance.md) — benchmark methodology, limits, and the CI-pinned style-read budget
- [docs/virtualization.md](docs/virtualization.md) — TanStack Virtual (`spatial-nav-css/virtual` edge bridge) and React Aria Virtualizer, with headless contract tests and browser-testing caveats

Using an AI assistant? [llms.txt](llms.txt) is a compact, LLM-oriented index
of this library's API and docs, and [llms-full.txt](llms-full.txt) is the
complete documentation in one file (both ship in the npm package; regenerate
the latter with `npm run build:llms`). Agents working on this repository
should start at [AGENTS.md](AGENTS.md).

## The spatial CSS surface

Element-level navigation configuration is declarative. Each knob exists both
as a **CSS custom property**
(participates in the cascade, media queries, themes) and a **data attribute**.
Directional and container attributes replace the corresponding CSS value on
the same element; the boolean default-focus forms opt in when either is set:

| CSS custom property | Data attribute | Meaning |
| --- | --- | --- |
| `--nav-up/down/left/right: "<selector>" \| none` | `data-nav-up/down/left/right` | Explicit override for one direction (`none` blocks it). Echoes the experimental `nav-*` properties specified in [CSS Basic User Interface Level 4](https://www.w3.org/TR/css-ui-4/); historical implementation was limited and they are not interoperably available today. |
| `--spatial-container: contain wrap remember` | `data-spatial-container="…"` | Marks a focus group. Tokens: `contain` prevents geometric directional exit (explicit overrides can escape), `wrap` wraps around edges, `remember` restores the last-focused child on re-entry. Bare value = plain group. `contain` does not trap Tab, pointer, or assistive-technology focus. |
| `--spatial-default-focus: auto` | `data-spatial-autofocus` | Preferred entry element of a container (and of the page for `focusFirst()`). |

```html
<nav data-spatial-container="remember">…sidebar…</nav>

<div class="carousel" data-spatial-container="wrap remember">
  <button class="card" type="button">…</button>
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

Theming variables for the focus outline live in
[css/spatial.css](css/spatial.css) (`--spatial-focus-ring-color`, `-width`, and
`-offset`). The base sheet deliberately leaves application shadows, radii,
stacking, cursors, selection, and transitions alone. Add `.spatial-glow` for
the optional glow or `.spatial-pop` for the optional Panorama-style scale-up.
Reduced motion disables the pop; forced-colors mode uses the system highlight
and disables the optional glow. An explicit `scrollBehavior: 'smooth'` option
also degrades to `instant` under reduced motion; the default `auto` continues
to follow application CSS.

## Input devices

Adapters translate physical input into four user actions (`direction` /
`activate` / `release` / `back`) plus an `activationcancel` lifecycle intent
that abandons a held press when its release can no longer be observed. Through
the composed navigation path it produces `spatial:activatecancel` on the
original press target when that target remains in the root. Two adapters ship
in the box:

| Device | How it's covered |
| --- | --- |
| Xbox, DualShock/DualSense, Switch Pro, and other controllers | `gamepadAdapter()` when the browser exposes a [standard Gamepad mapping](https://w3c.github.io/gamepad/#remapping). Availability and mapping vary by browser, OS, host, permissions, and hardware. |
| Steam Input | `gamepadAdapter()` when [Steam Input](https://partner.steamgames.com/doc/features/steam_controller/steam_input_gamepad_emulation_bestpractices) is configured for gamepad/XInput emulation **and** the host browser exposes the virtual device through Gamepad API. Keyboard/mouse emulation and Steam Input API action sets need different integration. |
| IR / TV remotes | `keyboardAdapter()` when the platform delivers remote buttons as keyboard events. Defaults include arrows/OK, [LG webOS Back](https://webostv.developer.lge.com/develop/guides/magic-remote) (`461`), and [Samsung Tizen Return](https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html) (`10009`); test each target device and extend `keyCodeMap` as needed. |
| Keyboard | `keyboardAdapter()` (arrows, Enter, Escape, and `BrowserBack`, plus documented legacy remote/back codes; configurable) |
| Mouse / touch | no separate adapter when the interaction moves DOM focus onto a matching light-DOM stop; the engine adopts that `focusin` |

```ts
import { createSpatialNavigation, keyboardAdapter, gamepadAdapter } from 'spatial-nav-css'

const nav = createSpatialNavigation({
  adapters: [
    keyboardAdapter({ keyCodeMap: { 10182: 'back' } }), // add a vendor key
    gamepadAdapter({ deadzone: 0.4, repeatIntervalMs: 100 }),
  ],
})
```

### Writing an adapter (Steamworks, dedicated IR, custom hosts)

```ts
import type { InputAdapter } from 'spatial-nav-css'

export function steamworksAdapter(steam: SteamworksClient): InputAdapter {
  let stopPolling: (() => void) | undefined
  return {
    id: 'steamworks',
    start(ctx) {
      // Application pseudocode: poll an initialized action set and forward it.
      let previous = { up: false, select: false }
      let selectDownAt: number | null = null
      const timer = ctx.window.setInterval(() => {
        const current = steam.readMenuActions()
        if (current.up && !previous.up) {
          ctx.dispatch({ type: 'direction', direction: 'up', repeat: false, source: 'steamworks' })
        }
        if (current.select && !previous.select) {
          selectDownAt = ctx.window.performance.now()
          ctx.dispatch({ type: 'activate', source: 'steamworks' })
        }
        if (!current.select && previous.select && selectDownAt !== null) {
          ctx.dispatch({
            type: 'release',
            durationMs: ctx.window.performance.now() - selectDownAt,
            source: 'steamworks',
          })
          selectDownAt = null
        }
        previous = current
      }, 16)
      stopPolling = () => {
        ctx.window.clearInterval(timer)
        if (selectDownAt !== null) {
          ctx.dispatch({ type: 'activationcancel', source: 'steamworks' })
          selectDownAt = null
        }
      }
    },
    stop() { stopPolling?.(); stopPolling = undefined },
  }
}

nav.addAdapter(steamworksAdapter(steam))
```

`SteamworksClient`, `readMenuActions()`, and the action result fields above
are application-level pseudotypes, not exports from this library or claimed
`steamworks.js` APIs. Follow the selected binding's current initialization,
frame-pump, action-set, handle, and shutdown APIs. A production adapter should
also define held-direction repeat, edge-detect activate/back, emit `release`
with `durationMs` when long-press behavior is needed, emit
`activationcancel` if a held press becomes unobservable, and clean up host
resources in `stop()`. The same contract can wrap a permissioned raw IR
receiver, MIDI input, or another host that can produce navigation intents.

## Events

All events bubble and are composed, so one listener on the owning `document`
can observe them within that document. Their targets vary by event:

| Event | Target | Cancelable | Fired when |
| --- | --- | --- | --- |
| `spatial:beforefocus` | would-be target | yes — vetoes the move | before focus moves to a target |
| `spatial:focus` | new target | — | after focus moved (`detail: { direction, from, source }`) |
| `spatial:nofocustarget` | origin | — | navigation hit the edge — hook to paginate / lazy-load |
| `spatial:activate` | current spatial target | yes — suppresses the synthetic click | A button / Enter / OK pressed |
| `spatial:activaterelease` | matching press target through adapters; explicit/current spatial target for a direct engine call | — | activate control released (`detail.durationMs` = hold time, for long-press) |
| `spatial:activatecancel` | matching press target through adapters; explicit/current spatial target for a direct engine call | — | held activation ended without an observable release |
| `spatial:back` | current spatial target or document | yes — `preventDefault()` = "handled" | B button / Escape / remote BACK |

`spatial:activaterelease` is emitted only when the matching button-up remains
observable. Built-in keyboard/gamepad lifecycle loss emits
`spatial:activatecancel` on the original target when it is still connected
inside the engine root. Navigation stop/destroy also clears any remaining
pairings; a custom adapter must emit `activationcancel` from its own loss/stop
path to make that cancellation observable. Handle the cancel event to clear
transient pressed/hold UI; reserve release for completed hold UX.

## Programmatic API

```ts
nav.navigate('down')      // move focus; true if it moved
nav.focus('#search')      // focus element or selector
nav.focusFirst()
nav.getFocused()           // current spatial target (see note below)
nav.activate()             // activates that target
nav.addAdapter(adapter); nav.removeAdapter(adapter)
nav.stop(); nav.destroy()
nav.engine                // SpatialEngine for advanced use (findTarget, …)
```

`getFocused()` names the engine's current spatial target, not a strict alias
for `document.activeElement`. A valid last target persists when DOM focus falls
back to `<body>`/nothing, allowing direction or activation to resume there. It
returns `null` when real focus moves to another control/region, or when the
current target is disconnected, moved outside the root, disabled, or hidden.

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
1px graze doesn't count as "same row"). With the default finite `1e6`
misalignment penalty, aligned candidates dominate ordinary viewport-scale
layouts. That is a bias rather than an absolute guarantee: a sufficiently
distant aligned candidate can lose, and applications can tune or remove the
penalty through the `scoring` option.

Search uses a **library-specific zone model inspired by css-nav-1**: it starts
in the innermost explicitly marked spatial container and escalates outward
through non-`contain` containers.
At each level, sibling containers compete as single candidates — one rect per
zone (a sidebar, a header, a carousel; a zone rect unions its own box with its
mounted focusable descendants, including clipped ones). When a zone wins, the
search descends into it.
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
tests/                 vitest suite (239 tests: geometry, engine, config,
                       inputs, adapters, virtualization, integration,
                       weird-DOM/CSS edge cases, perf budgets)
```

## Project infrastructure

The release tooling is sized for a single-package public repository:

- **Lint + format**: [Biome](https://biomejs.dev) — one fast tool, enforced
  in CI (`npm run lint`).
- **Tests**: 239 automated unit/integration tests across 23 Vitest files
  (jsdom, injectable geometry), with enforced V8 coverage thresholds
  (`npm run test:coverage`).
- **Package correctness**: `publint` and `@arethetypeswrong/cli` validate
  the packed tarball's exports and types across multiple consumer-resolution
  profiles in the configured CI quality job.
- **CI**: GitHub Actions — Biome, typecheck, build, package checks, and the
  configured test matrix on Node 22/24/26.
- **SAST/SCA configuration**: CodeQL (`security-and-quality`, weekly +
  per-PR), dependency review on PRs, and Dependabot for npm + Actions are
  checked in. Repository-level prerequisites are tracked in
  [RELEASE_CHECKLIST.md](https://github.com/SauceTaster/spatial-nav-css/blob/main/RELEASE_CHECKLIST.md).
- **Dependency-script review metadata**: the root and `examples/`
  `package.json` files record reviewed lifecycle-script packages in
  `allowScripts`. After dependency changes, run
  `npm approve-scripts --allow-scripts-pending` from each directory and review
  any updates. Treat this field as review metadata, not an install-time
  security boundary.
- **Release preparation**: Changesets and an npm-provenance workflow are
  checked in. Publishing remains conditional on the repository and npm setup,
  initial package bootstrap, and verification in
  [RELEASE_CHECKLIST.md](https://github.com/SauceTaster/spatial-nav-css/blob/main/RELEASE_CHECKLIST.md);
  workflow files alone do not establish that a package has been published.
- `npm run ci` runs lint, typecheck, build, SSR import checks, packed-package
  checks, a React 17 consumer check, and coverage locally. The browser and
  examples suites have separate local scripts and configured hosted jobs.
  Other hosted-only work includes the Node matrix, CodeQL, dependency review,
  and release preparation.

## Notes & roadmap

- **Pointer harmony**: in light DOM, pointer interaction that focuses a
  matching stop updates spatial state through `focusin`; no pointer adapter is
  needed for native controls that receive focus when activated. See the shadow
  DOM caveat below for event retargeting across a shadow boundary.
- **Shadow DOM**: engine-driven focus and `getFocused()` work for a root
  element inside tested open-shadow-DOM layouts; navigation across shadow
  boundaries and closed roots is not supported. Test pointer/Tab retargeting
  in each target browser.
- **Steamworks action sets**: a potential first-class host adapter is sketched
  above and fits `InputAdapter`; a concrete integration would target and test
  a specific maintained Steamworks binding.
- **WebHID IR receivers**: same story — the adapter contract is the extension
  point.

MIT licensed.
