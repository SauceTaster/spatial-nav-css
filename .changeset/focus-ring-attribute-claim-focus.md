---
'spatial-nav-css': minor
---

Two fixes found by building realistic data-driven applications against the
library:

- **The focus ring no longer disappears in framework apps.** The engine marked
  the focused element with a class only, so any component that renders
  `className` / `:class` / `class:` erased it on the next reconcile — including
  the render that focus state itself triggers, which is exactly the documented
  React pattern (`className={focused ? … : …}`). The engine now also sets a
  `data-spatial-focused` attribute, and the bundled stylesheet's ring, glow,
  and pop rules match it. Nothing renders that attribute, so the ring survives
  re-renders in React, Vue, Svelte, Solid, and Lit. Prefer
  `[data-spatial-focused]` over `.spatial-focused` in application CSS.

- **New `nav.claimFocus(target?)`** — focus a target (or the default/first
  focusable) only while focus is still unclaimed: nothing is spatially focused,
  and DOM focus is idle or parked on a non-spatial element inside the engine
  root. An eligible stop or focus outside the root remains claimed, so another
  navigation region cannot steal it. `autofocus` is a one-shot that runs at
  `start()`, when a data-driven screen is still skeletons, so content that
  arrives later never receives focus; calling `claimFocus()` when the data
  lands fills that gap without yanking focus from a user who already started
  navigating. It reports `source: 'claim'` on `spatial:focus`. See the new
  "Focusing content that loads asynchronously" recipe.
