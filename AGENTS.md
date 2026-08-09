# Agent guide — spatial-nav-css

Orientation for AI coding agents (and new human contributors) working in this
repository. The API surface for *consumers* of the library is summarized in
[llms.txt](llms.txt) and in full in [llms-full.txt](llms-full.txt); this file
is about working on the library itself.

## What this is

A zero-runtime-dependency TypeScript library implementing spatial (directional)
focus navigation — arrow keys / gamepad / TV remote moves DOM focus by
geometry. Core engine + CSS-declared per-element config + pluggable input
adapters + thin framework bindings (React, react-aria, Vue, Svelte, web
components) + helper modules (virtual lists, dialogs, debug overlay).

## Commands

```sh
npm ci                 # Node >= 22 required (repo tooling only)
npm test               # vitest, jsdom — the main suite (tests/)
npm run typecheck      # tsc --noEmit
npm run lint           # biome ci .  (lint:fix to autofix)
npm run build          # tsup → dist/ (ESM + CJS + d.ts per subpath)
npm run ci             # everything CI runs: lint, typecheck, build,
                       #   SSR check, package check, react17 check, coverage
npm run test:browser   # Playwright smoke tests (needs build first; it does it)
npm run ci:handheld    # install + unit/browser/a11y test + build the separate stress app
npm run demo           # build + demo gallery at http://localhost:4173/demo/
npm run build:llms     # regenerate llms-full.txt from README + docs/
```

The `examples/` directory is a **separate npm package** with its own lockfile
(`npm run ci:examples` from the root, or `npm --prefix examples ...`).
`handheld-os/` is another separate, private package. It is not part of the npm
artifact; CI installs it independently and uses its application-shaped tests to
find integration bugs against the library source.

## Layout

| Path | What lives there |
| --- | --- |
| `src/core/` | engine.ts (candidate search, focus lifecycle), geometry.ts (scoring), config.ts (CSS/data-attr reading), dom.ts (focusability), types.ts |
| `src/input/` | keyboard.ts, gamepad.ts, manager.ts, types.ts (adapter contract) |
| `src/react/`, `src/react-aria/`, `src/vue/`, `src/svelte/`, `src/elements/` | framework bindings — each is its own subpath export |
| `src/virtual/`, `src/dialogs/`, `src/debug/` | helper modules — also subpath exports |
| `css/spatial.css` | the shipped stylesheet: focus ring, `@property` registrations |
| `tests/` | vitest + jsdom suite; `tests/helpers.ts` has the rect-stubbing utilities |
| `browser-tests/` | Playwright real-browser smoke specs |
| `demo/` | self-contained HTML pages importing `../dist` — require a build |
| `examples/` | standalone Vite package. `src/app-*` are full applications (MSW-mocked network + TanStack Query), `src/lib-*` are component-library integrations, the rest are framework/pattern examples. `src/shared/` holds the mock API, the app shell, and `layout.ts` — the jsdom layout simulator that makes app-shaped spatial tests possible |
| `handheld-os/` | private standalone application package and integration stress harness; aliases `src/` directly, owns its lockfile, and never ships in the library tarball |
| `docs/` | reference docs — shipped in the npm package |
| `bench/` | vitest bench files (`npm run bench`) |

## Rules that will save you a broken PR

1. **Zero runtime dependencies.** Do not add one. `react`/`vue` are optional
   peers used only by their adapters; adapters must import the framework only
   from the subpath module that needs it.
2. **Every entry point must stay SSR-safe.** No `window`/`document` access at
   module scope. `scripts/check-ssr.mjs` imports every built entry in plain
   Node and will fail CI otherwise.
3. **jsdom has no layout.** Geometry tests stub `getBoundingClientRect` via
   helpers in `tests/helpers.ts` (or the engine's injectable `getRect`).
   Never assert on real layout in the vitest suite; that belongs in
   `browser-tests/`.
4. **Docs are part of the API.** If you change behavior, options, defaults,
   selectors, or event semantics, update the matching file in `docs/` and run
   `npm run build:llms` (CI checks `llms-full.txt` freshness). `docs/` and
   `llms.txt`/`llms-full.txt` ship in the npm tarball.
5. **React 17 compatibility is tested.** The React adapter cannot use
   React 18+-only APIs unconditionally (`scripts/check-react17.mjs`).
6. **Behavior changes need a changeset.** `npx changeset` — pick patch/minor
   per semver; docs-only and repo-tooling changes do not need one.
7. **`dist/` is gitignored.** Never commit build output. Demo pages import
   `../dist/*` at runtime, so run `npm run build` before opening demos.
8. **Biome formats.** Two-space indent, single quotes; `npm run lint:fix`
   rather than hand-formatting.

## Testing conventions

- Regression tests accompany every behavior fix — name the scenario in the
  test title, not the issue number.
- The suite runs with fake rects; when a bug depends on real browser behavior
  (scrolling, `@property`, `<dialog>`, shadow DOM focus), add a Playwright
  spec in `browser-tests/` too.
- `npm run test:coverage` runs in CI; keep new modules covered rather than
  chasing a global number.
- Changes that affect real application behavior should also pass
  `npm run ci:handheld`; keep this package independently installable.

## Gotchas

- `getComputedStyle` is the engine's dominant cost; `readNavConfig` caches
  per navigation pass (`NavConfigCache`). Don't add per-candidate style reads
  outside that cache.
- Custom properties inherit by default; the shipped stylesheet registers the
  spatial ones as non-inheriting via `@property`. The data-attribute forms
  exist for environments without `@property` — keep both paths working.
- Input adapters own hardware quirks (key repeat, deadzones, activation
  pairing). The engine only sees `NavIntent`s; keep device logic out of core.
- Focus is marked **twice**: the `.spatial-focused` class and a
  `data-spatial-focused` attribute. Both must move together (`decorate` /
  `undecorate` in engine.ts) — the attribute exists because frameworks that
  render `className` wipe the class on their next reconcile.
- `visibilityFilter` replaces only the *rendering* check. The semantic policy
  (`aria-hidden` / `inert` / `hidden` / open modal) is enforced
  unconditionally, because portaled overlay libraries rely on it for modal
  containment. Don't fold new semantic rules into the replaceable predicate.
- Zone rects union a container's box with its focusable content, ignoring
  degenerate rects — one unmeasured 0×0 focusable would otherwise stretch a
  zone to the viewport origin and skew every zone-level score.
