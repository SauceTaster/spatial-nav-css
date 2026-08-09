---
'spatial-nav-css': patch
---

Ignore collapsed focusables when sizing a zone. A container's rect is the union
of its box and its focusable content, so a single element reporting a zero-size
rect at the viewport origin — an offscreen focus guard from an overlay library,
a chart library's tabbable `<svg>` before it measures, a virtualized row that
has not been laid out — stretched the whole zone up to `(0, 0)`. Every
zone-level comparison then shifted: pressing down from a header could classify
the panel directly beneath it as merely "overlapping" and skip past it to a
zone two blocks away, in a layout that looked completely normal. Degenerate
rects are now dropped before the union (a zone whose members are *all*
collapsed is unchanged), matching how the candidate search already ignores
them.
