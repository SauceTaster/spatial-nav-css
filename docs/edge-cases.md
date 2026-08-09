# Edge cases & behavior decisions

What the engine does at the boundaries, and why. Most DOM/API behavior below
has a regression test in `tests/`; browser layout, top-layer, device, and
assistive-technology behavior still requires testing in the target runtime.

## Geometry

**Diagonal neighbors in a grid.** The default scoring strongly prefers a row
neighbor when pressing right: candidates whose orthogonal projection overlaps
the origin ("aligned") avoid a finite `1e6` penalty. This is a deliberate
console-style bias, not an absolute guarantee. A sufficiently distant aligned
candidate can lose, the application can tune the penalty, and a diagonal can
win when no aligned candidate exists.

**Sliver overlaps are not alignment.** By default, overlap must cover at least
20% (`scoring.alignedOverlapRatio`) of the **smaller** of the two projected
extents — the origin's or the candidate's. This library-specific default
prevents a 1px graze from receiving the full same-row preference. Set the ratio
to 0 for any-overlap alignment and tune it against the layouts and hardware
your application supports.

Measuring against the smaller extent is what makes the question symmetric. Were
it measured against the origin alone, a full-width control — a media scrubber,
a wide search field, a full-bleed row — could never be aligned with an
ordinary-sized neighbour, because no button is 20% of the viewport wide: the
control directly above it would take the misaligned penalty while a distant,
wider element did not, and *which* neighbour won would change with the window
width.

