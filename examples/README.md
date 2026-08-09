# spatial-nav-css — examples

Idiomatic integrations with each framework adapter and a handful of real-world
libraries. Two jobs in one folder:

1. **Runnable examples** — `npm run dev` serves a gallery; every page is driven
   by the engine so you can feel the behavior with a keyboard or a gamepad.
2. **Regression tests** — every example is paired with a colocated Vitest test
   (`npm test`). Most tests import the same component the page renders (or a
   shared fixture builder), and the web-components test drives the custom
   elements directly. These headless tests cover markup and engine contracts;
   browser layout, transforms, chart rendering, Gamepad behavior, and assistive
   technology still require browser/device testing.

This package has its **own `package.json`** (React, Vue, Svelte, Solid, Lit,
React Aria, Radix, MUI, Headless UI, Ark, TanStack, ECharts, React Flow, MSW,
Vite, Vitest, …) so none of it bloats the root library install. It consumes the
library **source** directly via Vite aliases (`spatial-nav-css` → `../src`), so
there's no build step to run first. Dependency versions are pinned exactly, and
each was at least 48 hours old when added — a small hedge against a compromised
fresh release.

## The application examples

The pages under **Complete applications** are the ones to copy from. They are
built the way a real product is: components split by responsibility, data
fetched over `fetch` and cached, genuine loading / error / refetch / optimistic
states — and no hand-written arrays inside components.

The network is mocked with **MSW**, and the cache is **TanStack Query**. Because
MSW intercepts at the fetch boundary, *the same handlers serve the dev pages
(via a service worker) and the headless tests (via Node interceptors)*, so a
test exercises the component's real data lifecycle instead of a stubbed hook.
The fixture data is seeded from a fixed PRNG, so the third card is the same
game in your browser and in CI.

| Shared piece | What it is |
| --- | --- |
| [`shared/api/db.ts`](src/shared/api/db.ts) | seeded domain data — games, media libraries, streams, users, channels/programmes, services, storage, settings, logs, metrics |
| [`shared/api/handlers.ts`](src/shared/api/handlers.ts) | the MSW "backend": filtering, sorting, pagination, mutations, latency and failure injection, a 422 validation error |
| [`shared/api/client.ts`](src/shared/api/client.ts) | typed fetch client + TanStack Query options; `ApiError` carries status and the offending field |
| [`shared/app.tsx`](src/shared/app.tsx) | `AppShell` — one QueryClient, one navigation instance |
| [`shared/layout.ts`](src/shared/layout.ts) | **the trick that makes app-shaped tests possible**: jsdom performs no layout, so `applyLayout()` / `setRect()` describe the page geometrically ("these cards are a 4-column grid at x=260") and the engine then runs its real measurement path |
| [`shared/useContentFocus.ts`](src/shared/useContentFocus.ts) | hands focus to content when it arrives, via the library's `claimFocus()` |

```bash
cd examples
npm ci
npm run dev      # gallery at the printed localhost URL
npm test         # the same examples, asserted in jsdom
```

## What each example surfaces

### Framework adapters
| Example | Adapter | Highlights & gotchas |
| --- | --- | --- |
| [react](src/react/Example.tsx) | `spatial-nav-css/react` | `useFocusable`, `<SpatialContainer>`, exclusion gotchas, `autoRestoreFocus` on removal |
| [vue](src/vue/App.vue) | `spatial-nav-css/vue` | `useFocusable` composable + `v-focusable` / `v-spatial-container` directives |
| [svelte](src/svelte/App.svelte) | `spatial-nav-css/svelte` | `use:focusable` / `use:spatialContainer` actions + `focused` store (Svelte 5 runes) |
| [react-aria](src/react-aria/Example.tsx) | `spatial-nav-css/react-aria` | a RAC `ListBox` is **one** spatial stop (roving tabindex); `←` exits a `remember` (not `wrap`) zone back to the sidebar |
| [web-components](web-components.html) | `spatial-nav-css/elements` | `<spatial-nav>` / `<spatial-container>`, no framework |
| [solid](src/solid/Example.tsx) | core (no adapter) | the "anything-else" pattern from docs/frameworks.md: one core instance at mount + data attributes + a `spatial:focus`-driven signal |
| [lit](src/lit/main.ts) | core (no adapter) | components must render into **light DOM** (`createRenderRoot() { return this }`) — candidate queries do not pierce shadow roots |
| [vanilla](src/vanilla/fixture.ts) | core | common focus-inclusion/exclusion mechanisms, each with a live PASS/skip badge |

