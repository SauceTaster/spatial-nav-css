---
'spatial-nav-css': patch
---

Fix `<SpatialNavigationProvider>` losing its input adapters on remount (React
StrictMode, route changes, conditional rendering). The effect cleanup now calls
`nav.stop()` instead of `nav.destroy()`: the provider's nav instance is created
once and reused across React's mount → unmount → remount cycle, but `destroy()`
permanently clears the input adapter set, so after a remount keyboard/gamepad
input silently stopped working. `stop()` removes every global listener but keeps
the adapters, so a remount fully re-arms; on a genuine unmount the whole tree is
gone, so nothing leaks. Surfaced by the new framework examples (which run under
StrictMode) and pinned by a regression test there.
