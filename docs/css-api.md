# Spatial CSS reference

Every knob exists in two forms that read as one config:

- **CSS custom property** — participates in the cascade, media queries,
  themes, and container queries. Read via `getComputedStyle` at navigation
  time, so runtime CSS changes apply immediately.
- **Data attribute** — wins when both are set on the same element. Use these
  in environments without `@property` support (see Inheritance below).

## Per-direction overrides

| CSS | Attribute | Values |
| --- | --- | --- |
| `--nav-up` | `data-nav-up` | `"<selector>"` \| `none` |
| `--nav-down` | `data-nav-down` | ⬆ same |
| `--nav-left` | `data-nav-left` | ⬆ same |
| `--nav-right` | `data-nav-right` | ⬆ same |

- A **selector** jumps focus to the first match in the nav root. The target
  must pass the visibility check; otherwise the move fails (no fallback to
  geometry — an override is authoritative).
- **`none`** blocks the direction entirely.
- Overrides bypass container semantics: traps, wrap, memory, and default
  focus are all skipped. They are the escape hatch *and* the precision tool.
- These names deliberately echo the CSS3-UI `nav-up`/`nav-right` properties
  that browsers never shipped.

```css
.settings-row:last-child { --nav-down: none; }
.search-input { --nav-left: "#sidebar-search"; }
```

## Containers

| CSS | Attribute |
| --- | --- |
| `--spatial-container: <tokens>` | `data-spatial-container="<tokens>"` |

Tokens (space-separated, any order): `contain`, `wrap`, `remember`.
A bare attribute (or any non-`none`/`normal` CSS value) marks a plain group.

```css
.modal    { --spatial-container: contain; }
.carousel { --spatial-container: wrap remember; }
```

```html
<div data-spatial-container="contain wrap remember">…</div>
```

Notes:

- `wrap` only engages along the axis where the container has items behind
  the focused element — pressing down in a horizontal row exits the row, it
  does not wrap sideways.
- `remember` memory is held in a WeakMap; if the remembered element is
  removed or hidden, entry falls back to default focus, then geometry.
- Zone search treats a scrollable container as its full content band, so
  items scrolled out of the visible box still count as part of the zone.

## Default focus

| CSS | Attribute |
| --- | --- |
| `--spatial-default-focus: auto` | `data-spatial-autofocus` |

Marks the preferred entry element of its container, and of the page for
`focusFirst()` / the `autofocus` option. With `remember`, memory wins over
default focus once the container has been visited.

## Focusability

The default focusable selector is:

```
a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]),
select:not(:disabled), textarea:not(:disabled)   — each :not([tabindex="-1"]),
[tabindex]:not([tabindex="-1"]), [data-focusable]
```

`data-focusable` opts non-interactive elements in; the engine assigns
`tabindex="-1"` on first focus so they can hold real DOM focus (which is why
the opt-in branch ignores tabindex). On *native* widgets, an explicit
`tabindex="-1"` removes them as stops — that's how a slider nested inside a
focusable settings row stays passive. Override the whole selector with the
`focusableSelector` option.

An element is skipped when it (or an ancestor) is `[hidden]`, `[inert]`, or
`[aria-hidden="true"]`, when it has no client rects, or when
`visibility: hidden|collapse`. Elements clipped by `overflow` are **not**
skipped — being scrolled out of view is a position, not an absence.

## Theming (from css/spatial.css)

| Variable | Default | Purpose |
| --- | --- | --- |
| `--spatial-focus-ring-color` | `#1a9fff` | ring color |
| `--spatial-focus-ring-glow` | `rgba(26,159,255,.45)` | outer glow |
| `--spatial-focus-ring-width` | `3px` | ring width |
| `--spatial-focus-ring-offset` | `2px` | ring offset |
| `--spatial-focus-ring-radius` | `6px` | ring radius |
| `--spatial-focus-transition` | `120ms ease-out` | ring/pop transition |
| `--spatial-scroll-margin` | `24px` | breathing room when scrolled into view |

Classes: the engine toggles **`.spatial-focused`** on the current element
(override `focusClass` to change). Opt into the Panorama-style scale-pop
with **`.spatial-pop`**. Both respect `prefers-reduced-motion`.

## Testing the cascade

The CSS surface is covered at three levels:

- `tests/weird-css.test.ts` — real stylesheets in jsdom: quoted/unquoted
  values, hostile tokens, precedence, pure-CSS containers (contain/wrap/
  remember from a class alone), runtime cascade changes, the no-@property
  degradation path.
- `tests/spatial-css.test.ts` — structural contracts on the shipped
  stylesheet (@property registrations, ring rules, reduced-motion,
  theming-variable defaults).
- `demo/css-conformance.html` — a self-running real-browser page for what
  jsdom can't evaluate: `@property inherits: false` actually stopping
  container inheritance, `@media`-scoped config, `var()` substitution in
  computed custom properties, and the painted focus ring. Results land in
  `window.__cssConformance`. Run it after touching the config reader or
  the stylesheet.

## Inheritance (important)

Custom properties inherit by default. The stylesheet registers all
engine-read properties with `@property … inherits: false`, so
`--spatial-container` on an element does not turn every descendant into a
container. If you target browsers without `@property` **and** configure via
CSS, either scope values carefully (`> *  { --spatial-container: initial }`)
or use the data-attribute forms, which never inherit.
