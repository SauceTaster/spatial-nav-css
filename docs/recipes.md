# Recipes — common use cases

Concrete patterns, shortest-thing-that-works first. All HTML-form examples
work identically with the React/Vue/Svelte adapters.

## TV / streaming home screen (rails of cards)

Rows that remember their column, vertical movement between rails:

```html
<main>
  <div class="rail" data-spatial-container="remember">
    <div class="card" data-focusable>…</div>
    …
  </div>
  <div class="rail" data-spatial-container="remember">…</div>
</main>
```

- `remember` per rail gives the "come back to where you were" feel.
- Don't add `wrap` to rails unless you really want carousel semantics —
  wrap means left from the first card jumps to the last.
- Zone search treats each rail as a band, so up/down moves between rails
  even when the focused card is scrolled far to the right.

## Game-launcher shell (header + sidebar + content)

```html
<header data-spatial-container>
  <button data-spatial-autofocus>Store</button> …
</header>
<nav data-spatial-container="remember"> … </nav>
<main>
  <div data-spatial-container="wrap remember"> … </div>
</main>
```

Sibling containers compete as zones, so "right from the sidebar" reliably
enters the content area, and "up from anywhere" lands on the header's
declared default focus.

## Modal dialog (trap + back to close)

**Native `<dialog>.showModal()` needs nothing**: the engine recognizes the
top layer (`dialog:modal`), so everything outside stops being a candidate
while the modal is open, and the browser restores focus on `close()` — the
engine adopts it automatically.

```ts
dialog.showModal()
nav.focus('#dialog-confirm')                          // pick the entry point
document.addEventListener('spatial:back', (e) => {    // B / Escape closes
  if (dialog.open) { e.preventDefault(); dialog.close() }
})
```

**Custom overlays** (a positioned `<div>`, no top layer) declare the trap
and handle restore themselves:

```html
<div class="modal" data-spatial-container="contain">
  <button data-spatial-autofocus>Confirm</button>
  <button>Cancel</button>
</div>
```

```ts
nav.focus('.modal [data-spatial-autofocus]')          // enter on open
// on close: nav.focus(previouslyFocused)
```

React Aria's `Modal` hides outside content with `aria-hidden`, which the
engine already respects — adding `spatialZone('contain')` is defense in
depth. In environments without `:modal` selector support, add
`data-spatial-container="contain"` to native dialogs too.

## Pagination / infinite scroll at the edge

`spatial:nofocustarget` fires on the focused element when a direction finds
nothing — the hook for loading more:

```ts
grid.addEventListener('spatial:nofocustarget', async (e) => {
  if (e.detail.direction !== 'down') return
  await loadNextPage()                  // append more cards
  nav.navigate('down')                  // retry now that they exist
})
```

## Settings form (mixed widgets)

Text fields need their arrow keys; the keyboard adapter already ignores
events from editable elements, so focus "sticks" inside an input until the
user Tabs or clicks out (Escape still raises `spatial:back`).

Range sliders work the console way out of the box: **left/right adjust the
value, up/down navigate away**. Mark vertical sliders with
`aria-orientation="vertical"` and the axes swap.

Console-style **settings rows that contain a slider** (the row is the
focusable, PS5/Switch style): keep the inner input out of the focus order
with `tabindex="-1"` and forward the row's horizontal keys to it:

```html
<div class="row" data-focusable>Rumble <input type="range" tabindex="-1"></div>
```

```ts
window.addEventListener('keydown', (e) => {
  const slider = nav.getFocused()?.querySelector('input[type="range"]')
  if (!slider) return
  if (e.key === 'ArrowLeft')  { slider.stepDown(); e.stopImmediatePropagation(); e.preventDefault() }
  if (e.key === 'ArrowRight') { slider.stepUp();   e.stopImmediatePropagation(); e.preventDefault() }
}, { capture: true })
```

(See it live in the controller demo.)

Last row of the form, prevent falling out the bottom:

```css
.settings .row:last-child { --nav-down: none; }
```

## Grid with a "jump to sidebar" shortcut

```css
.grid .card:nth-child(4n + 1) { --nav-left: "#sidebar .active"; }
```

Per-direction overrides are ordinary CSS — they can vary by media query,
theme, or `:nth-child` like anything else.

## Virtualized lists (TanStack Virtual, react-window & friends)

Geometry is read at navigation time, so the engine follows whatever is
mounted; past the mounted edge, `attachVirtualEdges` from
`spatial-nav-css/virtual` continues navigation (scroll → mount → focus):

```ts
import { attachVirtualEdges } from 'spatial-nav-css/virtual'

attachVirtualEdges(nav, {
  zone: scrollerEl,
  count: () => total,
  scrollToIndex: (i) => virtualizer.scrollToIndex(i),
})
```

React Aria's `Virtualizer` needs none of this — RAC virtualizes internally
and the collection stays a single spatial stop. Full guide:
[virtualization.md](virtualization.md).

## Button glyphs per device (Xbox vs PS vs keyboard)

```ts
document.addEventListener('spatial:focus', (e) => {
  document.body.dataset.inputSource = e.detail.source   // 'keyboard' | 'gamepad' | …
})
```

```css
body[data-input-source='gamepad'] .hint-keyboard { display: none }
body[data-input-source='keyboard'] .hint-gamepad { display: none }
```

## Second navigation island (e.g. a picture-in-picture player)

```html
<spatial-nav adapters="">   <!-- programmatic island: no own input -->
  <button>Play</button><button>Close</button>
</spatial-nav>
```

```ts
pipNav.focus('button')   // hand focus over explicitly when the PiP opens
```

Give secondary islands `adapters=""` and drive them from the main app, or
let both listen — input only acts on the island that holds focus.

## Testing your own UI's navigation

The engine takes injectable geometry — assert navigation in jsdom without a
browser:

```ts
const engine = new SpatialEngine({
  getRect: (el) => layout[el.id],     // your fixture rects
  visibilityFilter: () => true,
  scrollBehavior: false,
})
engine.focus(document.getElementById('a')!)
engine.navigate('right')
expect(engine.getFocused()?.id).toBe('b')
```

## Scroll feel

- Default: `scrollIntoView({ block: 'nearest', inline: 'nearest' })`,
  smooth unless `prefers-reduced-motion`.
- Hammering the d-pad outruns smooth scrolling (rects are read
  mid-animation). For frame-perfect chains use `scrollBehavior: 'auto'`
  (instant), which is what most console UIs actually do.
- `--spatial-scroll-margin` keeps the ring clear of container edges.
