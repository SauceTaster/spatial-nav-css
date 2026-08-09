---
'spatial-nav-css': patch
---

Fix diagonal drift in mixed-width grids. The "overlapping" direction tier
classified candidates by comparing rect *centers*, which is size-dependent: a
one-cell item sitting directly below a two-cell one — sharing its left edge —
had a center further left and so counted as being *to the left* of it.
Pressing left from the wide item then moved diagonally down instead of leaving
the row, which is what an inventory grid, a dashboard with mixed tile sizes,
or any `grid-column: span 2` layout hits immediately.

The tier now compares edges and requires the candidate to be *shifted* in the
direction of travel, not merely larger: for a leftward move,
`candidate.left < origin.left && candidate.right <= origin.right`, and the
mirrored rule per direction. Both halves matter — the second keeps a rect that
*encloses* the origin from counting as past it, which is what a full-height
sticky row label beside slightly inset content looks like (it was capturing
every downward press in its row). Genuinely overlapping candidates that reach
further in the direction of travel still qualify, so scrolled carousels and
stacked layouts are unaffected.
