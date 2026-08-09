---
'spatial-nav-css': patch
---

Fix `<SpatialNavigationProvider>` losing its input adapters when React replays
effects in StrictMode. Cleanup now stops the composed navigation instance (so
its adapter registrations survive) and separately resets the engine's DOM
state. A replay fully re-arms keyboard/gamepad input, while a genuine unmount
also removes engine-owned focus classes and `tabindex` attributes. Surfaced by
the framework examples and pinned by regression tests.
