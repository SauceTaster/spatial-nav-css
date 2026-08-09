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
| `spatial-nav-css/dialogs` | `spatialAlert()` / `spatialConfirm()` — asynchronous `<dialog>` helpers for a running navigation instance |
| `spatial-nav-css/debug` | `attachDebugOverlay()` — paints approximate DOM boxes for focusables, containers, and focus |
| `spatial-nav-css/css` | the stylesheet |

## createSpatialNavigation(options?)

Wires an engine to input adapters and returns a `SpatialNavigation`. In a DOM
environment, an omitted `root` uses `document`. During server rendering with no
explicit DOM root, the factory returns a deterministic no-op facade:
`navigate`, `focus`, `focusFirst`, `claimFocus`, `activate`, and `back` return `false`;
`getFocused()` returns `null`; lifecycle and adapter methods do nothing; and
accessing `.engine` throws. A separate client render creates the live engine.
Direct `new SpatialEngine()` construction requires a DOM root.

```ts
interface SpatialNavigationOptions {
  root?: Document | HTMLElement      // subtree to operate on (default document);
                                     // a marked HTMLElement root is also the
                                     // outermost spatial container
  focusableSelector?: string         // replaces the default selector
  scoring?: Partial<ScoringOptions>  // { orthogonalWeight: 5, centerWeight: 0.1,
                                     //   alignedOverlapRatio: 0.2, misalignedPenalty: 1e6 }
  getRect?: (el: HTMLElement) => NavRect   // rect provider (tests, virtual layouts)
  visibilityFilter?: (el: HTMLElement) => boolean
  scrollBehavior?: ScrollBehavior | false  // default 'auto'; explicit smooth becomes
                                           // instant under reduced motion
  focusClass?: string                // default 'spatial-focused'; one non-empty
                                     // DOM class token; custom CSS is required
  autoRestoreFocus?: boolean         // default true: when the focused element is
                                     // removed *or disabled*, restore (debounced
                                     // ~100ms) to the surviving container's memory →
                                     // default focus → first focusable → root entry.
                                     // Needs start().
  adapters?: InputAdapter[]          // default [keyboardAdapter(), gamepadAdapter()]
  autofocus?: boolean                // focus default/first element on start()
  window?: Window                    // window for adapters (iframes, tests)
}

interface SpatialNavigation {
  start(): void                      // begin tracking focus + listening to devices
  stop(): void                       // detach everything; focus state kept
  destroy(): void                    // stop and clear adapters/engine-managed state
  navigate(direction: Direction, repeat?: boolean): boolean
  focus(target: HTMLElement | string): boolean
  focusFirst(): boolean
  claimFocus(target?: HTMLElement | string): boolean  // focus only if unclaimed
  getFocused(): HTMLElement | null   // current spatial target; may persist when
                                     // DOM focus falls back to body
  activate(): boolean                // activate that target; click unless vetoed
  back(): boolean                    // dispatch spatial:back; true if handled
  addAdapter(adapter: InputAdapter): void
  removeAdapter(adapter: InputAdapter): void
  readonly engine: SpatialEngine
}
```

Construction rejects an invalid `focusableSelector` or `focusClass` (which
must be one non-empty DOM class token). Each resolved scoring value must be
finite and non-negative, and `alignedOverlapRatio` must also be at most 1.
`scrollBehavior` accepts only `false`, `'auto'`, `'instant'`, or `'smooth'`;
invalid values throw rather than entering the input path.

Behavioral notes:

- `getFocused()` is the current spatial target, not a strict alias for
  `document.activeElement`. A valid last target persists when DOM focus falls
  to body/nothing so direction or activation can resume there; real focus on a
  different/excluded control makes that region report `null`.
- A `direction` intent with no current spatial target **claims** focus
  (`focusFirst`) only when `engine.canClaimFocus()` is true: DOM focus is idle,
  or it is parked on a non-spatial element inside this engine's root (such as a
  focus trap's `tabindex="-1"` modal wrapper). Focus on an eligible stop or
  outside the root remains claimed, so multiple nav regions don't steal from
  each other.
- Once the engine owns or successfully claims focus, direction input is
  consumed even at an edge so arrows/sticks do not scroll the page underneath
  that UI. React to edges via `spatial:nofocustarget`. An inactive region does
  not consume another region's input.
- `focus(target)` is an explicit programmatic escape: a connected, visible,
  non-disabled element inside the root can be focused even when it does not
  match `focusableSelector`. The engine supplies `tabindex="-1"` when needed;
  callers remain responsible for targeting a semantic, intentional control.
- `claimFocus(target?)` applies that same "only if unclaimed" rule to a
  programmatic move: it focuses `target` (or the default/first focusable) only
  while `engine.canClaimFocus()` is true. It reports `source: 'claim'` on
  `spatial:focus`, and returns `false` without changing anything otherwise.
  Use it for content that arrives asynchronously, or to move off a modal's
  non-spatial focus surface after opening. `autofocus` runs once at `start()`,
  when a data-driven screen may still be skeletons, so the interesting content
  never receives focus. See [recipes.md](recipes.md) for the asynchronous
  pattern.

