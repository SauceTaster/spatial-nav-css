---
'spatial-nav-css': minor
---

Harden the public package and make its defaults less intrusive:

- Keep scoped engines from claiming focus owned elsewhere; validate focus
  targets and activation state after DOM mutations, and pair activate releases
  with their original press targets, including concurrent controller sessions
  and observable cancellation when an input source disappears.
- Expand default native focusability, preserve editable/radio/range keyboard
  behavior, use radial gamepad deadzones, and improve iframe, shadow-DOM, and
  server-rendering safety across the core and framework adapters.
- Make the base stylesheet outline-only by default, with glow and scale effects
  opt in, and change the default scroll behavior from `smooth` to `auto`.
- Improve dialog semantics and focus restoration, virtual-list cancellation,
  custom-element registration, package metadata, release automation, and
  browser/package regression coverage.
