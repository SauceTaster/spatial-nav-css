# spatial-nav-css — examples

Idiomatic integrations with each framework adapter and a handful of real-world
libraries. Two jobs in one folder:

1. **Runnable examples** — `npm run dev` serves a gallery; every page is driven
   by the engine so you can feel the behavior with a keyboard or a gamepad.
2. **Regression tests** — every example is paired with a colocated Vitest test
   (`npm test`). Most tests import the same component the page renders (or a
   shared fixture builder), so the example and its guarantee can't drift apart;
   the web-components test drives the custom elements directly.

This package has its **own `package.json`** (React, Vue, Svelte, React Aria,
ECharts, TanStack Table, React Flow, Vite, Vitest, …) so none of it bloats the
root library install. It consumes the library **source** directly via Vite
aliases (`spatial-nav-css` → `../src`), so there's no build step to run first.

```bash
cd examples
npm install
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
| [vanilla](src/vanilla/fixture.ts) | core | **every way to make something non-focusable**, each with a live PASS/skip badge |

### Real-world library remixes
| Example | Library | The integration gotcha |
| --- | --- | --- |
| [tanstack-table](src/remix-tanstack-table/Example.tsx) | `@tanstack/react-table` | a grid is a **2D field of cell-stops** — make each cell a stop, not the `<table>` or `<tr>` |
| [echarts](src/remix-echarts/Example.tsx) | `echarts` | a chart canvas is **one opaque element** — the focusable *controls* drive it via `dispatchAction`, the chart isn't a stop |
| [react-flow](src/remix-react-flow/Example.tsx) | `@xyflow/react` | nodes are transform-positioned; the engine reads **post-transform** geometry. Disable RF's node focus so each node is one stop, not two |

## Making something non-focusable (the cheat-sheet)

The [vanilla example](src/vanilla/fixture.ts) is the canonical reference and its
test is the guarantee. In short:

- **Native control** (`button`, `a`, `input`) → add `tabindex="-1"`, or disable it.
- **`data-focusable` element** (card/tile) → **remove the attribute** (`tabindex="-1"`
  won't help — the engine assigns that itself).
- **A whole subtree** → `inert` (best — also blocks pointer/AT), or `hidden` /
  `aria-hidden="true"` / `display:none`. The check uses `closest()`, so putting
  it on an ancestor excludes everything inside.

To block one *direction* while staying focusable, that's different — use
`data-nav-down="none"` (or `--nav-down: none`).

## How the tests stay deterministic

jsdom has no layout, so each test injects two `EngineOptions`: a `getRect`
provider that returns a fixed layout keyed by element id, and
`visibilityFilter: () => true` (the library's own tests do the same). See
[src/shared/test-utils.ts](src/shared/test-utils.ts).