## SpatialEngine

The low-level engine manages DOM focus, geometry, containers, and events but
does not own an `InputManager` or expose adapter add/remove methods. Its core
operations and engine-only methods are:

```ts
new SpatialEngine(options /* EngineOptions = the non-input subset above */)
engine.findTarget(dir, from)   // resolve a move without performing it
engine.navigate(dir, source?, repeat?)  // move focus
engine.focus(elOrSelector, { direction?, from?, source?, repeat? })
engine.focusFirst(detail?)
engine.canClaimFocus()         // whether first focus may be claimed safely
engine.activate(source?)
engine.activateRelease(durationMs, source?, target?)
engine.activateCancel(source?, target?)
engine.back(source?)           // dispatch spatial:back; true if a listener handled it
engine.getFocused()
engine.start() / stop() / destroy()
```

When calling `activateRelease()` directly, `target` defaults to the current
spatial target. The composed factory passes the element that received the
matching press; a disconnected target or one outside the engine root produces
no release event and returns `false`.

`activateCancel()` has the same direct-target default and validity checks. It
dispatches `spatial:activatecancel` without a duration to say that a matched
press ended without a normal release.

## Events

All `CustomEvent<SpatialEventDetail>`, bubbling and composed. Every detail has
`{ direction, from, source }`, where `source` is an extensible string: an
adapter id (`'keyboard'`, `'gamepad'`, a custom id), `'api'`, or an engine
lifecycle source such as `'autofocus'`, `'claim'`, or `'restore'`.
`spatial:beforefocus`, `spatial:focus`, and `spatial:nofocustarget` also carry
`repeat`. It is `true` when a directional move came from a *held* control rather
than a discrete press — only the input adapter knows that, and accelerated list
scrolling ("hold to speed up, then jump by section") needs it. It is `false` for
discrete moves and defaults to `false` for programmatic moves;
`navigate(direction, repeat?)` lets a facade caller override that default.
Other event types omit it.

| Type | Target | Cancelable | Meaning / default action |
| --- | --- | --- | --- |
| `spatial:beforefocus` | the would-be target | yes — vetoes the move | focus is about to move here |
| `spatial:focus` | the new target | no | focus moved |
| `spatial:nofocustarget` | the origin | no | navigation found nothing (edge) |
| `spatial:activate` | current spatial target | yes — suppresses the click | activate intent; the built-in adapters edge-detect physical presses |
| `spatial:activaterelease` | matching press target in the composed input path; explicit or current spatial target for a direct engine call | no | activate control released; `detail.durationMs` is the hold time — long-press UX lives here |
| `spatial:activatecancel` | matching press target in the composed input path; explicit or current spatial target for a direct engine call | no | matched activation ended without an observable release; clear transient pressed/hold UI |
| `spatial:back` | current spatial target or document | yes — marks handled | back intent |

## Input adapters

```ts
type NavIntent =
  | { type: 'direction'; direction: Direction; repeat: boolean; source: string; originalEvent?: Event }
  | { type: 'activate'; source: string; activationId?: string; originalEvent?: Event }
  | { type: 'release'; durationMs: number; source: string; activationId?: string; originalEvent?: Event }
  | { type: 'activationcancel'; source: string; activationId?: string; originalEvent?: Event }
  | { type: 'back'; source: string; originalEvent?: Event }

interface InputAdapter {
  readonly id: string
  start(context: AdapterContext): void   // context.dispatch(intent) => consumed?
  stop(): void
}

interface AdapterContext {
  readonly window: Window
  dispatch(intent: NavIntent): boolean   // true when the engine consumed it
}
```

### keyboardAdapter(options?)

```ts
keyboardAdapter({
  keymap,        // Record<KeyboardEvent.key, Direction | 'activate' | 'back'> — replaces
                 // the key table; a miss can still fall back to keyCodeMap
  keyCodeMap,    // Record<keyCode, action> — merged over legacy defaults
                 // (8, 13, 27, 37–40, 461, 10009)
  ignoreEditable,// default true: leave mapped keys in editable controls alone
  ignoreModified,// default true: leave Shift/Alt/Ctrl/Meta chords alone
  throttleMs,    // default 0 (off): min ms between direction intents — time-based,
                 // because TV platforms fire held-key repeats without event.repeat;
                 // keyup resets the gate so a fresh press is never delayed
})
```

Action lookup checks `keymap[event.key]` first and then
`keyCodeMap[event.keyCode]`. Because `keyCodeMap` is merged over its legacy
defaults, replacing `keymap` alone does not necessarily disable the default
numeric mapping for the same physical key. The default key table includes
arrows, Enter, Escape, and `BrowserBack`; legacy key codes also cover 8, 13,
27, 37–40, 461, and 10009 outside editable controls.

