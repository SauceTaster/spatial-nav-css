# Edge cases & behavior decisions

What the engine does at the boundaries, and why. Everything here is pinned
by a test in `tests/` unless marked otherwise.

## Geometry

**Diagonal neighbors in a grid.** Pressing right from a grid cell goes to
the row neighbor, never the diagonal: candidates whose orthogonal projection
overlaps the origin ("aligned") always beat those that don't, regardless of
distance. This is the deliberate console-UI bias — aligned-but-far beats
near-but-misaligned.

**Sliver overlaps are not alignment.** The overlap must cover at least 20%
of the origin's extent (`scoring.alignedOverlapRatio`, the adjacent-slice
threshold proven in Norigin's production TV apps) — a 1px graze can't grant
a far candidate same-row priority over a near diagonal neighbor (pinned;
set the ratio to 0 for any-overlap alignment).

**Nothing aligned at all.** Among misaligned candidates, the score is
edge-gap distance plus 5× the off-axis travel needed (distance to the
candidate's orthogonal span, not to its center) plus a mild center-offset
tie-break — the least-drifting candidate wins. Tune via
`scoring.orthogonalWeight`.

**Wide zones.** Drift is measured to a candidate's span, so a band that
laterally contains the origin costs no off-axis travel — a scrolled
carousel's far-off *center* can't make a farther, narrower row win
(regression-pinned).

**Overlapping elements.** Candidates overlapping the origin on the
navigation axis form a second tier ('overlapping', center-based) that is
only consulted when no candidate is strictly beyond the origin's far edge.
Stacked/overlay layouts still navigate; normal layouts never get confused
by them.

**Zero-size elements.** Skipped entirely (display:contents wrappers,
collapsed items mid-animation).

**Equal scores.** First in DOM order wins (stable iteration). Not
randomized, not layout-order — if you care, disambiguate with `data-nav-*`.

## Containers & zones

**Sibling zones vs stray elements.** At each scope, nested containers
compete as single zone rects; the search descends into the winner. A header
tab that is geometrically nearer cannot beat the content zone beside you
(pinned by the "routes to the aligned zone" test).

**Scrolled carousels.** A zone counts as its *content band* — the union of
its box and its content rects — so a card scrolled out of the visible box
is still "in the row" for alignment, wrap origins clear the full content
extent, and clipped-by-overflow elements remain candidates. Being scrolled
out of view is a position, not an absence.

**Wrap is per-axis.** `wrap` engages only when candidates exist *behind*
the focused element on the travel axis. Pressing down in a horizontal wrap
row exits the row rather than wrapping sideways (regression-pinned).

**Single-item wrap container.** Doesn't wrap to itself; navigation
escalates or fails normally.

**Empty containers.** Zones are derived from their focusable content; a
container with none is invisible to the search.

**Nested `remember`.** Memory is recorded on every `remember` ancestor, so
entering the outer container restores the innermost leaf that actually had
focus.

**Stale memory.** If the remembered element was removed, hidden, or no
longer belongs to the container, entry falls back to the container's
default focus, then geometry. WeakMap storage means removed elements don't
leak.

**`remember` vs `data-spatial-autofocus`.** Memory wins once the container
has been visited; autofocus is the cold-start entry.

**Traps (`contain`).** Block geometric exit and stop scope escalation.
Two escape hatches, both intentional: explicit `data-nav-*` overrides, and
programmatic `nav.focus()`. `spatial:back` is the idiomatic "close".

**Entering a trap.** Allowed — `contain` is a roach motel, not a wall.
Focus can move in geometrically; it can't leave geometrically.

**Native modal dialogs.** `showModal()` focus-blocks the page outside the
top layer without setting any attribute; the engine detects `dialog:modal`
and treats everything outside as invisible while it is open — no
`data-spatial-container` needed (pinned in the browser conformance page;
jsdom lacks `:modal`, where the check degrades silently and the explicit
`contain` pattern still applies). **Stacked modals** are the documented
approximation: with several modals open, content of any open modal counts
as visible, though only the topmost is truly interactive — give background
modals `contain` if you stack them. Dialog-free pages skip the check via a
tag-index length test (no hot-path cost).

## Overrides

**Overrides are authoritative.** `data-nav-right="#x"` skips geometry,
traps, wrap, memory, and autofocus redirection (pinned by test). If the
selector matches nothing visible, the move fails — there is no geometric
fallback, on the theory that a half-working override is worse than a
loudly-broken one.

**Malformed override selectors.** A syntactically invalid selector blocks
the direction instead of throwing — a typo in markup must never crash the
input path. An override that resolves to the origin itself is a no-move
(no events fire). Empty values are ignored entirely and fall through to
geometry. All pinned.

**`none`** blocks the direction and fires no `spatial:nofocustarget`…
actually it returns failure like an edge, so `nofocustarget` *does* fire on
the origin — distinguish in handlers via `readNavConfig(el).explicit`.

## Focus lifecycle

**Focused element removed from the DOM.** With the default
`autoRestoreFocus: true` (and a started engine), focus restores itself
after a ~100ms debounce — to the nearest surviving container's memory,
then its default focus, then its first focusable, then the root's entry
point; a burst of removals coalesces into one restore, and a restore never
fights focus the app moved itself (all pinned). The TV rule: the ring never
just vanishes. With it off — or before the debounce fires — `getFocused()`
returns null and the next direction press claims first focus.

**Mouse/touch and Tab.** Any native `focusin` inside the root is adopted as
the spatial position — pointer, Tab key, and programmatic `.focus()` all
update where spatial navigation continues from.

**Multiple nav regions.** A region whose root doesn't contain the focused
element ignores direction input (doesn't consume it, doesn't steal focus).
First-focus is only claimed when focus is on `<body>`/none (pinned by the
elements + integration tests).

**`spatial:beforefocus` veto.** Cancel it and the move silently doesn't
happen; the origin keeps focus. Use sparingly — a veto with no visible
feedback feels like a dead button.

**data-focusable divs.** Receive `tabindex="-1"` on first spatial focus so
they hold real DOM focus but stay out of the Tab order. Add `tabindex="0"`
yourself if you want them Tab-reachable too.

## Input

**Typing fields.** The keyboard adapter ignores events whose target is
editable (text inputs, textareas, selects, contenteditable) so arrows move
the caret and Enter submits. Focus leaves a text field via Tab, click, or
your own Escape handling — by design, not via arrow keys.

**Key repeat / stick repeat.** `intent.repeat` distinguishes held input.
Gamepad repeat: 400 ms initial delay, 130 ms interval (configurable).
Direction changes reset the repeat timer and fire immediately.

**Gamepad polling.** rAF-driven, so it pauses in background tabs (a
feature: no hidden-tab navigation). Polling stops entirely with no pad
connected and resumes on `gamepadconnected`.

**Pre-connected pads.** Browsers don't fire `gamepadconnected` for a pad
that hasn't been touched; the adapter polls defensively on start and
self-stops if none exists.

**Multiple pads.** All connected pads are read; each keeps independent
repeat/button state. Two people can fight over one menu, as nature
intended.

**Arrow keys at an edge.** Consumed anyway (preventDefault) so the page
doesn't scroll out from under the UI; the edge is reported via
`spatial:nofocustarget`. `back`/`Escape` is only consumed when a listener
calls `preventDefault()` — unhandled Escape stays available to the browser.

## Rendering environments

**jsdom / SSR.** The engine reads geometry lazily, so importing is safe
anywhere; in jsdom all rects are zero — inject `getRect` and
`visibilityFilter` (every engine test in this repo does exactly that).
`createSpatialNavigation` skips adapter setup when `window` is undefined.

**Smooth scrolling vs fast input.** Rects are read mid-animation when input
outruns the scroll. Cosmetic at worst (a move lands one item off); use
`scrollBehavior: 'auto'` for frame-perfect chains.

**Reduced motion.** `prefers-reduced-motion` downgrades smooth scrolling to
instant and disables the ring/pop transitions in the stylesheet.

**Transforms.** Scoring uses `getBoundingClientRect`, i.e. post-transform
geometry. The `.spatial-pop` scale slightly grows the focused rect —
harmless because scores compare candidates, not the origin. Large
transforms (carousel 3D effects) navigate by what's *on screen*, which is
usually what users expect.

**Animating focusables.** Because geometry is sampled per keypress, a
focusable mid-transition reports a moving rect — a fast arrow press during an
entrance animation can read a half-arrived position and pick the wrong (or
no) target. Prefer **opacity-only** entrance animations for focusables, or
keep transform/size transitions short; avoid animating the width/height or
translate of an element you also navigate to.

**Collapsed rects (0/unknown viewport).** Some embeddings — CEF, a preview
iframe — report a 0 or unknown viewport, so focusables sized with raw
`vw`/`vh` collapse to coincident ~0px rects and navigation finds nothing.
The engine can't fix the host's layout, but it refuses to fail silently: in
dev builds it emits a one-time `console.warn` when a navigation dead-ends
with most focusables at a ~0px rect. Fix it on your side by sizing with
`clamp(min, vw, max)` so a 0 viewport can't collapse the element.

**Shadow DOM.** An engine rooted inside an open shadow root works fully —
`document.activeElement` retargets to the host, so the engine resolves the
real focus through `shadowRoot.activeElement` chains (pinned by test).
Navigating *across* shadow boundaries from outside is not supported:
`querySelectorAll` sees only the root's own tree.

**iframes.** Each document needs its own instance — pinned by test,
including the cross-realm trap: iframe documents fail `instanceof Document`
checks, so the engine duck-types on `nodeType`. Crossing frame boundaries
is the host app's job via `spatial:nofocustarget` on one side and
`nav.focus()` on the other.

**Deep DOMs.** Ancestor walks are iterative with path-compressed
memoization — depth cannot overflow the stack, and each distinct ancestor
is read once per pass (pinned at 600 levels; jsdom's own style engine is
the test-depth ceiling, not the engine).

**Elements that are both focusable and containers.** A clickable card that
contains focusable children competes twice — once as itself, once as a
zone — with the two candidacies kept distinct (pinned by test).

**SVG.** SVG `<a href>` elements match the selector but typically report
zero-size rects and are skipped; they never crash collection (pinned).

**Disabled fieldsets.** Buttons inside `<fieldset disabled>` match
`:disabled` and are excluded, per the platform.

**NaN gamepad axes.** Flaky drivers reporting NaN/Infinity axes read as
centered rather than emitting phantom directions (pinned by test).

**RTL.** Geometry is physical, not logical: `right` means visually right,
which matches d-pads and arrow keys. Logical-direction mapping (if you want
`nav-forward`) belongs in your keymap layer.
