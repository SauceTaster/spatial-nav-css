# JavaScript / TypeScript API reference

Package entry points:

| Import | Contents |
| --- | --- |
| `spatial-nav-css` | core engine, input adapters, events, geometry |
| `spatial-nav-css/react` | React provider, hooks, components |
| `spatial-nav-css/react-aria` | react-aria-components interop: `spatialFocusable()`, `spatialZone()`, `useSpatialFocused()` |
| `spatial-nav-css/vue` | Vue plugin, composables, directives |
| `spatial-nav-css/svelte` | Svelte actions and stores |
| `spatial-nav-css/elements` | `<spatial-nav>` / `<spatial-container>` custom elements |
| `spatial-nav-css/virtual` | `attachVirtualEdges()` — virtualized-list edge bridge ([virtualization.md](virtualization.md)) |
| `spatial-nav-css/dialogs` | `spatialAlert()` / `spatialConfirm()` — gamepad-navigable alert/confirm |
| `spatial-nav-css/debug` | `attachDebugOverlay()` — paints the engine's view (focusables, zones, focus) |
| `spatial-nav-css/css` | the stylesheet |

## createSpatialNavigation(options?)

Wires an engine to input adapters. Returns a `SpatialNavigation`.

```ts
interface SpatialNavigationOptions {
  root?: Document | HTMLElement      // subtree to operate on (default document)
  focusableSelector?: string         // replaces the default selector
  scoring?: Partial<ScoringOptions>  // { orthogonalWeight: 5, centerWeight: 0.1,
                                     //   alignedOverlapRatio: 0.2, misalignedPenalty: 1e6 }
  getRect?: (el: HTMLElement) => NavRect   // rect provider (tests, virtual layouts)
  visibilityFilter?: (el: HTMLElement) => boolean
  scrollBehavior?: ScrollBehavior | false  // default 'smooth' (auto under reduced motion)
  focusClass?: string                // default 'spatial-focused'
  autoRestoreFocus?: boolean         // default true: when the focused element is
                                     // removed, restore (debounced ~100ms) to the
                                     // surviving container's memory → default focus →
                                     // first focusable → root entry. Needs start().
  adapters?: InputAdapter[]          // default [keyboardAdapter(), gamepadAdapter()]
  autofocus?: boolean                // focus default/first element on start()
  window?: Window                    // window for adapters (iframes, tests)
}

interface SpatialNavigation {
  start(): void                      // begin tracking focus + listening to devices
  stop(): void                       // detach everything; focus state kept
  destroy(): void                    // stop + release
  navigate(direction: Direction): boolean
  focus(target: HTMLElement | string): boolean
  focusFirst(): boolean
  getFocused(): HTMLElement | null
  activate(): boolean                // synthesize click on the focused element
  addAdapter(adapter: InputAdapter): void
  removeAdapter(adapter: InputAdapter): void
  readonly engine: SpatialEngine
}
```

Behavioral notes:

- A `direction` intent when nothing is focused **claims** focus
  (`focusFirst`) — but only if no element anywhere on the page holds focus,
  so multiple nav regions don't steal from each other.
- Direction input is consumed even at an edge, so arrows/sticks never scroll
  the page underneath the UI. React to edges via `spatial:nofocustarget`.

## SpatialEngine

The engine alone — no input. Everything `SpatialNavigation` does plus:

```ts
new SpatialEngine(options /* EngineOptions = the non-input subset above */)
engine.findTarget(dir, from)   // resolve a move without performing it
engine.navigate(dir, source?)  // move focus
engine.focus(elOrSelector, { direction?, from?, source? })
engine.focusFirst(detail?)
engine.activate(source?)
engine.back(source?)           // dispatch spatial:back; true if a listener handled it
engine.getFocused()
engine.start() / stop() / destroy()
```

## Events

All `CustomEvent<SpatialEventDetail>`, bubbling and composed.
`detail = { direction, from, source }` where `source` is the adapter id
(`'keyboard'`, `'gamepad'`, …) or `'api'`.

| Type | Target | Cancelable | Meaning / default action |
| --- | --- | --- | --- |
| `spatial:beforefocus` | the would-be target | yes — vetoes the move | focus is about to move here |
| `spatial:focus` | the new target | no | focus moved |
| `spatial:nofocustarget` | the origin | no | navigation found nothing (edge) |
| `spatial:activate` | the focused element | yes — suppresses the click | activate intent (once per physical press) |
| `spatial:activaterelease` | the focused element | no | activate control released; `detail.durationMs` is the hold time — long-press UX lives here |
| `spatial:back` | focused element or document | yes — marks handled | back intent |

## Input adapters

