# Contributing

Thanks for helping make spatial navigation on the web better!

## Setup

```bash
npm install
npm run ci        # everything CI runs: lint, typecheck, build, package checks, tests+coverage
```

Day-to-day commands:

| Command | What it does |
| --- | --- |
| `npm test` / `npm run test:watch` | vitest suite (jsdom, injectable geometry) |
| `npm run test:coverage` | tests + V8 coverage with thresholds |
| `npm run lint` / `npm run lint:fix` | Biome lint + format (check / write) |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm run build` | tsup → ESM + CJS + d.ts for all entry points |
| `npm run check:package` | publint + are-the-types-wrong against the packed tarball |
| `npm run bench` | V8 microbenchmarks (geometry + full engine pass) |
| `npm run demo` | build & serve the demo gallery at `localhost:4173/demo/` (`/demo/bench.html` = real-browser benchmark) |

## Making changes

1. Branch from `main`.
2. Make the change. Engine behavior changes need a test — the suite drives
   the engine with injected rects (see `tests/helpers.ts`), so navigation
   semantics are assertable without a browser.
3. If user-facing, add a changeset: `npx changeset` (pick patch/minor/major
   and write a sentence; it becomes the changelog entry).
4. `npm run ci` locally; open a PR.

CI runs Biome, typecheck, build, package validation, and the test matrix on
Node 20/22/24, plus CodeQL and dependency review.

## Conventions

- Formatting and linting are enforced by Biome (`biome.json`) — no debates,
  run `npm run lint:fix`.
- Behavior at boundaries is documented in
  [docs/edge-cases.md](docs/edge-cases.md); if you change an edge behavior,
  update the doc and its pinning test together.
- New input devices belong behind the `InputAdapter` interface, not in the
  engine.
- Engine changes must respect the perf budget
  ([docs/performance.md](docs/performance.md)): `tests/perf-budget.test.ts`
  pins `getComputedStyle` calls per navigation; run `npm run bench` before
  and after if you touch the search path.
- Touching the config reader or `css/spatial.css`? Also open
  `demo/css-conformance.html` in a browser — it self-runs the cascade
  checks jsdom can't evaluate (@property, @media, var()).
- Demos are plain HTML importing `../dist` — keep them dependency-free.

## Releases

Releases are automated with Changesets: merging to `main` updates a
"Version Packages" PR; merging that PR publishes to npm with provenance.
Maintainers: the repo needs an `NPM_TOKEN` secret (automation token), and
`package.json`'s `repository`/`homepage`/`bugs` URLs must point at the real
GitHub repo before the first publish.
