---
'spatial-nav-css': minor
---

**Modal containment no longer depends on the default visibility filter.**
Found by building Radix UI, MUI, Headless UI, and Ark UI integrations: every
portaled overlay library keeps focus inside a modal by `aria-hidden`-ing the
rest of the page rather than using a native `<dialog>`, and the engine's
`aria-hidden` / `inert` / `hidden` / open-modal exclusion lived *inside* the
replaceable `visibilityFilter`. Any application that supplied its own filter —
commonly to work around a measurement quirk — silently lost the ability to keep
spatial focus inside its own modals, so arrow keys could reach and activate
controls behind an open overlay.

That policy is now enforced unconditionally and a custom `visibilityFilter`
augments it instead of replacing it: an element must be both semantically
reachable and pass your filter. The default behavior is byte-for-byte
unchanged. Two new exports make the split usable directly:
`isSemanticallyNavigable(el)` and `isRendered(el)`; `isElementVisible(el)`
remains their conjunction.

Also in this release:

- **`nav.back()`** is forwarded on `SpatialNavigation`, like every other engine
  operation, so an app's own back affordance no longer has to reach through
  `nav.engine.back()`.
- New documentation for integrating portaled overlay libraries (portals and
  scoped roots, roving-tabindex collections needing `data-focusable`, triggers
  that do not act on `click`, and stray focus guards).
