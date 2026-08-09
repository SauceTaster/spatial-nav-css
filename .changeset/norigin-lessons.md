---
'spatial-nav-css': minor
---

Navigation hardening for production-style TV interfaces:

- Scoring: sliver overlaps no longer count as same-row alignment — overlap
  must cover ≥20% of the smaller projected extent — the origin's or the
  candidate's (`scoring.alignedOverlapRatio`; set 0 for the old any-overlap
  rule).
- `autoRestoreFocus` (default on): when the focused element is removed,
  focus restores to the surviving container's memory → default focus →
  first focusable, debounced so re-render bursts settle first.
- Keyboard: `throttleMs` option (time-based because some TV platforms may
  repeat without `event.repeat`; keyup resets the gate), and activate/back now
  fire once per physical press instead of machine-gunning on key repeat.
- Directional focus and edge events carry `detail.repeat`, and the composed
  facade accepts `navigate(direction, repeat?)`, so virtualized or accelerated
  UIs can distinguish a held direction from a discrete press.
- Press/release model: `spatial:activaterelease` with `detail.durationMs`
  from both keyboard and gamepad enables long-press UX; lost input sessions
  report `spatial:activatecancel` so transient state can be cleared.
- New `spatial-nav-css/debug` entry: `attachDebugOverlay()` paints the
  approximate DOM inputs (focusables, container boxes, current focus) for
  debugging.
