# Performance

Spatial navigation sits on the input path of the whole app, and because the
W3C never shipped css-nav-1 natively, everything a browser would have done
in C++ happens here in JS. This document is the receipts: what one keypress
costs, how it's measured, and what keeps it fast.

## The budget

Navigation runs at human input rate — keyboard repeat and gamepad repeat cap
around 8–30 Hz — so one navigation pass has a budget of a few milliseconds
before anyone could notice. The gamepad poll loop, by contrast, runs every
animation frame and must be effectively free.

## Measured numbers

Fixture: a TV-scale page — sidebar + 10 rails × 50 cards = **506
focusables**, nested `remember` containers (`bench/fixtures.ts`,
mirrored by `demo/bench.html`).

**Real Chrome, full production path** (real layout, computed styles, and
visibility — from `demo/bench.html`, measured in a background-throttled tab,
so treat as worst-case):

| Operation | p50 | p95 |
| --- | --- | --- |
| `findTarget()` (the search) | 2.0 ms | 7.3 ms |
| `navigate()` (search + focus + scroll + events) | 1.4 ms | 3.2 ms |

**Pure V8** (the algorithm with geometry injected — `npm run bench`):

| Operation | Rate |
| --- | --- |
| `distanceScore` | ~17.6M ops/s |
| `classifyDirection` | ~28M ops/s |
| `findBestCandidate`, 1,000 candidates | ~58K ops/s (0.017 ms) |
| `findBestCandidate`, 10,000 candidates | ~5.6K ops/s (0.18 ms) |

The math is never the bottleneck — even pathological candidate counts score
in fractions of a millisecond. The cost lives in DOM reads.

## What one keypress does (and the regression that motivated all this)

A `findTarget` pass reads per-element config (`getComputedStyle` for the
`--nav-*` / `--spatial-*` properties), resolves containers up the ancestor
chain, checks visibility, and reads rects. The naïve implementation did
this with **6 `getComputedStyle` calls per element, per touch, uncached** —
measured at **12,450 style reads for a single keypress** on the 506-element
fixture (~975 ms per search in jsdom).

Three structural fixes brought that to **65 style reads** (~5 ms in jsdom,
~2 ms in Chrome):

1. **One `getComputedStyle` per element** — a single computed-style object
   serves all six properties (`src/core/config.ts`).
2. **A per-pass config cache** — every read function takes a
   `NavConfigCache`; each element is read at most once per navigation, no
   matter how many walks touch it. The cache lives for exactly one pass, so
   runtime CSS changes still apply on the next keypress.
3. **Path-compressed container resolution** — siblings share their
   ancestors' answers, making zone grouping O(distinct ancestors) instead of
   O(candidates × depth).

Plus two smaller ones: `Element.checkVisibility()` replaces
`getClientRects` + `getComputedStyle` for visibility (one native call), and
the gamepad poll loop pre-computes its button table so it allocates nothing
per frame.

## Keeping it fast

- `tests/perf-budget.test.ts` pins the style-read count per pass (< 200 on
  the 506-element fixture; currently 65). Reintroducing a per-candidate
  style read fails CI loudly.
- `npm run bench` runs the V8 microbenchmarks (vitest bench): pure geometry
  plus the full `findTarget` call graph in jsdom at 100 / 500 / 2,000 cards.
- `demo/bench.html` measures the real browser path; open it after engine
  changes and compare against the table above.

## Scaling notes & honest limits

- jsdom timings scale sub-linearly with candidate count (5.1 ms @ 100 cards
  → 8.9 ms @ 2,000 per two searches) because per-element costs dominate
  fixed costs; in Chrome the per-element costs are far smaller.
- The engine reads geometry fresh every keypress — no cached spatial index,
  no MutationObserver invalidation. That's a deliberate trade: it's why
  virtualized lists, reordering, and animations need zero integration code.
  At human input rates the fresh read is well inside budget; an app with
  tens of thousands of *simultaneously focusable* elements should give the
  engine a smaller `root` per region instead.
- `getRect` and `visibilityFilter` are injectable: an app that already knows
  its geometry (a canvas-backed grid, a virtualizer) can bypass DOM reads
  entirely.
