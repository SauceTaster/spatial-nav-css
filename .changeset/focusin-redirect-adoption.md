---
'spatial-nav-css': patch
---

Don't adopt a focus target the application has already moved away from. A
component that redirects entry — a menu sending focus from its panel to the
first item in its own `focusin`/`onFocus` handler — runs *before* the engine's
document-level listener, because React dispatches from its root container.
The engine then adopted the event's original target, stranding the focus ring
on an element that no longer held DOM focus, and the next direction press
started its search from there instead of from where the user actually was.
The engine now ignores a `focusin` whose target is no longer the active
element; the redirect raises its own event, which is adopted normally.
