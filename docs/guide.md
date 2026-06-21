# Guide — getting started & core concepts

## What this library does

It makes "press right, focus moves to the thing on the right" work on the
web, the way it works in Valve's Panorama UI (Dota 2, CS2, the Steam Deck
shell) and on TVs. The W3C drafted this as **CSS Spatial Navigation Level 1**
and abandoned it; this library implements the useful parts of that model with
a modern input layer.

Three pieces:

1. **The engine** — given a focused element and a direction, picks the right
   next element (geometry + container semantics), moves real DOM focus,
   scrolls it into view, and emits events.
2. **The spatial CSS surface** — containers, traps, wrap-around, focus
   memory, default focus, and per-direction overrides, declared with CSS
   custom properties or data attributes. No JS wiring per element.
3. **Input adapters** — keyboard, gamepad (XInput / Steam Input / any HID
   pad), TV/IR remotes, and a contract for anything else.

## Install & minimal setup

```ts
import { createSpatialNavigation } from 'spatial-nav-css'
import 'spatial-nav-css/css'

const nav = createSpatialNavigation({ autofocus: true })
nav.start()
```

Anything natively focusable (buttons, links, inputs) participates
immediately. Add `data-focusable` to let non-interactive elements (cards,
tiles, rows) take focus — the engine gives them a `tabindex` automatically
when focused.

## Concepts

### Focus is real focus

Spatial focus is DOM focus. `document.activeElement` is always the spatially
focused element, native `focus`/`blur` events fire, screen readers follow
along, and clicking with the mouse updates the spatial position (the engine
adopts focus from `focusin`). The engine also toggles a `spatial-focused`
class, because gamepad-driven programmatic focus does not reliably match
`:focus-visible`.

### Containers are zones

A **container** (`data-spatial-container`) is a focus group: a sidebar, a
header, a carousel, a modal. Containers matter twice:

- **Searching**: sibling containers compete as whole zones — one rect each —
  and the search descends into the winning zone. This is what makes "right
  from the sidebar" land in the content area instead of on whatever stray
  element happens to be diagonally nearest.
- **Entering**: a container can declare what gets focus when navigation
  enters it — its `remember`ed last child, or a `data-spatial-autofocus`
  child.

Container tokens compose: `data-spatial-container="contain wrap remember"`.

| token | effect |
| --- | --- |
| *(bare)* | plain group/zone |
| `contain` | focus cannot leave by spatial navigation (modals) |
| `wrap` | navigation wraps around edges, along the container's axis only |
| `remember` | re-entering restores the last focused child |

### The search, in order

For a move from element E in direction D:

1. **Explicit override** — `data-nav-D` / `--nav-D` on E: `none` blocks,
   a selector jumps. Overrides skip everything below, including traps.
2. **Scoped geometric search** — starting in E's innermost container:
   elements directly in the scope plus nested containers-as-zones compete;
   best candidate wins (see scoring in the README); zone winners are entered
   via descent.
3. **Wrap** — if the scope has `wrap` and there are candidates *behind* E on
   this axis, wrap to the far side.
4. **Escalate** — if the scope is not `contain`, move the search to the
   parent scope and repeat.
5. **Give up** — dispatch `spatial:nofocustarget` on E (hook this for
   pagination / lazy loading).

Entering a container redirects to its memory (`remember`), then its declared
default focus, then the geometric pick.

### Intents, not keys

Adapters reduce devices to three intents: `direction`, `activate`, `back`.
`activate` synthesizes a click on the focused element (cancel via
`spatial:activate`); `back` dispatches a cancelable `spatial:back` for your
app to interpret (close modal, go back a screen).

## Where to next

- [css-api.md](css-api.md) — every property and attribute
- [js-api.md](js-api.md) — every function and type
- [input-devices.md](input-devices.md) — device support, custom adapters
- [frameworks.md](frameworks.md) — React, Vue, Svelte, Web Components
- [recipes.md](recipes.md) — concrete patterns (TV rows, modals, grids…)
- [edge-cases.md](edge-cases.md) — behavior at the boundaries
