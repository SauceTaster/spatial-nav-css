# Framework adapters

The core is framework-agnostic — it reads the DOM your framework renders.
The adapters below add idiomatic sugar: lifecycle management, reactive focus
state, and declarative containers. If your framework is not listed, render the
same native controls and `data-*` configuration, then manage one core instance
at the application's client-side mount boundary.

React and Vue are optional peer dependencies; the Svelte adapter and the web
components import nothing framework-specific.

**Styling focus in a framework.** The engine marks the focused element with
both a `.spatial-focused` class and a `[data-spatial-focused]` attribute.
Select the **attribute** in your own CSS. A framework that renders
`className` / `:class` / `class:` rewrites the whole class attribute on its
next render — including the render that focus state itself triggers — which
drops the engine's class. Nothing renders the data attribute, so it survives.
Deriving your own class from the adapter's `focused` flag is fine and
composes with it:

```tsx
const { ref, focused } = useFocusable<HTMLButtonElement>()
return <button ref={ref} className={focused ? 'card is-focused' : 'card'} />
```

```css
.card[data-spatial-focused] { outline: 2px solid var(--ring); }
```

## React — `spatial-nav-css/react`

```tsx
import { SpatialNavigationProvider, SpatialContainer, useFocusable } from 'spatial-nav-css/react'
import 'spatial-nav-css/css'

function Root() {
  return (
    <SpatialNavigationProvider autofocus>
      <Home />
    </SpatialNavigationProvider>
  )
}

function Home() {
  return (
    <SpatialContainer as="nav" remember>
      <MenuItem label="Store" autofocus />
      <MenuItem label="Library" />
    </SpatialContainer>
  )
}

function MenuItem({ label, autofocus }: { label: string; autofocus?: boolean }) {
  const { ref, focused } = useFocusable<HTMLButtonElement>({ autofocus })
  return (
    <button ref={ref} className={focused ? 'item focused' : 'item'} onClick={() => navigateTo(label)}>
      {label}
    </button>
  )
}
```

- `SpatialNavigationProvider` — accepts every `SpatialNavigationOptions`
  prop and captures options once. It supplies the server facade during SSR;
  the browser render creates the live nav, starts it on client mount, and stops
  it during effect cleanup. Cleanup keeps adapter registrations available for
  React Strict Mode's development replay while separately resetting the
  engine's listeners, observers, focus class, and engine-added `tabindex`
  state.
- `useSpatialNavigation()` — the nav instance from context.
- `useFocusable(options)` → `{ ref, focused }` — marks the element
  `data-focusable`, applies `autofocus` / `navUp..navRight` overrides, and
  tracks focus via native focus/blur (spatial focus is real DOM focus).
  `onFocus` and `onActivate` observe the corresponding custom spatial events,
  not every native focus/click; they always see the latest closure.
  `ref` is a callback ref that also exposes `.current`, so an element behind
  a conditional — or a swapped target — is wired when it actually appears,
  and unwired when it leaves. The hook only removes `data-*` attributes it
  set itself: a `data-nav-*` or `data-spatial-autofocus` written directly in
  your JSX survives, and is restored if you withdraw the matching option.
- `SpatialContainer` — renders `data-spatial-container` from boolean props
  `contain` / `wrap` / `remember`; `as` picks the tag. `contain` affects
  directional navigation only and is not a Tab or modal focus trap.
- `useSpatialEvent(type, handler, target?)` — subscribe to any `spatial:*`
  event for the component's lifetime (e.g. `spatial:nofocustarget` for
  pagination).

For native controls, put the action in the native click handler as above. The
engine's uncanceled activate path calls `.click()`, so pointer, keyboard Space,
and spatial activation then share one action path. If an `onActivate` callback
performs the action itself, it should call `event.preventDefault()` to suppress
the subsequent synthetic click and still provide an equivalent native click
path.