For an initially consumed activate/back press, the built-in adapters dispatch
at most once per observed physical press. Keyboard press identity is held until
keyup or window blur, so consumed held-key floods are deduplicated even when a
remote fails to set `KeyboardEvent.repeat`; browser defaults on duplicates are
also prevented. An unhandled initial back press is not recorded as owned: true
`event.repeat` keydowns are still skipped, but a platform's malformed
repeat-false flood can dispatch back again. For a consumed activate whose
release remains observable, `spatial:activaterelease` carries the hold
duration. The composed input path pairs it with the original press target even
when application code moves focus during the hold. If that target leaves the
engine root, or input ownership is lost through window blur, gamepad
disconnect, adapter stop, or navigation teardown before button-up is observed,
no release event is emitted.
Use release for hold UX, not essential cleanup. Adapters that allow concurrent
activate holds under one `source` should put the same unique `activationId` on
each press/release pair; the built-in keyboard and gamepad adapters do this.
When a matching release becomes unobservable, dispatch `activationcancel`
with that same identity. For a live stored pairing, the composed path removes
it and dispatches `spatial:activatecancel` on the original press target. The
built-in adapters use it for lifecycle loss; if the target has already left
the root, the pairing is still removed but no target event can be delivered.

### gamepadAdapter(options?)

```ts
gamepadAdapter({
  deadzone,             // default 0.5
  initialRepeatDelayMs, // default 400
  repeatIntervalMs,     // default 130
  buttonMap,            // Record<buttonIndex, 'activate' | 'back'> — merged over { 0: activate, 1: back }
})
```

After an initial probe, polling continues with `requestAnimationFrame` only
while the browser exposes a connected pad. For the Gamepad API's standard
mapping, d-pad buttons 12–15 and axes 0/1 produce directions and face buttons
are edge-detected. Browser/platform permissions and the user-interaction gate
can delay exposure. Devices with `gamepad.mapping !== 'standard'` may need a
custom adapter; `buttonMap` remaps face-button actions but not axes or d-pad
layout. Steam Input works through this adapter only when configured for
gamepad/XInput emulation and exposed by the host browser as a standard mapping.

### InputManager

`new InputManager(handler, window?)` — owns adapters and routes intents.
`add / remove / start / stop / destroy`. Used internally by
`createSpatialNavigation`; public for custom hosts. Its omitted-window default
reads the browser global, so pass an explicit `Window` for iframe/test realms
and do not construct it directly in a DOM-free server render.

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

Asynchronous, styleable alternatives to native blocking dialogs.

```ts
await spatialAlert(message, options?)        // Promise<void>
await spatialConfirm(message, options?)      // Promise<boolean> — true on OK

interface SpatialAlertOptions {
  title?: string          // optional heading
  okLabel?: string        // default 'OK'
  className?: string       // extra class alongside .spatial-dialog
  document?: Document      // explicit document; otherwise mount.ownerDocument,
                           // then the global document
  mount?: HTMLElement      // append target; default document.body
}
interface SpatialConfirmOptions extends SpatialAlertOptions {
  cancelLabel?: string    // default 'Cancel'
  defaultButton?: 'ok' | 'cancel'  // which opens focused; default 'ok'. Use
                                   // 'cancel' for destructive confirmations so a
                                   // held activate press cannot carry into OK.
}
```

Why these exist: while displayed, `window.alert()`/`confirm()` typically pause
the page event loop, including Gamepad API polling; browser chrome is also not
application-styleable and controller dismissal is not portable. These helpers
render a real `<dialog>` via `showModal()`. With a running navigation instance
whose root contains the appended dialog (normally a document-rooted instance),
the engine recognizes the native modal and `B` / `Escape` / remote-back can
resolve as cancel through `spatial:back`. Messages are set with `textContent`,
never HTML. Generated dialogs receive `dialog`/`alertdialog` semantics and an
accessible name; when a title is supplied, the message is also associated as
the description. On dismissal the helper attempts to refocus the previously
focused element when it remains connected, but applications should verify or
provide a fallback when focus restoration is critical. Pass `mount` when a
navigation instance is scoped to an element; the mount must belong to the
selected or inferred document and already be connected.

The dialog entry point is safe to import during SSR, but calling either helper
still requires an explicit/inferred DOM document and throws when none exists.

Where `showModal()` is unavailable, the helper falls back to the `open`
attribute plus `data-spatial-container="contain"`. That fallback contains only
this library's directional search; it is not equivalent to native modal focus,
Tab containment, outside-content inertness, or an accessible modal-dialog
polyfill. Style via the `.spatial-dialog*` classes in
[css/spatial.css](../css/spatial.css), and include dialog behavior in keyboard
and assistive-technology testing for the application's supported browsers.

> The gamepad adapter also guards long event-loop suspension, including a
> blocking native simple dialog: on resuming from a >1s stall, a still-held
> stick/d-pad restarts its
> repeat timer instead of firing an instant phantom repeat.

## Debug overlay (`spatial-nav-css/debug`)

Inspect an approximate DOM overlay: it outlines selected focusables (cyan),
each container's own box (dashed orange, labeled with its tokens), and the
current spatial target (red), repainting on focus/scroll/resize. It does not
draw the engine's unioned zone scoring rects or reproduce an injected engine
`getRect` or custom `visibilityFilter`; pass the configured selector explicitly
and interpret the result as a diagnostic aid. It is intended for development
and is not automatically stripped from production bundles.

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
