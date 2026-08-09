# Spatial CSS reference

Spatial configuration can be expressed in two forms that read as one config:

- **CSS custom property** — participates in the cascade, media queries,
  themes, and container queries. Read via `getComputedStyle` at navigation
  time, so runtime CSS changes apply immediately.
- **Data attribute** — a directional or container attribute replaces the
  corresponding CSS value on the same element. `data-spatial-autofocus` is a
  boolean opt-in, so default focus is enabled when either form opts in. Use
  attributes in environments without `@property` support (see Inheritance
  below).

## Per-direction overrides

| CSS | Attribute | Values |
| --- | --- | --- |
| `--nav-up` | `data-nav-up` | `"<selector>"` \| `none` |
| `--nav-down` | `data-nav-down` | ⬆ same |
| `--nav-left` | `data-nav-left` | ⬆ same |
| `--nav-right` | `data-nav-right` | ⬆ same |

- A **selector** jumps focus to its first match in the nav root. That first
  match must be an eligible spatial target: it must match the configured
  focusable selector, be enabled, and pass the visibility check. Otherwise the
  move fails; later selector matches and geometry are not tried because an
  override is authoritative.
- **`none`** blocks the direction entirely.
- An empty value or `auto` removes the explicit route and lets geometry run.
- Overrides bypass container semantics: spatial containment, wrap, memory, and
  default focus are all skipped. They are the escape hatch *and* the precision
  tool.
