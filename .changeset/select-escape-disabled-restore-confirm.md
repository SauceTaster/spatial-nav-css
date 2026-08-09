---
'spatial-nav-css': minor
---

Three fixes surfaced by building a media-server admin and a settings console
against the library:

- **A focused `<select>` is no longer a dead end.** `isEditable` counts
  `<select>`, so the keyboard adapter dropped every mapped key while one held
  focus — but a closed select also consumes all four arrows, Enter, and
  Escape natively, leaving keyboard and remote users unable to leave the
  control at all, with no visible cause. The adapter now treats it like the
  range slider it already special-cased: up/down stay native (they change or
  open the list) and left/right navigate out. Text fields and contenteditable
  are unchanged — they keep every key.

- **Auto-restore covers a control that disables itself.** `autoRestoreFocus`
  observed `childList` only, so it caught removal but not disablement. Since a
  disabled element stops being an eligible target, "the button you pressed
  disables itself while it works" — everywhere in admin UIs — silently killed
  the highlight and made the next press restart from the first focusable.
  The observer now also watches the `disabled` attribute, and the restore
  decision tests eligibility rather than mere connectivity.

- **`spatialConfirm` can open on Cancel.** New `defaultButton: 'ok' | 'cancel'`
  option (default `'ok'`, unchanged). Destructive confirmations should not open
  with the destructive choice already focused, where a held or double-tapped
  activate press lands on it.

Also documented: `wrap` is only safe on containers whose layout is guaranteed
single-axis (a responsive `auto-fit` row that reflows to two rows turns wrap
into accidental containment), and the Escape-delegation pattern for letting
users out of editable controls.
