# handheld-os — architecture

A gamepad-first OS shell for a handheld gaming device, in the shape of SteamOS
Game Mode. It is a real application, not a widget gallery: it has a boot
sequence, a view stack, a quick-access overlay, background downloads, a media
player that keeps playing while you browse, and a storage view you can actually
navigate.

It doubles as the most demanding integration test `spatial-nav-css` has — every
screen here was chosen because it is hard to navigate with a D-pad.

## The three decisions that shape everything

### 1. Component library: neither RAC nor shadcn wholesale

**react-aria-components is the wrong default for this.** RAC collections use
roving tabindex: a whole `ListBox` or `GridList` presents itself as a *single*
tab stop and owns the arrow keys inside it. That is exactly right for a
keyboard-and-screen-reader web app, and exactly wrong here, where the D-pad
*is* the primary input — every list would need an application bridge to be
traversable, and semantic (gamepad) intents never reach RAC's key handlers at
all. See `docs/frameworks.md` in the library for the full contract.

**shadcn/ui is half right.** Its foundation — Radix primitives, copied into
your repo rather than imported as a black box — is the correct instinct for
overlays, where a real focus trap and `aria-modal` are genuinely hard to get
right. Its catalog and Tailwind layer buy little for an OS shell that needs its
own visual language and its own tokens.

**So:** this app owns its component layer, and reaches for **Radix Dialog only
where behavior is hard** (modals, tear sheets). Everything else — rails, grids,
the tree, the treemap, transport controls — is plain focusable DOM, which is
precisely what a spatial engine wants to measure. Buttons are `<button>`s.

### 2. State: three kinds, kept apart

| Kind | Owner | Why |
| --- | --- | --- |
| **Server state** — library, storage, downloads, media | TanStack Query over MSW | The cache *is* the state. Never copied into a store; a second copy is a second source of truth. |
| **Shell state** — view stack, overlays, player transport, prefs | one Zustand store, sliced | Synchronous, cross-cutting, and read by things that must not re-render on every query tick. |
| **Focus** | the DOM, via the engine | Deliberately *not* in the store. |

That last row is the one people get wrong. Focus is real DOM focus; mirroring
it into application state creates two sources of truth that drift the moment
anything re-renders. Per-view focus memory is expressed declaratively with
`data-spatial-container="remember"`, and the engine restores it. The store
knows *which view* is open; it does not know what is focused inside it.

### 3. Navigation: a stack machine, not a router

An OS shell is not a set of URLs. It is a stack you push and pop, with an
overlay layer that can cover any of it:

```
overlays: [ QuickAccess | Modal | Sheet ]   ← at most one interactive at a time
views:    [ Home > Library > GameDetail ]   ← back pops
```

`spatial:back` (B / Escape) pops the top overlay, then the top view. Modelling
this explicitly gives correct back semantics for free and keeps the "what is
interactive right now" question answerable in one place — which matters,
because the answer decides where focus containment goes.

## Fast scrolling

Holding down in a 400-game library should not walk 400 times. The escalation is
the one in every console UI:

1. discrete presses → one item
2. held past a threshold → several items per step
3. held longer → jump to the next *section* (the next letter)

This needs to distinguish a held repeat from a discrete press, which only the
input adapter knows. The library carries it on `detail.repeat` (added for this
app); `useFastScroll` counts consecutive repeats, vetoes the engine's one-step
move with `preventDefault()` on `spatial:beforefocus`, and focuses the computed
target instead.

## Layout

| Path | What |
| --- | --- |
| `src/os/` | shell: frame, view stack, overlay layer, boot |
| `src/state/` | Zustand store slices |
| `src/services/` | MSW handlers + seeded device data + query options |
| `src/ui/` | the component layer (buttons, rails, sheets, tree, treemap…) |
| `src/views/` | one directory per screen |
| `src/nav/` | spatial helpers: fast scroll, section rails, focus restore |
| `src/test/` | setup + the jsdom layout simulator |

## Testing

Same approach as the library's `examples/`: jsdom has no layout, so unit tests
describe geometry explicitly and let the engine run its real measurement path.
The Storybook Vitest project renders every story in headless Chromium and runs
the a11y addon with violations set to errors, covering browser and accessibility
behavior that jsdom and a static Storybook build cannot.

Two environment traps, both of which look like navigation bugs:

- **A non-painting browser pane dispatches no `scroll` events**, so a
  virtualizer never updates its mounted window and a held direction appears to
  stall at the edge. Dispatch a synthetic `new Event('scroll')` to tell the
  difference.
- **The library is aliased to source outside this package**, so `react`
  resolves twice — once from the repo root, once from here — and every hook
  the adapter calls throws "Invalid hook call". `resolve.dedupe` in
  `vite.config.ts` pins one copy; don't remove it.
