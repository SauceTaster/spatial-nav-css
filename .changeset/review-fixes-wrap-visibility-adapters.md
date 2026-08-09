---
'spatial-nav-css': patch
---

Fix defects found in the pre-release review:

- **Wrap no longer fires on orthogonal presses in misaligned rows.** The wrap
  guard accepted the loose "overlapping" direction tier, so a sibling sitting
  a few pixels off-axis (baseline alignment, mixed card heights) counted as
  being behind the origin. Pressing down in a horizontal `wrap` row moved
  sideways instead of exiting it, and under `contain wrap` focus could never
  rest at the row edge. The guard now requires a candidate strictly beyond
  the origin on the travel axis, matching the documented per-axis behavior.
- **`visibility: hidden` is excluded on pre-121 Chromium again.** The
  visibility check passed only the `visibilityProperty` option name, which
  Chromium 105–120 and Firefox 106–121 (including the browsers on current
  Tizen/webOS TVs) silently ignore — degrading the call to a rendered-box
  test that let invisible elements take spatial focus. Both option spellings
  are now sent.
- **No phantom long-press from the gamepad adapter.** A button held across a
  frozen period (`alert()`, tab switch) reported a release whose `durationMs`
  included the blocked time, triggering long-press actions the user never
  performed. Retained presses are now cancelled on resume, matching the
  keyboard adapter's blur behavior.
- **Framework bindings no longer delete declarative attributes.** The React,
  Vue, and Svelte focusable bindings removed every `data-nav-*` /
  `data-spatial-autofocus` they had no option for, clobbering navigation
  declared directly in markup. Each binding now tracks what it wrote and
  restores the previous value when an option is withdrawn.
- **Late-mounted and swapped elements are wired.** `useFocusable` (React) and
  `useSpatialFocused` (react-aria) return a callback ref — still readable via
  `.current` — and Vue's `useFocusable` watches `elRef`, so an element behind
  a conditional is registered when it appears and the old node is cleaned up.
- **`<spatial-nav auto-focus>` works for parser-created elements**, retrying
  after `DOMContentLoaded` when the microtask ran before children parsed.
- **`attachDebugOverlay` validates its selector** before attaching anything,
  instead of leaking the overlay layer and four listeners on a malformed one.
- Engine-added `tabindex` bookkeeping no longer retains removed nodes when
  `autoRestoreFocus` is off.
- `engines` no longer constrains consumers (the Node 22 floor is repo tooling
  only; it moves to `devEngines`), and the Changesets version PR now updates
  `package-lock.json`.
