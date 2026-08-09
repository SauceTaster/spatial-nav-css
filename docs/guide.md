# Guide — getting started & core concepts

## What this library does

It makes “press right, focus moves to the thing on the right” work on the web.
Its model is inspired by Valve's Panorama UI in Dota 2 and Counter-Strike, by
familiar TV/console navigation, and by the **[W3C CSS Spatial Navigation Level
1 Working Draft](https://www.w3.org/TR/css-nav-1/)**, last published in 2019 and
not broadly implemented by browsers. This library is an independent engine,
not a standards polyfill or a Panorama compatibility layer.

Three pieces:

1. **The engine** — given a focused element and a direction, picks the right
   next element (geometry + container semantics), moves real DOM focus,
   scrolls it into view, and emits events.
2. **The spatial CSS surface** — containers, directional containment,
   wrap-around, focus
   memory, default focus, and per-direction overrides, declared with CSS
   custom properties or data attributes. No JS wiring per element.
3. **Input adapters** — keyboard, browser-exposed standard-mapping gamepads,
   common TV/IR key events, and a contract for host-specific input.

## Minimal setup

The registry package has not yet been published. In the meantime, evaluate a
reviewed repository clone with `npm ci` and `npm run build`; the imports
below show the intended first-release package surface.

```ts
import { createSpatialNavigation } from 'spatial-nav-css'
import 'spatial-nav-css/css'

const nav = createSpatialNavigation({ autofocus: true })
nav.start()
```

The default selector includes links, enabled form controls, the first summary
in a details element, elements carrying `contenteditable` other than `false`,
media elements with controls, iframes, and elements with a non-negative
`tabindex`. Add `data-focusable` for an intentional spatial stop, or
customize `focusableSelector` for a different policy. On first spatial focus,
a non-native `data-focusable` element with no existing `tabindex` receives
`tabindex="-1"`, which lets it receive programmatic focus without adding it to
the Tab order.

## Concepts

### Focus is real focus

Spatial moves use DOM focus: native `focus`/`blur` events fire and, for
document-rooted light DOM, the moved-to element becomes
`document.activeElement`. For a root inside open shadow DOM, use
`nav.getFocused()` or that shadow root's `activeElement`; `nav.getFocused()`
also resynchronizes an eligible active descendant if a retargeted event was
missed. In light DOM, when pointer, Tab, or another library moves focus onto a
matching stop, the engine adopts the move immediately through `focusin`.

`nav.getFocused()` reports the current **spatial target**, which is usually the
active DOM element but deliberately persists when DOM focus falls back to
`<body>`/nothing. That lets a later direction or activate intent resume from
the last valid stop. If real focus moves to a different or excluded control,
the engine yields ownership and `getFocused()` returns null for that region.

Real focus supports assistive-technology focus tracking, but it does not supply
semantics. Prefer native controls for actions. Custom controls still need an
appropriate accessible name, role, state, and keyboard behavior, and should be
tested with the assistive technologies the application supports. The engine
also toggles a `spatial-focused` class because gamepad-driven programmatic
focus does not reliably match `:focus-visible`.

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
| `contain` | geometric directional search cannot leave; explicit overrides and programmatic focus can; Tab, pointer, and assistive-technology navigation are unaffected |
| `wrap` | navigation wraps on a travel axis only when the container has candidates behind the current item on that axis |
| `remember` | re-entering restores the last focused child |

### The search, in order

For a move from element E in direction D:

1. **Explicit override** — `data-nav-D` / `--nav-D` on E: `none` blocks,
   a selector jumps. Overrides skip everything below, including spatial
   containment.
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

Adapters use five intent variants: the four user actions `direction`,
`activate`, `release`, and `back`, plus lifecycle plumbing
`activationcancel`. `activate` synthesizes a click on the current spatial
target (cancel via `spatial:activate`); `release` reports the activate control's
hold duration; `activationcancel` abandons a stored press when its release
becomes unobservable and the composed path reports `spatial:activatecancel` on
the original target when it remains connected inside the engine root; and
`back` dispatches a cancelable `spatial:back` for the application to interpret
(close a modal, go back a screen).

## Where to next

- [css-api.md](css-api.md) — spatial properties and attributes
- [js-api.md](js-api.md) — JavaScript and TypeScript API
- [input-devices.md](input-devices.md) — device support, custom adapters
- [frameworks.md](frameworks.md) — React, Vue, Svelte, Web Components
- [recipes.md](recipes.md) — concrete patterns (TV rows, modals, grids…)
- [edge-cases.md](edge-cases.md) — behavior at the boundaries
