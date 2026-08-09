---
'spatial-nav-css': minor
---

**The remote no longer goes dead after a portaled dialog opens.** Framework
focus traps (MUI, Radix, Headless UI) focus the dialog's own `tabindex="-1"`
surface on open. The engine had no spatial target, but saw a non-body
`activeElement` and concluded focus was claimed — so `claimFocus()` refused and
the first direction press was swallowed too. Nothing owned that element
spatially, so there was no reason to defer to it.

Focus parked on an element *inside the root that does not qualify as a spatial
stop* now counts as unclaimed, while focus on a real stop — possibly another
navigation region's — still does not, so regions continue not to steal from
each other. The rule is available directly as `engine.canClaimFocus()`.

The engine also re-adopts the already-focused element when an overlay's exit
transition removes the `aria-hidden` it put on the page. DOM focus is back on
the trigger by then but no focus event fires, so the engine used to stay empty
and auto-restore would later drag the user to the first focusable on the page
instead of the control they came from.
