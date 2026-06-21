---
'spatial-nav-css': minor
---

Production-TV lessons adopted from studying Norigin Spatial Navigation:

- Scoring: sliver overlaps no longer count as same-row alignment — overlap
  must cover ≥20% of the origin's extent (`scoring.alignedOverlapRatio`,
  set 0 for the old any-overlap rule).
- `autoRestoreFocus` (default on): when the focused element is removed,
  focus restores to the surviving container's memory → default focus →
  first focusable, debounced so re-render bursts settle first.
- Keyboard: `throttleMs` option (time-based — TV platforms fire repeats
  without `event.repeat`; keyup resets the gate), and activate/back now
  fire once per physical press instead of machine-gunning on key repeat.
- Press/release model: `spatial:activaterelease` with `detail.durationMs`
  from both keyboard and gamepad enables long-press UX.
- New `spatial-nav-css/debug` entry: `attachDebugOverlay()` paints the
  engine's view (focusables, container zones, current focus) for debugging.