- These names deliberately echo the experimental `nav-up`/`nav-right`
  properties currently specified in [CSS Basic User Interface Level
  4](https://www.w3.org/TR/css-ui-4/).
  Historical implementation was limited, and they are not interoperably
  available in current browsers.

```css
.settings-row:last-child { --nav-down: none; }
.search-input { --nav-left: "#sidebar-search"; }
```

## Containers

| CSS | Attribute |
| --- | --- |
| `--spatial-container: <tokens>` | `data-spatial-container="<tokens>"` |

Tokens (space-separated, any order): `contain`, `wrap`, `remember`. Any present
`data-spatial-container` marks a group; a bare attribute or a value with no
recognized tokens is therefore a plain group. In CSS, an empty value, `none`,
or `normal` means “not a container”; any other token-less value marks a plain
group. Unknown tokens are ignored.

```css
.modal    { --spatial-container: contain; }
.carousel { --spatial-container: wrap remember; }
```

```html
<div data-spatial-container="contain wrap remember">…</div>
```

Notes:

- A configured `HTMLElement` engine root can itself carry
  `data-spatial-container` or `--spatial-container` and participates as the
  outermost container; root-level `wrap` and `remember` are honored. A
  `Document` root is the implicit outer boundary and has no element config.
- `contain` stops this library's directional search from leaving the
  container. It does not contain Tab, pointer, or assistive-technology
  navigation and is not, by itself, an accessible modal focus trap.
- `wrap` only engages along the axis where the container has items behind
  the focused element — pressing down in a horizontal row exits the row, it
  does not wrap sideways.
- Because of that, **`wrap` is only safe on a container whose layout is
  guaranteed to stay single-axis**. A responsive
  `grid-template-columns: repeat(auto-fit, …)` row that reflows to two rows at
  a narrow viewport suddenly has items behind the focused one on the vertical
  axis too, so "down" at the last row wraps back to the first instead of
  leaving the container — containment the author never asked for, with no
  `contain` token in sight. Pin the track count (`repeat(4, …)`) when you use
  `wrap`, or drop the token and let geometry handle the edges.
- `remember` memory is held in a WeakMap; if the remembered element is
  removed or hidden, entry falls back to default focus, then geometry.
- A zone rect unions the container's box with its mounted focusable
  descendants. Focusables clipped outside a scroll box still contribute;
  unmounted virtual items and non-focusable content do not.

## Default focus

| CSS | Attribute |
| --- | --- |
| `--spatial-default-focus: auto` | `data-spatial-autofocus` |

Marks the preferred entry element of its container, and of the page for
`focusFirst()` / the `autofocus` option. With `remember`, memory wins over
default focus once the container has been visited.

## Focusability

The default focusability policy includes:

```
a[href]; enabled button, non-hidden input, select, and textarea;
details > summary:first-of-type;
an element with contenteditable other than false;
audio[controls]; video[controls]; iframe;
elements with a non-negative tabindex;
[data-focusable]
```

This selector covers common native controls, not every element a browser can
focus. `data-focusable` creates an intentional spatial stop. If a non-native
opt-in has no `tabindex`, the engine assigns `tabindex="-1"` on first focus so
it can hold DOM focus without automatically joining the Tab order. Under the
default policy, a negative `tabindex` removes other elements as stops; adding
`data-focusable` opts an element back in deliberately. Override the policy with
the `focusableSelector` option for an application-specific composite-widget
model.

Focusability is not semantics. Prefer native controls for actions. A custom
focusable still needs an appropriate accessible name, role, state, and keyboard
behavior, and should be tested with assistive technology.

An element is skipped when it (or an ancestor) is `[hidden]`, `[inert]`, or
`[aria-hidden="true"]`, or when an open native modal (`dialog:modal`) does not
contain it. **This semantic policy is enforced unconditionally**, because it is
what keeps focus inside a modal: portaled overlay libraries (Radix, MUI,
Headless UI, Ark) all contain focus by `aria-hidden`-ing the rest of the page
rather than using a native `<dialog>`.

Separately, the element must be *rendered*. Where supported,
`checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true })` tests
for an associated rendered box and respects CSS visibility (both option
spellings are sent: the newer name only landed in Chromium 121 / Firefox 122).
The fallback rejects elements with no client rects, as well as
`visibility: hidden|collapse`. Elements clipped by `overflow` are **not**
skipped — being scrolled out of view is a position, not an absence.

`visibilityFilter` replaces **only** the rendering half; the semantic policy
still applies on top, so a custom filter cannot accidentally expose the page
behind an open dialog. Both halves are exported for direct use as
`isSemanticallyNavigable(el)` and `isRendered(el)`, with `isElementVisible(el)`
as their conjunction.

Note that the `aria-hidden` check is a defensive engine policy: `aria-hidden`
does **not** disable native focus or pointer interaction and must not be used
on a focusable element or an ancestor of one in your own markup. Prefer
`inert`, `hidden`, disabling, or removal when content is unavailable.

Likewise, `aria-disabled="true"` exposes an accessibility state but does not
disable native focus or click behavior, and the engine does not exclude it the
way it excludes native `:disabled`. An aria-disabled custom control must
suppress activation itself while preserving the expected focus and state
semantics.

## Theming (from css/spatial.css)

| Variable | Default | Purpose |
| --- | --- | --- |
| `--spatial-focus-ring-color` | `#1a9fff` | ring color |
| `--spatial-focus-ring-glow` | `rgba(26,159,255,.45)` | outer glow |
| `--spatial-focus-ring-width` | `3px` | ring width |
| `--spatial-focus-ring-offset` | `2px` | ring offset |
| `--spatial-focus-ring-radius` | `6px` | bundled dialog radius; the base focus outline does not replace application radii |
| `--spatial-scroll-margin` | `24px` | breathing room when scrolled into view |

Classes: the engine toggles **`.spatial-focused`** on the current element and
mirrors it with a **`[data-spatial-focused]`** attribute. The bundled sheet
styles both, and **application CSS should prefer the attribute**: a framework
that renders `className` / `:class` / `class:` rewrites the class attribute on
its next render, which drops the class — including on the very render that
focus state triggers. Nothing renders the data attribute, so it survives
reconciliation. `focusClass` renames only the class; the attribute is fixed.
When you replace the class, mirror the replacement-class styles in
application CSS (the bundled sheet's ring, glow, and pop select
`.spatial-focused` and `[data-spatial-focused]`). Opt into the glow with
**`.spatial-glow`** or the Panorama-style scale-pop with **`.spatial-pop`**.
When styling a **third-party component**, key off `[data-spatial-focused]` and
expect the ring to land on whatever element actually receives focus — for a
Material UI `Switch` or `Checkbox` that is the visually hidden `<input>` laid
over the control, not the control itself. Hoist it with `:has()`:

```css
.MuiButtonBase-root:has(> [data-spatial-focused]) { outline: 2px solid …; }
```

Component libraries also paint their own focus styling from `:focus-visible`
(`.Mui-focusVisible` and friends), which controller-driven programmatic focus
does not set — so the engine's indication is the one to rely on there.

The base sheet does not replace application box shadows, radii, stacking,
cursors, text selection, or transitions. Reduced motion disables the pop;
forced-colors mode uses the system highlight and disables the optional glow.

## Testing the cascade

The CSS surface is covered at three levels:

- `tests/weird-css.test.ts` — real stylesheets in jsdom: quoted/unquoted
  values, hostile tokens, precedence, pure-CSS containers (contain/wrap/
  remember from a class alone), runtime cascade changes, the no-@property
  degradation path.
- `tests/spatial-css.test.ts` — structural contracts on the shipped
  stylesheet (`@property` registrations, the focus outline and
  reduced-motion blocks, nonintrusive pointer/selection behavior, and
  theming-variable defaults).
- `demo/css-conformance.html` — a self-running real-browser integration page,
  also loaded by the Playwright smoke suite, for what jsdom can't evaluate:
  `@property inherits: false` actually stopping
  container inheritance, `@media`-scoped config, `var()` substitution in
  computed custom properties, and the painted focus ring. Results land in
  `window.__cssConformance`. Run the browser suite after touching the config
  reader or stylesheet.

## Inheritance (important)

Custom properties inherit by default. The stylesheet registers all
engine-read properties with `@property … inherits: false`, so
`--spatial-container` on an element does not turn every descendant into a
container. If you target browsers without `@property` **and** configure via
CSS, either scope values carefully (`> *  { --spatial-container: initial }`)
or use the data-attribute forms, which never inherit.