SSR: importing the bindings and rendering `SpatialNavigationProvider` on the
server is safe. During server rendering it supplies a no-op navigation facade
and renders its children without constructing a DOM engine. Navigation, focus,
and activate methods return `false`; `getFocused()` returns `null`; lifecycle
and adapter methods are no-ops; and accessing `.engine` server-side throws a
clear error because no engine exists. A distinct client render/hydration
creates and starts the live instance. Code that needs the real engine must
therefore run after client mount. Lists that reorder need no registration
updates because geometry is read at navigation time.

## React Aria Components — `spatial-nav-css/react-aria`

For the tested keyboard-driven, single-orientation collection pattern,
react-aria-components and spatial navigation divide the work as follows. The
repository includes a headless contract test with injected geometry
([tests/react-aria.test.ts](https://github.com/SauceTaster/spatial-nav-css/blob/main/tests/react-aria.test.ts));
also test the actual RAC version and browser used by the application.

- **Roving-tabindex RAC collections can be single spatial stops.** The engine
  sees the collection's current tabbable item rather than registering every
  item as an independent spatial target; entering one lands on RAC's current
  item, and the engine adopts RAC's internal moves via `focusin`.
- **Division of keyboard-arrow handling in the tested pattern.** RAC owns DOM
  keyboard arrows along its orientation (`preventDefault`, including at the
  edges); the keyboard adapter skips consumed events. Spatial navigation
  drives the orthogonal keyboard axis—a vertical ListBox is exited
  left/right—and everything outside.
- **Semantic direction adapters do not enter RAC's key handling.** Gamepad and
  custom host adapters dispatch direction intents straight to the spatial
  engine. They see the roving collection as its one current stop and do not
  move through RAC items. Controller traversal inside the collection needs an
  application bridge to the collection's supported APIs, or independently
  focusable spatial items instead of the roving-stop pattern.
- **Spatial focus is real focus**, so RAC receives native focus transitions
  when the engine moves. Whether selection follows focus depends on the RAC
  component and its selection options.

```tsx
import {
  Button, Dialog, DialogTrigger, Heading, ListBox, Modal,
} from 'react-aria-components'
import {
  SpatialNavigationProvider, spatialFocusable, spatialZone, useSpatialFocused,
} from 'spatial-nav-css/react-aria'

<SpatialNavigationProvider autofocus>
  <nav {...spatialZone('remember')}>
    <ListBox aria-label="Library">…</ListBox>   {/* one spatial stop, RAC inside */}
  </nav>
  <button {...spatialFocusable({ autofocus: true })} onClick={openTile}>
    Custom tile
  </button>
  <DialogTrigger>
    <Button>Open settings</Button>
    <Modal {...spatialZone('contain')}>         {/* contain directional nav too */}
      <Dialog>
        <Heading slot="title">Settings</Heading>
        <Button slot="close">Done</Button>
      </Dialog>
    </Modal>
  </DialogTrigger>
</SpatialNavigationProvider>
```

- `spatialFocusable(opts)` / `spatialZone(tokens)` — DOM props to spread on
  native elements or RAC components that forward the supplied `data-*`
  attributes to their DOM element.
- `useSpatialFocused()` → `{ ref, focused }` — focus-within state straight
  from DOM events, for styling under **gamepad** input. Do not assume a
  controller-driven programmatic move will set React Aria's
  `data-focus-visible`; style via this hook or the engine's
  `[data-spatial-focused]` attribute when deterministic controller focus
  indication is required, and verify behavior with the RAC version in use.
- The module re-exports the `/react` provider and hooks, so one import
  serves a RAC app.

RAC components configured for grid-like keyboard navigation may consume all
four arrow keys, leaving no orthogonal keyboard axis for the spatial engine.
Verify the exact component/version; single-orientation collections (or native
controls arranged as independent spatial stops) have the clearest division of
responsibility.

## Vue 3 — `spatial-nav-css/vue`

```ts
// main.ts
import { SpatialNavigationPlugin } from 'spatial-nav-css/vue'
import 'spatial-nav-css/css'
app.use(SpatialNavigationPlugin, { autofocus: true })
```

```vue
<script setup lang="ts">
import { useFocusable } from 'spatial-nav-css/vue'
const { elRef, focused } = useFocusable()
</script>

<template>
  <section v-spatial-container="'wrap remember'">
    <button ref="elRef" :class="{ focused }" @click="open">Card</button>
    <button v-focusable>Plain focusable</button>
  </section>
</template>
```

- `SpatialNavigationPlugin` — creates/starts the nav, provides it
  (`useSpatialNavigation()`), registers both directives, destroys the nav on
  `app.unmount()`.
- `useFocusable(options)` → `{ elRef, focused }` with `focused` as a
  reactive `Ref<boolean>`. Its optional callbacks observe custom
  `spatial:focus` / `spatial:activate` events; keep ordinary actions on native
  click handlers unless intentionally intercepting the spatial event. The
  composable watches `elRef`, so an element behind `v-if` is wired when it
  renders and the previous node is cleaned up when the ref moves.
- `v-focusable` — bare marker; `v-spatial-container="'tokens'"` — container
  with reactive token updates.

## Svelte — `spatial-nav-css/svelte`

Actions and the store contract are plain functions, so this works with
Svelte 3/4/5 and imports nothing from the svelte package.

```svelte
<script>
  import { onDestroy, onMount } from 'svelte'
  import { createSpatialNav, focusable, spatialContainer } from 'spatial-nav-css/svelte'
  import 'spatial-nav-css/css'

  const { nav, focused, destroy } = createSpatialNav()
  onMount(() => { nav.focusFirst() })
  onDestroy(destroy)
</script>

<section use:spatialContainer={'wrap remember'}>
  <button use:focusable={{ autofocus: true }} on:click={open}>Card A</button>
  <button use:focusable={{ navRight: 'none' }}>Card B</button>
</section>

<p>Focused: {$focused?.textContent ?? 'nothing'}</p>
```

- `createSpatialNav(options)` → `{ nav, focused, destroy }` where `focused`
  is a readable store of the current spatial target. It starts immediately;
  during component initialization, action-rendered DOM may not exist yet, so
  perform initial `focusFirst()` in `onMount` as above.
- `use:focusable={params}` — marker + overrides + `onFocus`/`onActivate`;
  params update reactively. Those callbacks observe custom spatial events;
  native button actions should normally stay on `on:click`. The action only
  removes `data-*` attributes it set itself, so navigation declared directly
  in your markup survives a param update and the action's teardown.
- `use:spatialContainer={'tokens'}` — container marker.
- `focusedStore(nav)` — the store alone, for navs created elsewhere.

## Web Components — `spatial-nav-css/elements`

Zero-framework, declarative, light-DOM (page CSS applies normally):

```html
<script type="module">
  import { defineSpatialElements } from 'spatial-nav-css/elements'
  defineSpatialElements()
</script>

<spatial-nav auto-focus>
  <spatial-container remember>
    <button>Home</button><button>Library</button>
  </spatial-container>
  <spatial-container wrap remember>
    <button>Card</button><button>Card</button>
  </spatial-container>
</spatial-nav>
```

- `<spatial-nav>` — owns a nav scoped to its subtree. Attributes:
  `adapters="keyboard gamepad"` (default; `adapters=""` for a programmatic
  island), `auto-focus`. The instance is exposed as `element.nav`.
  Destroyed on disconnect.
- `<spatial-container>` — boolean attributes `contain` / `wrap` /
  `remember`, kept in sync reactively.
- `defineSpatialElements({ navTag?, containerTag?, registry? })` — register
  under custom names if the defaults collide. Idempotent.

Multiple `<spatial-nav>` islands can coexist. A region ignores direction while
real focus is inside another root. If no element holds focus, more than one
listening island can attempt to claim first focus; use `adapters=""` on
secondary/programmatic islands when one input stream should own the surface.

## Angular, Solid, others

No dedicated adapter yet. The core works when its lifecycle is tied to the
framework's client mount; this abbreviated Angular example includes cleanup:

```ts
// Angular: a service + a directive
@Injectable({ providedIn: 'root' })
export class SpatialNavService implements OnDestroy {
  readonly nav = createSpatialNavigation()
  constructor() { this.nav.start() }
  ngOnDestroy() { this.nav.destroy() }
}

@Component({ /* root component metadata */ })
export class AppComponent implements AfterViewInit {
  constructor(private spatial: SpatialNavService) {}
  ngAfterViewInit() { this.spatial.nav.focusFirst() }
}

@Directive({ selector: '[focusable]' })
export class FocusableDirective {
  constructor(el: ElementRef<HTMLElement>) { el.nativeElement.setAttribute('data-focusable', '') }
}
```

Solid, Qwik, Lit, HTMX, plain HTML: render `data-focusable` /
`data-spatial-container` attributes and call `createSpatialNavigation()`
once per client application instance, then destroy it at unmount. During SSR,
the factory returns the documented no-op facade when no DOM root exists; the
client must create a separate live instance, and engine-dependent work belongs
after client mount. Direct `new SpatialEngine()` construction remains
browser-only unless an explicit DOM root is supplied. Prefer native controls;
use `data-focusable` only when an intentional custom spatial stop has the
required semantics and keyboard behavior.

## Portaled overlay libraries (Radix, Headless UI, Ark, MUI, …)

These libraries all behave the same way, and it is worth understanding
because none of it involves a native `<dialog>`:

- **They render into a portal at `document.body`.** That is outside a scoped
  `root`, so a scoped engine never sees the overlay at all. Either run the
  engine on the document, or give it a root that contains the portal target.
- **They contain focus by `aria-hidden`-ing the rest of the page**, not with
  `showModal()`. The engine honors that unconditionally — `aria-hidden`,
  `inert`, `hidden`, and an open native modal are enforced even when you pass
  a custom `visibilityFilter` (which replaces only the *rendering* check).
  So modal containment works without extra configuration; a **non-modal**
  popover deliberately does not aria-hide the page, and if you need
  containment there, add `data-spatial-container="contain"` to the panel.
- **Their collections use roving tabindex.** Every menu item, option, and tab
  except the current one carries `tabindex="-1"`, so the engine sees a single
  stop and directional input reports `spatial:nofocustarget`. Add
  `data-focusable` to the items to opt them back in; the library's own focus
  bookkeeping continues to work because spatial focus is real DOM focus.
- **Give the overlay an explicit entry point.** These focus traps focus the
  dialog's own `tabindex="-1"` surface on open, which is not a spatial stop.
  The engine treats that as unclaimed focus and a direction press will claim
  from it, but the first press is then spent getting *into* the dialog. Mark
  the primary action `data-spatial-autofocus`, or call
  `nav.claimFocus('#confirm')` after opening, so focus starts where you want.
- **Some triggers do not act on `click`.** `activate()` synthesizes a click,
  which opens a native `<button>` or a Radix/Headless UI trigger, but **MUI's
  `Select` binds only `mousedown` and `keydown`** — a controller press does
  nothing at all. A Radix `DropdownMenu` trigger is the same
  (`pointerdown`/`keydown`). For those, control the open state yourself from
  `spatial:activate`:

  ```tsx
  const { ref } = useFocusable<HTMLButtonElement>({
    onActivate: (event) => {
      event.preventDefault() // suppress the synthetic click
      setOpen(true)
    },
  })
  ```

- **Watch for stray focus guards.** Some libraries insert zero-size
  `tabindex="0"` sentinels around an open layer. They are legitimate focus
  stops, so `focusFirst()` and auto-restore can land on one. Exclude them:
  `focusableSelector: `${DEFAULT_FOCUSABLE_SELECTOR}:not([data-radix-focus-guard])``.

Runnable, tested integrations for each of these libraries live in
[`examples/`](https://github.com/SauceTaster/spatial-nav-css/tree/main/examples).
