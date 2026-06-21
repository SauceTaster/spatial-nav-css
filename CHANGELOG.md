# spatial-nav-css

## 0.3.0

### Minor Changes

- 38ceba9: Initial public release: css-nav-1-inspired spatial navigation engine with
  zone-scoped search, container semantics (contain / wrap / remember), CSS
  custom-property + data-attribute configuration, keyboard/gamepad/TV-remote
  input adapters, bindings for React, React Aria Components, Vue, Svelte,
  and Web Components, and a virtualized-list bridge (`/virtual`) for TanStack
  Virtual and friends.
- 38ceba9: Production-TV lessons adopted from studying Norigin Spatial Navigation:

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

### Patch Changes

- 38ceba9: Hardening from a real CEF/webview embedding: when a host reports a 0/unknown
  viewport, focusables sized with raw `vw`/`vh` can collapse to coincident ~0px
  rects and navigation finds nothing with no error. The engine now emits a
  one-time dev-mode `console.warn` when a navigation dead-ends with most
  focusables at a ~0px rect, instead of failing silently. Docs add guidance on
  animating focusables (prefer opacity-only) and on using a single input source
  per surface when embedding.
- 38ceba9: Fix `<SpatialNavigationProvider>` losing its input adapters on remount (React
  StrictMode, route changes, conditional rendering). The effect cleanup now calls
  `nav.stop()` instead of `nav.destroy()`: the provider's nav instance is created
  once and reused across React's mount → unmount → remount cycle, but `destroy()`
  permanently clears the input adapter set, so after a remount keyboard/gamepad
  input silently stopped working. `stop()` removes every global listener but keeps
  the adapters, so a remount fully re-arms; on a genuine unmount the whole tree is
  gone, so nothing leaks. Surfaced by the new framework examples (which run under
  StrictMode) and pinned by a regression test there.
