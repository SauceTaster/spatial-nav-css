# Performance

Spatial navigation sits on the input path of the application. This engine reads
live DOM configuration and geometry in JavaScript, so performance depends on
the page structure, browser, device, and current layout state. This document
explains what is measured and which invariant CI enforces; it is not a latency
guarantee for untested hardware.

## The budget

Set a navigation-latency budget from the slowest supported device and the
application's frame budget. Directional search runs on a press or configured
repeat. The Gamepad API adapter polls on animation frames while a browser-
exposed pad is connected, so its per-frame work is intentionally small and its
button table is precomputed.

## Reproducing measurements

The shared TV-style fixture is a sidebar plus 10 rails × 50 cards: **506
focusables** with nested `remember` containers (`bench/fixtures.ts`, mirrored
by `demo/bench.html`). It is useful for regressions, but it is only one layout
shape.

Run the pure/function and headless-DOM benchmarks with:

```sh
npm run bench
```

Those Vitest benchmarks report:

- pure geometry throughput for `distanceScore`, `classifyDirection`,
  `findBestCandidate`, and `unionRects`;
- the `findTarget()` call graph in jsdom at 100, 500, and 2,000 cards, with
  deterministic injected rects and visibility.

Rates and timings from these runs are machine-specific. Record the runtime
version, OS, hardware, power state, and commit when publishing or comparing a
result; compare like-for-like runs rather than copying one machine's numbers
into a product budget.

For a real browser, run `npm run demo` and open
`http://localhost:4173/demo/bench.html`. It exercises layout, computed styles,
visibility, focus, scrolling, and events. Its two rows use intentionally
different workloads:

- `findTarget()` samples changing origins and all four directions;
- `navigate()` alternates right/left between adjacent cards.

The rows are useful independently but are **not** a decomposition of “search”
versus “search plus focus” and must not be compared to infer focus/event
overhead. When recording browser results, include browser/version, OS, device,
commit, foreground/background state, warmup, sample count, and relevant page
conditions.

## What one keypress does (and the regression that motivated all this)

A `findTarget` pass reads per-element config (`getComputedStyle` for the
`--nav-*` / `--spatial-*` properties), resolves containers up the ancestor
chain, checks visibility, and reads rects. Earlier project notes recorded an
uncached implementation doing **6 `getComputedStyle` calls per element, per
touch** and **12,450 style reads for one search** on this fixture. The old
implementation is no longer part of the runnable benchmark, so treat those
figures as historical motivation rather than a reproducible current result.

Three structural fixes brought the configuration-reading portion of that
fixture to **65 style reads** in the current regression test. The test injects
deterministic rects and `visibilityFilter: () => true`, so this count does not
include browser layout or the default visibility fallback's possible style
read:

1. **One configuration `getComputedStyle` per touched element** — a single
   computed-style object serves all six properties (`src/core/config.ts`).
2. **A per-pass config cache** — every read function takes a
   `NavConfigCache`; each element is read at most once per navigation, no
   matter how many walks touch it. The cache lives for exactly one pass, so
   runtime CSS changes still apply on the next keypress.
3. **Path-compressed container resolution** — siblings share their
   ancestors' answers, making zone grouping O(distinct ancestors) instead of
   O(candidates × depth).

Plus two smaller ones: `Element.checkVisibility()` is used when available, with
a `getClientRects`/computed-style fallback, and the gamepad poll loop
precomputes its button table rather than rebuilding it each frame.

## Keeping it fast

- `tests/perf-budget.test.ts` pins configuration style reads per pass (< 200
  on the 506-element injected-layout fixture; currently 65). Reintroducing a
  per-candidate-per-ancestor config read fails CI loudly.
- `npm run bench` runs the V8 microbenchmarks (vitest bench): pure geometry
  plus the full `findTarget` call graph in jsdom at 100 / 500 / 2,000 cards.
- `demo/bench.html` measures a real browser path; run it on representative
  target devices after engine or layout changes and compare with a recorded
  baseline from the same environment.

## Scaling notes & honest limits

- The engine reads geometry fresh every keypress — no cached spatial index,
  no MutationObserver invalidation. That's a deliberate trade: it's why
  mounted virtualized items and reordering need no geometry registration.
  Cost still grows with the candidates, zones, ancestor structure, style
  complexity, and layout work relevant to a search. An application with many
  simultaneously focusable elements should measure on target hardware and
  consider a smaller `root` per region or virtualization.
- `getRect` and `visibilityFilter` are injectable: an app that already knows
  its geometry (a canvas-backed grid, a virtualizer) can bypass DOM reads
  in those two hooks. Configuration and container discovery may still perform
  other DOM work.
