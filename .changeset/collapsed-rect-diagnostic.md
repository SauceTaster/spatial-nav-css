---
'spatial-nav-css': patch
---

Hardening for CEF/webview embeddings: when a host reports a 0/unknown
viewport, focusables sized with raw `vw`/`vh` can collapse to coincident ~0px
rects and navigation finds nothing with no error. The engine now emits a
one-time dev-mode `console.warn` when a navigation dead-ends with most
focusables at a ~0px rect, instead of failing silently. Docs add guidance on
animating focusables (prefer opacity-only) and on using a single input source
per surface when embedding.