### Real-world library remixes
| Example | Library | The integration gotcha |
| --- | --- | --- |
| [tanstack-table](src/remix-tanstack-table/Example.tsx) | `@tanstack/react-table` | a grid is a **2D field of cell-stops** — make each cell a stop, not the `<table>` or `<tr>` |
| [echarts](src/remix-echarts/Example.tsx) | `echarts` | chart series are not ordinary HTML spatial stops by default — focusable *controls* drive the chart via `dispatchAction` |
| [react-flow](src/remix-react-flow/Example.tsx) | `@xyflow/react` | in the browser, transform-positioned nodes expose post-transform rectangles. Disable RF's node focus so each node is one stop, not two |

### Complete applications
Real component structure, data mocked at the network. Start here.

| Example | Stack | What it stresses |
| --- | --- | --- |
| [game-launcher](src/app-game-launcher/App.tsx) | Query + MSW | filter rail, card grid, detail panel; skeleton→data handover via `claimFocus`, live filtering under the highlight, optimistic favorite |
| [media-server](src/app-media-server/App.tsx) | Query + TanStack Table | libraries, a live streams grid with per-cell stops and sorting, rows that mutate under the highlight, `spatialConfirm` for a destructive action |
| [sysadmin](src/app-sysadmin/App.tsx) | Query + TanStack Form | the classic nav+panel settings shape; mixed widgets where arrows must stay native, a server 422 mapped back onto its field, services, logs, danger zone |
| [epg](src/app-epg/App.tsx) | Query + TanStack Virtual | the hardest shape there is — a time × channel guide where blocks are as wide as they are long, so rows never line up, with windowed rows |
| [dashboard](src/app-dashboard/App.tsx) | Query + Table + Virtual + Recharts | stat tiles, chart-driving controls, a sortable/filterable/selectable data grid, a virtualized log |
| [game-ui](src/app-game-ui/App.tsx) | local state | a pause screen: mixed-width inventory cells, ability slots, a staggered skill tree — pure geometry, no network |

### Component libraries
Portals, focus traps, and roving tabindex — where integrations actually break.

| Example | Library | What it establishes |
| --- | --- | --- |
| [lib-radix](src/lib-radix/App.tsx) | Radix UI | dialog / dropdown / tabs / select / switch; modal containment rests on `aria-hidden`, roving items need `data-focusable`, and a trigger that ignores `click` |
| [lib-mui](src/lib-mui/App.tsx) | Material UI | MUI's own Modal + FocusTrap, Menu, Select, Tabs composed with the engine |
| [lib-headless](src/lib-headless/App.tsx) | Headless UI + Ark UI | the same widget set from two headless libraries, side by side |

### UI patterns
| Example | Library | What it demonstrates |
| --- | --- | --- |
| [onscreen-keyboard](src/remix-onscreen-keyboard/main.ts) | none — core only | the classic TV search keyboard: a key grid with `wrap`, wide keys (space/enter) as single stops, explicit `data-nav-*` routes between the field, the grid, and the results rail |

## Making something non-focusable (the cheat-sheet)

The [vanilla example](src/vanilla/fixture.ts) is a tested reference for the
library's default selector and visibility policy. In short:

- **Native control** (`button`, `a`, `input`) → add `tabindex="-1"`, or disable it.
- **`data-focusable` element** (card/tile) → **remove the attribute** (`tabindex="-1"`
  won't help — the engine assigns that itself).
- **A whole subtree** → `inert` (also blocks pointer/AT), `hidden`, or
  `display:none`. Do not use `aria-hidden="true"` as a focus-management tool:
  it hides content from accessibility APIs but does not disable native focus or
  pointer interaction. The engine filters it defensively, but the browser does
  not.

To block one *direction* while staying focusable, that's different — use
`data-nav-down="none"` (or `--nav-down: none`).

## How the tests stay deterministic

jsdom has no layout, so each test supplies the geometry itself. Two styles:

- **Small examples** inject a `getRect` provider keyed by element id, plus
  `visibilityFilter: () => true` — see
  [src/shared/test-utils.ts](src/shared/test-utils.ts).
- **Application examples** describe the page in layout terms with
  [`applyLayout()` / `setRect()`](src/shared/layout.ts) and let the engine do
  its own measuring, which keeps the real `getBoundingClientRect` path under
  test. Re-apply after any render that adds nodes.

Note that `visibilityFilter` replaces only the *rendering* check. The engine
always enforces `aria-hidden` / `inert` / `hidden` / open-modal exclusion on
top, which is why the portaled-overlay tests can assert real modal containment
in jsdom.
