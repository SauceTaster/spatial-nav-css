# Recipes — common use cases

Concrete patterns, shortest-thing-that-works first. The HTML/data-attribute
patterns can be rendered through the React, Vue, or Svelte adapters as well.

## TV / streaming home screen (rails of cards)

Rows that remember their column, vertical movement between rails:

```html
<main>
  <div class="rail" data-spatial-container="remember">
    <button class="card" type="button">…</button>
    …
  </div>
  <div class="rail" data-spatial-container="remember">…</div>
</main>
```

- `remember` per rail gives the "come back to where you were" feel.
- Don't add `wrap` to rails unless you really want carousel semantics —
  wrap means left from the first card jumps to the last.
- Each rail's zone rect includes its box and mounted cards, which helps
  vertical moves compare rails as bands even when a focused card is scrolled
  far to the right. Exact results still follow the scoring rules and mounted
  geometry.

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

Sibling containers compete as zones. In this common layout, that usually makes
“right from the sidebar” select the content zone; once a move selects the
header zone, its declared default controls entry. Use explicit overrides when
a product requires an invariant route regardless of geometry.

## Modal dialog (native modal + directional containment)

For the engine's directional search, native `<dialog>.showModal()` needs no
container marker: in browsers with `:modal` support, the engine recognizes the
top layer and excludes outside content while the modal is open. The dialog
still needs an accessible name, an intentional initial-focus target, and a
clear close action. Browsers normally restore the previously focused invoker
on close when it is still available; verify restoration in the application
lifecycle and restore explicitly when necessary.

```ts
const onSpatialBack = (event: Event) => {               // B / Escape closes
  if (!dialog.open) return
  event.preventDefault()
  dialog.close()
}
dialog.addEventListener('spatial:back', onSpatialBack)
dialog.addEventListener('close', () => {
  dialog.removeEventListener('spatial:back', onSpatialBack)
}, { once: true })
dialog.showModal()
nav.focus('#dialog-confirm')                            // pick the entry point
```

**Custom overlays** (a positioned `<div>`, no top layer) may declare spatial
containment and handle restore themselves:

```html
<div
  class="modal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="custom-modal-title"
  data-spatial-container="contain"
>
  <h2 id="custom-modal-title">Confirm removal</h2>
  <button data-spatial-autofocus>Confirm</button>
  <button>Cancel</button>
</div>
```

```ts
nav.focus('.modal [data-spatial-autofocus]')          // enter on open
// on close: nav.focus(previouslyFocused)
```

`contain` affects directional navigation only. A custom modal must separately
manage Tab focus, outside-content inertness, pointer interaction, accessible
name/description, Escape behavior, and focus restoration. Prefer native
`<dialog>` or a framework's complete accessible modal component.

React Aria's `Modal` owns the modal accessibility behavior; adding
`spatialZone('contain')` only adds directional containment. In environments
without `:modal` selector support, add `data-spatial-container="contain"` to
native dialogs for the engine, while retaining native or framework modal focus
management.

`spatialAlert()` and `spatialConfirm()` mount under `document.body` by default.
For an engine scoped to an element, pass that element as `mount` so the running
instance contains the generated dialog:

```ts
await spatialConfirm('Remove this item?', { mount: appRoot })
```

## Focusing content that loads asynchronously

`autofocus` is a one-shot: it runs inside `start()`, at which point a
data-driven screen is still skeletons. The only focusable things on the page
then are chrome — a header link, a filter — so that is where focus lands, and
nothing moves it when the real content arrives.

Use `claimFocus()` when the data lands. It focuses the target only while
focus is still unclaimed, so it fills the gap without yanking focus away from
someone who already started navigating (or from a second nav region). Idle DOM
focus counts as unclaimed, as does focus parked on a non-spatial wrapper inside
the engine root; an eligible stop or focus outside the root remains claimed:

```ts
const nav = createSpatialNavigation() // note: no autofocus
nav.start()

const games = await loadGames()
renderGrid(games)
nav.claimFocus('.game-card') // no-op if the user already moved
```

In React, run it in an effect keyed to the loading flag:

```tsx
function Library() {
  const nav = useSpatialNavigation()
  const { data, isPending } = useQuery(gamesQuery)

  useEffect(() => {
    if (!isPending) nav.claimFocus('[data-card]')
  }, [isPending, nav])

  return <Grid games={data} />
}
```

`claimFocus` dispatches `spatial:focus` with `source: 'claim'`, so analytics
or a "press a key to start" overlay can tell an engine-placed focus from a
deliberate user move. Prefer it over `focusFirst()` for anything that runs
after first paint; `focusFirst()` is unconditional and will interrupt a user
mid-navigation.

## Pagination / infinite scroll at the edge

`spatial:nofocustarget` fires on the current spatial target when a direction
finds nothing — the hook for loading more:

