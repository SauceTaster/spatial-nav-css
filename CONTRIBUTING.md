# Contributing

Thanks for helping make spatial navigation on the web better.

By participating, you agree to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

Use Node.js 22 or newer (matching the package `engines` field) and npm 11.16.0
(matching `packageManager`), then install the exact locked dependency graph:

```bash
npm ci
npm run ci
```

Day-to-day commands:

| Command | What it does |
| --- | --- |
| `npm test` / `npm run test:watch` | Vitest suite (jsdom, injectable geometry) |
| `npm run test:coverage` | Tests plus V8 coverage thresholds |
| `npm run test:browser` | Chromium integration smoke tests (use `test:browser:all` for all configured engines) |
| `npm run lint` / `npm run lint:fix` | Biome lint and format (check/write) |
| `npm run typecheck` | Strict TypeScript check without emitting files |
| `npm run build` | Build ESM, CJS, and declarations for every entry point |
| `npm run check:package` | Validate the packed package with publint and Are the Types Wrong |
| `npm run check:ssr` | Verify server-side imports do not require browser globals |
| `npm run audit:all` | Audit the root, examples, and React 17 fixture lockfiles |
| `npm run bench` | Run geometry and engine microbenchmarks |
| `npm run demo` | Build and serve the demo gallery at `localhost:4173/demo/` |

The framework examples have a separate lockfile and must also be checked when a
change can affect adapters, declarations, packaging, or browser behavior:

```bash
npm --prefix examples ci
npm --prefix examples run typecheck
npm --prefix examples test
npm --prefix examples run build
```

## Making changes

1. Branch from `main`.
2. Make a focused change. Engine behavior changes need a test; the suite drives
   the engine with injected rectangles (see `tests/helpers.ts`), so navigation
   semantics are assertable without a browser.
3. For a user-facing change, add a changeset with `npx changeset`. Select the
   SemVer impact and write a user-focused sentence.
4. Run `npm run ci` locally. Run the examples checks above when relevant, then
   open a pull request.

CI checks linting, types, builds, packed-package correctness, SSR import safety,
coverage on Node.js 22/24/26, Chromium/Firefox/WebKit smoke tests, and the framework examples. CodeQL is
configured separately. Dependency review becomes enforceable only after the
repository dependency graph is enabled; see
[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

## Conventions

- Formatting and linting are enforced by Biome (`biome.json`). Run
  `npm run lint:fix` before spending time on formatting by hand.
- Behavior at boundaries is documented in
  [docs/edge-cases.md](docs/edge-cases.md). Change the documentation and its
  pinning test together.
- New input devices belong behind the `InputAdapter` interface, not in the
  engine.
- Engine changes must respect the performance budget in
  [docs/performance.md](docs/performance.md). Run `npm run bench` before and
  after changing the search path and report the environment with results.
- When changing the config reader or `css/spatial.css`, also open
  `demo/css-conformance.html` in a real browser. jsdom does not evaluate all CSS
  features used there.
- Demos are plain HTML importing `../dist`; keep them dependency-free.
- `llms-full.txt` is generated from `README.md` and `docs/` by
  `npm run build:llms`. After changing any of those files, regenerate it and
  commit the result — CI fails on a stale copy. Update the hand-written
  `llms.txt` index when the API surface itself changes.
- Prefer native interactive HTML in examples. Any non-native interaction must
  include equivalent keyboard, focus, role, name, and state behavior.

## License and contribution provenance

This project uses an inbound-equals-outbound policy. By submitting a
contribution, you confirm that you have the right to submit it and license it
under the project's [MIT License](LICENSE). No contributor license agreement is
currently required.

Do not paste code, documentation, media, test data, or generated output whose
license is incompatible or unknown. A pull request that adapts third-party
material must identify the source, version or commit, author/copyright holder,
license, and what was changed. Update
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) when attribution or a retained
notice is required. Inspiration and interoperability references should also be
described accurately and must not imply affiliation, endorsement, or standards
conformance.

## Releases

The release workflow uses Changesets. Once its external prerequisites are
enabled, merges to `main` cause the workflow to open or update a version pull
request; merging that pull request publishes through npm trusted publishing
(OIDC) with provenance. The workflow intentionally has no `NPM_TOKEN`.

Maintainers must complete and verify [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
before the first release and before changing the release workflow. Release and
governance responsibilities are described in [MAINTAINERS.md](MAINTAINERS.md).