```ts
type NavIntent =
  | { type: 'direction'; direction: Direction; repeat: boolean; source: string; originalEvent?: Event }
  | { type: 'activate'; source: string; originalEvent?: Event }
  | { type: 'back'; source: string; originalEvent?: Event }

interface InputAdapter {
  readonly id: string
  start(context: AdapterContext): void   // context.dispatch(intent) => consumed?
  stop(): void
}
```

### keyboardAdapter(options?)

```ts
keyboardAdapter({
  keymap,        // Record<KeyboardEvent.key, Direction | 'activate' | 'back'> — replaces defaults
  keyCodeMap,    // Record<keyCode, action> — merged over TV-remote defaults (37–40, 13, 27, 461, 10009)
  ignoreEditable,// default true: don't react while typing in inputs/textareas/contenteditable
  throttleMs,    // default 0 (off): min ms between direction intents — time-based,
                 // because TV platforms fire held-key repeats without event.repeat;
                 // keyup resets the gate so a fresh press is never delayed
})
```

Activate/back fire **once per physical press** (repeats are consumed but not
re-dispatched, matching the gamepad's edge detection); the release dispatches
`spatial:activaterelease` with the hold duration.

### gamepadAdapter(options?)

```ts
gamepadAdapter({
  deadzone,             // default 0.5
  initialRepeatDelayMs, // default 400
  repeatIntervalMs,     // default 130
  buttonMap,            // Record<buttonIndex, 'activate' | 'back'> — merged over { 0: activate, 1: back }
})
```

Polls with `requestAnimationFrame` only while a pad is connected. D-pad
(buttons 12–15) and left stick both produce directions; face buttons are
edge-detected. All standard-mapping pads work, including everything routed
through Steam Input.

### InputManager

`new InputManager(handler, window?)` — owns adapters, routes intents.
`add / remove / start / stop / destroy`. Used internally by
`createSpatialNavigation`; public for custom hosts.

## Geometry (pure functions)

Exported for tests, debugging, and building other engines:

```ts
findBestCandidate(origin, candidates, dir, scoring?)  // the core chooser
distanceScore(origin, candidate, dir, scoring?)       // lower = better
classifyDirection(origin, candidate, dir)             // 'beyond' | 'overlapping' | null
projectedOverlap(a, b, axis)                          // 1-D overlap length
unionRects(rects)                                     // bounding union
wrapOrigin(extent, from, dir)                         // virtual origin for wrap
toNavRect(domRect), rectCenter(rect), OPPOSITE, DIRECTIONS
```

## Dialogs (`spatial-nav-css/dialogs`)

Gamepad-navigable replacements for the native blocking dialogs.

```ts
await spatialAlert(message, options?)        // Promise<void>
await spatialConfirm(message, options?)      // Promise<boolean> — true on OK

interface SpatialAlertOptions {
  title?: string          // optional heading
  okLabel?: string        // default 'OK'
  className?: string       // extra class alongside .spatial-dialog
  document?: Document      // default the global document
}
interface SpatialConfirmOptions extends SpatialAlertOptions {
  cancelLabel?: string    // default 'Cancel'
}
```

Why these exist: `window.alert()`/`confirm()` are browser chrome — they
can't be styled, **freeze all page JS including gamepad polling**, and on
most desktop browsers a controller can't dismiss them. These render a real
`<dialog>` via `showModal()`, so the engine's native-modal awareness
contains navigation automatically, every input adapter works, and `B` /
`Escape` / remote-back resolves as cancel (via `spatial:back`). Messages
are set with `textContent`, never HTML. Where `showModal()` is unavailable
(jsdom, very old engines) the dialog falls back to the `open` attribute plus
an explicit `contain` trap. Style via the `.spatial-dialog*` classes in
[css/spatial.css](../css/spatial.css).

> The gamepad adapter also guards the freeze that native `alert()` causes:
> on resuming from a >1s JS stall, a still-held stick/d-pad restarts its
> repeat timer instead of firing an instant phantom repeat.

## Debug overlay (`spatial-nav-css/debug`)

See the page the way the engine does — outlines every focusable (cyan),
every container zone (dashed orange, labeled with its tokens), and the
current focus (red), repainting on focus/scroll/resize. Dev-only by design.

```ts
import { attachDebugOverlay } from 'spatial-nav-css/debug'

const overlay = attachDebugOverlay(nav, {
  focusableSelector,  // pass your engine's custom selector if you set one
  labels: true,       // index / token labels
  assumeVisible: false,
})
overlay.refresh()     // repaint after a programmatic layout change
overlay.detach()      // remove everything
```

## Config readers

```ts
readNavConfig(el)        // parsed ElementNavConfig (CSS custom props + data attrs)
findContainer(el, root)  // nearest container ancestor or null
containerChain(el, root) // innermost → outermost
getFocusables(scope, selector?, visibilityFilter?)
isElementVisible(el)
isEditable(el)
DEFAULT_FOCUSABLE_SELECTOR
```