```ts
import type { SpatialEvent } from 'spatial-nav-css'

let loadingNextPage = false
grid.addEventListener('spatial:nofocustarget', (event) => {
  const e = event as SpatialEvent
  if (e.detail.direction !== 'down' || loadingNextPage) return
  const origin = event.target as HTMLElement
  loadingNextPage = true
  void (async () => {
    try {
      await loadNextPage()              // append more cards
      if (nav.getFocused() === origin) nav.navigate('down')
    } catch (error) {
      showLoadError(error)
    } finally {
      loadingNextPage = false
    }
  })()
})
```

## Settings form (mixed widgets)

Text fields need their arrow keys; the keyboard adapter already ignores
events from editable elements, so focus "sticks" inside an input until the
user Tabs or clicks out. With the default `ignoreEditable: true`, all mapped
keys—including Escape and Enter—are ignored while the event target is
editable. Add application-level Escape handling or a custom adapter when a
field should also trigger `spatial:back`.

That handler needs no navigation instance. Spatial focus *is* real DOM focus,
so calling `.focus()` on wherever the user should end up is enough — the
engine adopts it through its own `focusin` listener. Delegate once on the
form, and touch only Escape so the arrow keys stay native:

```ts
import { isEditable } from 'spatial-nav-css'

form.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  const target = event.target as HTMLElement
  if (!isEditable(target)) return
  event.preventDefault()
  document.querySelector<HTMLElement>('#settings-nav .is-current')?.focus()
})
```

A native **`<select>` is handled for you**: it would otherwise be a dead end,
since a closed select consumes all four arrows plus Enter and Escape. The
keyboard adapter treats it like the range slider — up/down stay native (they
change or open the list) and **left/right navigate out** — so the control is
always escapable. A row containing one should therefore keep a horizontal
neighbour, or set `--nav-left` / `--nav-right` explicitly.

Semantic adapters are different. `gamepadAdapter()` dispatches intents without
inspecting the DOM, so a controller press navigates *away* from a focused
`<select>` and can never change its value. For controller-driven UIs, replace
native selects with a listbox you drive yourself, or bridge the intents.

With the default `ignoreEditable: true`, for keyboard input and remotes exposed
as keyboard events, the built-in adapter leaves a horizontal range slider's
left/right arrows to the browser
and uses up/down as spatial exit directions. On a range carrying
`aria-orientation="vertical"`, it leaves up/down native and uses left/right to
exit. `gamepadAdapter()` and other semantic-intent adapters do not synthesize
native slider key behavior: add application or custom-adapter logic if a
controller should adjust the value instead of navigating.

For a console-style **settings row that contains a slider**, keep focus on the
native range input rather than making the surrounding row a second, custom
slider. A wrapping label supplies the accessible name, and `:focus-within` can
style the full row when the input holds focus:

```html
<label class="row">
  <span>Rumble</span>
  <input type="range" min="0" max="100" value="50">
</label>
```

```css
.row:focus-within { /* whole-row focus treatment */ }
```

Do not give the input `tabindex="-1"` and move focus to a generic row unless the
application implements and tests the complete ARIA slider keyboard contract.

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

## A control that owns an axis (sliders, scrubbers, steppers)

A volume slider, a seek bar, a stepper: left/right should change the *value*,
up/down should leave the control. The obvious implementation — an `onKeyDown`
handler — only works for the keyboard. `gamepadAdapter()` and any other
semantic adapter dispatch intents straight to the engine without synthesizing
key events, so on the device you are actually targeting the control does
nothing.

Block the axis you own, then listen for the edge event the engine dispatches
when a blocked direction is pressed. That fires whatever produced the intent —
keyboard, controller, or `nav.navigate()` — so all three behave identically:

```tsx
const { ref } = useFocusable<HTMLDivElement>({ navLeft: 'none', navRight: 'none' })

useEffect(() => {
  const el = ref.current
  if (!el) return
  const onEdge = (event: Event) => {
    const { direction, repeat } = (event as SpatialEvent).detail
    if (direction !== 'left' && direction !== 'right') return
    // A held control should move faster, the same way a list does.
    setValue((v) => clamp(v + (direction === 'right' ? 1 : -1) * (repeat ? 5 : 1)))
  }
  el.addEventListener('spatial:nofocustarget', onEdge)
  return () => el.removeEventListener('spatial:nofocustarget', onEdge)
}, [])
```

Two things to get right:

- **Own an axis only when nothing lives on it.** Blocking left/right is safe
  for a full-width control; on a control with neighbours beside it you have
  taken away the only way past.
- **Prefer releasing at the ends** where you can: consume the press only while
  the value can still move, and let it fall through to the engine at min/max.
  A panel made entirely of sliders then still has a door out. (With
  `onKeyDown`, "don't consume" means "don't call `preventDefault()`" — the
  keyboard adapter skips events that are already default-prevented.)

**Do not ship a native `<input type="range">` in a controller-driven UI.** It
is broken in both directions at once: the keyboard adapter deliberately leaves
the range's own axis native, so left/right adjust and never navigate — a dead
end — while a semantic adapter never reaches the input at all, so left/right
navigate away and the value can never change. One control, two contradictory
behaviours split by input device. Build the control above instead.