**Nothing aligned at all.** Among misaligned candidates, the score is
edge-gap distance plus 5× the off-axis travel needed (distance to the
candidate's orthogonal span, not to its center) plus a mild center-offset
term. The candidate with the lowest combined score wins; tune the balance via
`scoring.orthogonalWeight` and `scoring.centerWeight`.

**Wide zones.** Drift is measured to a candidate's span, so a band that
laterally contains the origin costs no off-axis travel — a scrolled
carousel's displaced *center* has less influence than it would under a
center-only drift metric. The covered regression fixture keeps the aligned
wide band ahead of a narrower diagonal alternative; extreme geometry or
custom scoring can still change that result.

**Overlapping elements.** Candidates overlapping the origin on the
navigation axis form a second tier ('overlapping') that is only consulted when
no candidate is strictly beyond the origin's far edge. Membership is decided by
*edges*, not centers: the candidate must start further along the direction of
travel **and** not extend back past the origin's near edge. Centers would make
the test depend on candidate size — a narrow cell sharing a wide cell's left
edge would read as "to its left" — and a candidate that merely *encloses* the
origin (a full-height row label beside inset content) is not past it in any
direction. Stacked and overlay layouts still navigate through this tier
without changing the strictly-beyond preference used by ordinary layouts.

**Collapsed candidate rects.** The pure chooser skips a rect only when both
its width and height are non-positive. The default visibility filter separately
excludes elements with no rendered client rect, such as most
`display: contents` wrappers. Custom `getRect`/`visibilityFilter` hooks define
the corresponding behavior for injected layouts.

**Equal scores.** First in the engine's stable candidate iteration wins. That
order is deterministic but is not a universal DOM-order promise across direct
focusables and container-zone candidates. If the tie matters, disambiguate
with `data-nav-*`.

## Containers & zones

**Sibling zones vs stray elements.** At each scope, nested containers compete
as single zone rects and the search descends into the winner. In the covered
sidebar/header/content fixture, this keeps a nearer diagonal header tab from
beating the aligned content zone; other layouts still follow the documented
geometry and scoring rules.

**Scrolled carousels.** A zone rect is the union of its box and the rects of
its mounted focusable descendants. A mounted card clipped outside the visible
box can therefore remain in the alignment band, and wrap origins clear that
union. Unmounted virtual items and non-focusable scroll content do not extend
the zone rect.

**Wrap is per-axis.** `wrap` engages only when candidates exist *behind*
the focused element on the travel axis. Pressing down in a horizontal wrap
row exits the row rather than wrapping sideways (regression-pinned).

**Single-item wrap container.** Doesn't wrap to itself; navigation
escalates or fails normally.

**Empty containers.** A container with no focusable descendants does not
compete as a zone. If the container element itself matches the focusability
policy, it can still compete as an ordinary focus target.

**Nested `remember`.** Memory is recorded on every `remember` ancestor, so
entering the outer container restores the innermost leaf that actually had
focus.

**Stale memory.** If the remembered element was removed, hidden, or no
longer belongs to the container, entry falls back to the container's
default focus, then geometry. Memory is keyed weakly by the container, so the
map does not keep a removed container alive; while a container remains alive,
its remembered child remains referenced until that memory is replaced.

**`remember` vs `data-spatial-autofocus`.** Memory wins once the container
has been visited; autofocus is the cold-start entry.

**Spatial containment (`contain`).** Blocks geometric exit and stops scope
escalation for this library. It does not contain Tab, pointer, or
assistive-technology navigation and is not a complete modal focus trap.
Two escape hatches, both intentional: explicit `data-nav-*` overrides, and
programmatic `nav.focus()`. `spatial:back` is the idiomatic "close".

**Entering spatial containment.** Allowed: geometric focus can move in, but
cannot leave through the contained search.

**Native modal dialogs.** `showModal()` focus-blocks the page outside the
top layer without setting any attribute; the engine detects `dialog:modal`
and treats everything outside as invisible while it is open — no
`data-spatial-container` needed for directional search (covered by the browser
integration page and Playwright smoke test; jsdom lacks `:modal`, where the
check degrades silently and the explicit
`contain` pattern still applies). The current visibility lookup is designed
for one native modal at a time; do not rely on it to identify the topmost of
stacked `showModal()` dialogs. Manage a modal stack explicitly or keep only one
open. Native dialog semantics, not `contain`, are responsible for Tab focus and
outside-content inertness. Dialog-free pages skip the selector lookup via a
tag-index length test.

## Overrides

**Overrides are authoritative.** `data-nav-right="#x"` skips geometry,
spatial containment, wrap, memory, and autofocus redirection (pinned by test).
The selector's first match must match the configured focusability policy, be
enabled, and be visible. If it is ineligible, the move fails—later matches and
geometry are not tried.

**Malformed override selectors.** A syntactically invalid selector blocks
the direction instead of throwing — a typo in markup must never crash the
input path. An override that resolves to the origin itself is a dead end:
`findTarget()` returns null and `navigate()` dispatches
`spatial:nofocustarget`. Empty values are ignored entirely and fall through
to geometry. All pinned.

**`none`.** An explicit `none` blocks movement. `navigate()` handles that
result like another dead end and dispatches `spatial:nofocustarget` on the
origin; inspect `readNavConfig(el).explicit` when an edge handler needs to
distinguish a deliberate block from a geometric miss.

## Focus lifecycle

**Focused element removed from the DOM.** With the default
`autoRestoreFocus: true` and a started engine, the engine attempts restoration
after a ~100ms debounce—to the nearest surviving container's memory, then its
default focus, then its first focusable, then the root's entry point. A burst of
removals coalesces into one attempt, and it does not override focus the
application moved during the debounce. This is a fallback chain, not
nearest-neighbor geometry; if no eligible target can take focus, focus remains
unrestored. With restoration off—or before the debounce fires—`getFocused()`
returns null and the next direction press attempts to claim first focus.

**Mouse/touch and Tab.** In light DOM, a native `focusin` inside the root is
adopted when its target matches the engine's focusable selector. Pointer, Tab,
or programmatic focus on a matching stop therefore updates where spatial
navigation continues; arbitrary clicks/taps and focus on excluded elements do
not. Across shadow boundaries, focus-event retargeting follows the separate
shadow DOM caveat below; `getFocused()` can resynchronize a tested open-root
active-element chain.

**Multiple nav regions.** A region whose root doesn't contain the focused
element ignores direction input (doesn't consume it, doesn't steal focus).
First-focus is only claimed when focus is on `<body>`/none (pinned by the
elements + integration tests).

**`spatial:beforefocus` veto.** Cancel it and the move silently doesn't
happen; the origin keeps focus. Use sparingly — a veto with no visible
feedback feels like a dead button.

**`data-focusable` divs.** A div with no existing `tabindex` receives
`tabindex="-1"` on first spatial focus so it can hold DOM focus without joining
the Tab order. Add `tabindex="0"` when it should be Tab-reachable too, after
supplying the semantics and keyboard behavior its role requires.

## Input

**Typing fields.** The keyboard adapter ignores events whose target is
editable (text inputs, textareas, selects, contenteditable), leaving arrows,
Enter, and Escape to the browser, widget, or application. Focus leaves a text
field via Tab, click, or application-specific handling—not via this adapter's
arrow navigation.

**A native `<select>` is a dead end without an exit.** Text inputs at least
leave Tab and a caret the user expects; a closed `<select>` consumes all four
arrows, Enter, and Escape, so on a keyboard-only or remote-driven screen a
focused select cannot be left by navigation at all. Every `<select>` in such a
UI needs an application-provided escape route — see the Escape-delegation
snippet in [recipes.md](recipes.md) under "Settings form". This is a property
of the native control, not of the adapter's ignore rule.

**Key repeat / stick repeat.** `intent.repeat` distinguishes held input.
Gamepad repeat: 400 ms initial delay, 130 ms interval (configurable).
Direction changes reset the repeat timer and fire immediately.

**Gamepad polling.** Polling is rAF-driven, so browsers typically throttle or
suspend it in background tabs; do not rely on background navigation timing.
Polling stops entirely when no pad is exposed and resumes when the browser
dispatches `gamepadconnected`.

**Controller exposure.** Browsers may withhold a connected controller from
`getGamepads()` and delay `gamepadconnected` until the user interacts with it;
permissions policy may also disable the API. The adapter probes on start and
self-stops when no exposed pad exists, then resumes when the browser dispatches
`gamepadconnected`. Applications should present discovery as asynchronous.

**Multiple pads.** All exposed connected pads are read, and each keeps
independent repeat/button state. Intents still feed one engine; applications
that need controller ownership or multiplayer arbitration must add that policy.

**Arrow keys at an edge.** Once a region owns or successfully claims focus,
direction input is consumed even at an edge so the page does not scroll out
from under that UI; the edge is reported via `spatial:nofocustarget`. The
initial `back`/Escape press is consumed only when a `spatial:back` listener
calls `preventDefault()`. When it is handled, further mapped back keydowns with
the same physical key identity are not redispatched until keyup or window blur
and are suppressed at the browser level. After an unhandled initial press,
true `event.repeat` keydowns are left alone, but a platform flood that
incorrectly keeps `repeat: false` can dispatch back again. Application back
handlers should call `preventDefault()` when they take ownership.

## Rendering environments

**jsdom / SSR.** Package imports are safe without a DOM. With no explicit DOM
root, `createSpatialNavigation()` and the React provider supply a server-side
no-op facade; `navigate`, `focus`, `focusFirst`, and `activate` return `false`,
`getFocused()` returns `null`, lifecycle/adapter calls do nothing, and
`.engine` access throws. A separate client render creates the live engine.
Direct `new SpatialEngine()` construction still requires a DOM root. In jsdom,
layout rects are zero; inject `getRect` and `visibilityFilter` for headless
navigation tests.

**Smooth scrolling vs fast input.** The default is `scrollBehavior: 'auto'`,
which follows the target scroll container's computed CSS `scroll-behavior`.
When smooth scrolling comes from either the option or CSS, rects are read
mid-animation if input outruns the scroll, which can change target selection
or produce no target. Use explicit `scrollBehavior: 'instant'` when
deterministic rapid chains matter.

**Reduced motion.** `prefers-reduced-motion` downgrades an explicit
`scrollBehavior: 'smooth'` option to `instant` and disables the optional
`.spatial-pop` scale effect. With the default `auto`, application CSS remains
responsible for adapting any CSS `scroll-behavior: smooth` rule. The base focus
outline does not add a transition.

**Transforms.** Scoring uses `getBoundingClientRect`, i.e. post-transform
geometry for both the origin and candidates. The `.spatial-pop` scale therefore
can change classification or scoring; its default 1.04 scale is modest, but
disable it when navigation must be invariant. Large transforms navigate by
the resulting on-screen rects; verify clipped, panned, and offscreen states in
a real browser.

**Animating focusables.** Because geometry is sampled per keypress, a
focusable mid-transition reports a moving rect — a fast arrow press during an
entrance animation can read a half-arrived position and pick the wrong (or
no) target. Prefer **opacity-only** entrance animations for focusables, or
keep transform/size transitions short; avoid animating the width/height or
translate of an element you also navigate to.

**Collapsed rects.** A host layout problem, detached subtree, hidden page, or
zero-sized viewport can collapse many candidates to coincident zero rects. The
engine can emit a one-time diagnostic when a dead end has mostly collapsed
candidates (suppressed when an available `NODE_ENV` is set to `production`).
Inspect host layout and visibility first; minimum sizes or `clamp()` can help
specifically when viewport-relative sizing collapses, but are not a general
fix for every zero-rect cause.

**`contain` governs a container's descendants, not the container itself.**
The scope search starts at the focused element's *parent*, so while focus sits
on the marked element, its own `contain` is not in effect. This matters for
portaled overlays: several libraries focus the panel itself on open, and if
that panel is the element carrying `contain`, directional navigation can leave
it until focus moves to a child. Mark an ancestor instead where the library
gives you one (Ark's `Dialog.Positioner`, for example), or give the panel an
explicit entry point (`data-spatial-autofocus`, `initialFocus`) so focus never
rests on the container. In practice most modal libraries also `aria-hidden`
the rest of the page, which the engine enforces unconditionally, so
containment usually still holds — but do not rely on the marker alone.

**Shadow DOM.** Engine-driven focus and navigation are supported when the root
element is inside open shadow DOM. `getFocused()` follows
`shadowRoot.activeElement` chains because `document.activeElement` retargets to
the host (covered by a regression test). Closed roots, navigation across a
shadow boundary from outside, and every pointer/Tab retargeting combination are
not covered by that contract; test the target browser. Candidate queries stay
inside the configured root's tree.

**iframes.** Each document needs its own instance — pinned by test,
including the cross-realm trap: iframe documents fail `instanceof Document`
checks, so the engine duck-types on `nodeType`. Crossing frame boundaries
is the host app's job via `spatial:nofocustarget` on one side and
`nav.focus()` on the other.

**Deep DOMs.** Ordinary ancestor walks are iterative with path-compressed
memoization, so the tested 300-level plain-element nesting does not recurse
through that path and each distinct ancestor is read once per pass. Descent
through deeply nested spatial-container zones is a separate recursive path and
is not covered by that arbitrary-depth claim; bound and test pathological zone
nesting if an application generates it.

**Elements that are both focusable and containers.** A clickable card that
contains focusable children competes twice — once as itself, once as a
zone — with the two candidacies kept distinct (pinned by test).

**SVG.** SVG `<a href>` elements may match the selector and can have usable
geometry in modern browsers. SVG focus support varies by element and runtime;
test the target browser or provide an explicit `focusableSelector` and rect
policy. Zero-size SVG candidates are skipped like any other zero-size element.

**Disabled fieldsets.** Buttons inside `<fieldset disabled>` match
`:disabled` and are excluded, per the platform.

**NaN gamepad axes.** Flaky drivers reporting NaN/Infinity axes read as
centered rather than emitting phantom directions (pinned by test).

**RTL.** Geometry is physical, not logical: `right` means visually right,
which matches d-pads and arrow keys. Logical-direction mapping (if you want
`nav-forward`) belongs in your keymap layer.
