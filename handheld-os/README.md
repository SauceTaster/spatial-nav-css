# handheld-os

A gamepad-first OS shell for a handheld gaming device, in the shape of SteamOS
Game Mode. Everything is driven by directional input: there is no mouse, no
Tab key, and no assumption that a pointer exists.

It is a real application — boot sequence, view stack, quick-access overlay,
background downloads, a player that keeps going while you browse — and it is
also the most demanding integration test [`spatial-nav-css`](../) has. Every
screen was chosen because it is hard to navigate with a D-pad.

```sh
npm install
npm run dev          # the OS at http://localhost:5180
npm run storybook    # components and shell states in isolation
npm test             # jsdom suite
npm run ci           # unit + browser/a11y story tests, then both builds
```

Drive it with **arrows** (D-pad), **Enter** (A), **Escape/Backspace** (B), and
**Q** for the quick-access menu. A standard-mapping gamepad works too — plug
one in and press a button.

## What is in here

| Screen | Why it exists |
| --- | --- |
| **Home** | Recent rail + system destinations. The `remember` baseline: come back from a game and you are on the tile you launched. |
| **Library** | 420 games, virtualized, with **accelerated scrolling** — hold down and it goes item → stride → jump-by-letter, with a section rail that follows. |
| **Game** | Detail, install/uninstall with confirmation, properties tear sheet. |
| **Storage** | A **WizTree-style squarified treemap** of real focusable blocks. Wildly uneven adjacent rectangles: the hardest thing you can ask a distance function to do. |
| **Files** | A filesystem tree with expand/collapse and the standard left/right tree contract, over spatial navigation. |
| **Media** | Transport, seek, and a track library. The player is shell state, so it survives leaving the view. |
| **Downloads** | A dense TanStack Table v8 with **faceted filters** (live counts per value), sorting, and per-row actions. Every interactive cell is its own stop. |
| **Settings** | Deep nested settings with server-side validation surfaced on the offending field. |
| **Quick access** | The side panel that slides over anything, with the screen behind made `inert`. |

## Reading order, if you are here for the navigation

1. [`ARCHITECTURE.md`](ARCHITECTURE.md) — the three decisions: why not RAC, why
   not a shadcn catalog, how state is split, and why navigation is a stack
   machine rather than a router.
2. [`src/nav/useFastScroll.ts`](src/nav/useFastScroll.ts) — accelerated
   scrolling, and the one place this app needed something from the library
   (`detail.repeat`, which distinguishes a held control from a tap).
3. [`src/os/OsShell.tsx`](src/os/OsShell.tsx) — the containment policy, in one
   place: exactly one layer is interactive, and `inert` is what makes that
   true for the engine, for Tab, and for a pointer alike.
4. [`src/state/shell.ts`](src/state/shell.ts) — what is *not* in the store.

## Conventions worth copying

- **Focus is styled from `[data-spatial-focused]`, never `.spatial-focused`.**
  React rewrites `className` on its next render and drops the class with it —
  including on the render that focus itself triggers.
- **`contain` only on modal overlays.** On anything else it is a trap: you can
  enter and never leave. Sibling zones use `remember` instead.
- **`aria-disabled`, not `disabled`.** A disabled element stops being a spatial
  stop, so the highlight dies under the user's thumb.
- **Steppers, not sliders.** A native `<input type="range">` keeps left/right
  for its own value, which on a device where left/right is also how you leave
  the control makes it a dead end. See the comment on `Stepper`.

## Testing caveat worth knowing

An automated browser pane that is not painting does not dispatch `scroll`
events, and may report a zero-size viewport. A virtualized list then appears
to freeze at the edge of its mounted window — the virtualizer never learns
that `scrollTop` moved — which looks exactly like a navigation bug and is not
one. Dispatching a synthetic `new Event('scroll')` on the scroller advances
the window immediately, which is the quickest way to tell the two apart.
Front the pane, or drive the app in a real browser, when testing anything
scroll-dependent.

## Status

Early, but real. The device services are mocked at the `fetch` boundary with
MSW, so the same handlers serve the app, Storybook and the tests — swapping in
a real backend is a matter of deleting the worker, not rewriting the views.
CI runs every story headlessly in Chromium and fails on axe violations; this
has already caught contrast and invalid-role defects that jsdom could not see.