## Charts (ECharts, Recharts, Chart.js …)

A chart is a picture, not a field of controls. Make the **controls** the
spatial stops and let them drive the chart, rather than trying to navigate
inside a rendered plot:

```tsx
<section data-spatial-container="remember">
  <div className="chart-controls">
    <button onClick={() => setRange('24h')}>24h</button>
    <button onClick={() => setRange('7d')}>7d</button>
    <button onClick={() => toggleSeries('cpu')}>CPU</button>
  </div>
  <MetricsChart range={range} series={series} />   {/* not a stop */}
</section>
```

Two things to check in the library you use:

- **Some chart libraries put themselves in the tab order.** Recharts 3 defaults
  `accessibilityLayer` to `true`, which renders the root
  `<svg role="application" tabindex="0">` and binds its own arrow-key cursor —
  so the chart becomes a spatial stop *and* fights the engine for arrow keys.
  Pass `accessibilityLayer={false}` (or exclude the element from
  `focusableSelector`) unless you deliberately want that keyboard interaction,
  in which case give it a container of its own and an explicit way out.
- **A chart that has not measured yet reports a zero-size rect.** The engine
  ignores degenerate rects when sizing a zone, but a *focusable* zero-size
  element is still a stop the user can land on with nothing to see. Keep
  non-interactive chart surfaces out of the focusable set entirely.

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

For the tested React Aria keyboard collection pattern, RAC owns its virtualized
keyboard axis and the collection remains one spatial stop; do not attach this
edge helper to the same collection. Gamepad and other semantic direction
intents bypass RAC's keyboard handling, so controller traversal needs an
application bridge or independently focusable items. Validate the actual
RAC/browser version in use. Full guide: [virtualization.md](virtualization.md).

## Keyboard vs gamepad glyphs

```ts
import type { SpatialEvent } from 'spatial-nav-css'

const rememberDeviceSource = (event: Event) => {
  const source = (event as SpatialEvent).detail.source
  if (source === 'keyboard' || source === 'gamepad') {
    document.body.dataset.inputSource = source
  }
}
const sourceEvents = [
  'spatial:focus',
  'spatial:nofocustarget',
  'spatial:activate',
  'spatial:back',
] as const
for (const type of sourceEvents) {
  document.addEventListener(type, rememberDeviceSource)
}
```

```css
body[data-input-source='gamepad'] .hint-keyboard { display: none }
body[data-input-source='keyboard'] .hint-gamepad { display: none }
```

The built-in gamepad source does not identify Xbox versus PlayStation versus
another controller. Use browser-exposed Gamepad metadata or a host adapter for
family-specific glyphs, and provide a neutral fallback because identifiers and
mapping exposure vary.

## Second navigation island (e.g. a picture-in-picture player)

```html
<spatial-nav adapters="">   <!-- programmatic island: no own input -->
  <button>Play</button><button>Close</button>
</spatial-nav>
```

```js
await customElements.whenDefined('spatial-nav')
const pip = document.querySelector('spatial-nav')
const pipNav = pip?.nav
if (!pipNav) throw new Error('PiP navigation island is not ready')
pipNav.focus('button')   // hand focus over explicitly when the PiP opens
```

Give secondary islands `adapters=""` and hand focus over explicitly when one
input stream should own the surface. With multiple listening islands, a region
normally ignores direction while real focus is in another root; when the page
has no focused element, however, regions may compete to claim first focus.

## Testing your own UI's navigation

The engine takes injectable geometry — assert navigation in jsdom without a
browser:

```ts
import { SpatialEngine } from 'spatial-nav-css'

const engine = new SpatialEngine({
  getRect: (el) => layout[el.id],     // your fixture rects
  visibilityFilter: () => true,
  scrollBehavior: false,
})
engine.focus(document.getElementById('a')!)
engine.navigate('right')
expect(engine.getFocused()?.id).toBe('b')
```

Injected geometry tests pin engine decisions, not browser layout. Add real-
browser tests for transforms, scrolling, native dialogs, and Gamepad/keyboard
event behavior, plus manual assistive-technology checks for custom widgets and
modal flows.

## Scroll feel

- Default: `scrollIntoView({ block: 'nearest', inline: 'nearest' })`, with
  `scrollBehavior: 'auto'`. `auto` follows the scroll container's computed CSS
  `scroll-behavior`, so it is not an instant-scroll guarantee.
- Smooth scrolling from either the option or CSS can be outrun by rapid d-pad
  input because rects are read mid-animation. Use explicit
  `scrollBehavior: 'instant'` for deterministic rapid chains, and validate the
  selected behavior on target hardware. Under reduced motion, an explicit
  `'smooth'` option becomes `'instant'`; adapt CSS smooth scrolling separately.
- `--spatial-scroll-margin` keeps the ring clear of container edges.
