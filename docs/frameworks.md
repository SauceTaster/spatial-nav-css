# Framework adapters

The core is framework-agnostic — it reads the DOM your framework renders.
The adapters below add idiomatic sugar: lifecycle management, reactive focus
state, and declarative containers. All of them are thin; if your framework
isn't here, the [core API](js-api.md) plus ~20 lines gets you the same
result (that's all these adapters are).

React and Vue are optional peer dependencies; the Svelte adapter and the web
components import nothing framework-specific.

## React — `spatial-nav-css/react`

```tsx
import { SpatialNavigationProvider, SpatialContainer, useFocusable, useSpatialNavigation, useSpatialEvent } from 'spatial-nav-css/react'
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
  const { ref, focused } = useFocusable<HTMLDivElement>({
    autofocus,
    onActivate: () => navigateTo(label),
  })
  return <div ref={ref} className={focused ? 'item focused' : 'item'}>{label}</div>
}
```

- `SpatialNavigationProvider` — accepts every `SpatialNavigationOptions`
  prop; creates the nav on first render (options are captured once), starts
  on mount, destroys on unmount.
- `useSpatialNavigation()` — the nav instance from context.
- `useFocusable(options)` → `{ ref, focused }` — marks the element
  `data-focusable`, applies `autofocus` / `navUp..navRight` overrides, and
  tracks focus via native focus/blur (spatial focus is real DOM focus).
  Callbacks (`onFocus`, `onActivate`) always see the latest closure.
- `SpatialContainer` — renders `data-spatial-container` from boolean props
  `contain` / `wrap` / `remember`; `as` picks the tag.
- `useSpatialEvent(type, handler, target?)` — subscribe to any `spatial:*`
  event for the component's lifetime (e.g. `spatial:nofocustarget` for
  pagination).

SSR: the provider only touches the DOM in effects; rendering on the server
is safe. Lists that reorder/virtualize work automatically — geometry is read
at navigation time, not registration time.

## React Aria Components — `spatial-nav-css/react-aria`

react-aria-components and spatial navigation divide the work cleanly, and
the interop is test-pinned ([tests/react-aria.test.ts](../tests/react-aria.test.ts)):

- **RAC collections are single spatial stops.** ListBox/Menu/GridList use a
  roving tabindex, so the engine sees exactly one focusable per collection —
  entering one lands on RAC's current item, and the engine adopts RAC's
  internal moves via `focusin`.
- **No double-handling.** RAC owns arrow keys along its orientation
  (preventDefault, including at the edges); the keyboard adapter skips
  consumed events. Spatial navigation drives the orthogonal axis — a
  vertical ListBox is exited left/right — and everything outside.
- **Spatial focus is real focus**, so RAC selection/focus state follows
  engine moves automatically.

```tsx
import { ListBox, ListBoxItem, Modal, Dialog } from 'react-aria-components'
import {
  SpatialNavigationProvider, spatialFocusable, spatialZone, useSpatialFocused,
} from 'spatial-nav-css/react-aria'

<SpatialNavigationProvider autofocus>
  <nav {...spatialZone('remember')}>
    <ListBox aria-label="Library">…</ListBox>   {/* one spatial stop, RAC inside */}
  </nav>
  <div {...spatialFocusable({ autofocus: true })}>Custom tile</div>
  <Modal {...spatialZone('contain')}>           {/* trap spatially too */}
    <Dialog>…</Dialog>
  </Modal>
</SpatialNavigationProvider>
```

- `spatialFocusable(opts)` / `spatialZone(tokens)` — DOM props to spread on
  any RAC component (they forward `data-*`).
- `useSpatialFocused()` → `{ ref, focused }` — focus-within state straight
  from DOM events, for styling under **gamepad** input: react-aria's
  `data-focus-visible` modality tracking only sees keyboard/pointer events,
  so controller-driven focus won't set it. Style via this hook or the
  engine's `.spatial-focused` class.
- The module re-exports the `/react` provider and hooks, so one import
  serves a RAC app.

Caveats: a `layout="grid"` ListBox consumes all four arrows — focus leaves
it only via Tab or explicit `nav.focus()`; prefer single-orientation
collections (or plain `data-focusable` markup) for couch-style UIs.

## Vue 3 — `spatial-nav-css/vue`

```ts
// main.ts
import { SpatialNavigationPlugin } from 'spatial-nav-css/vue'
import 'spatial-nav-css/css'
app.use(SpatialNavigationPlugin, { autofocus: true })
```

```vue
<script setup lang="ts">
import { useFocusable, useSpatialNavigation } from 'spatial-nav-css/vue'
const { elRef, focused } = useFocusable({ onActivate: open })
const nav = useSpatialNavigation()
</script>

<template>
  <section v-spatial-container="'wrap remember'">
    <div ref="elRef" :class="{ focused }">Card</div>
    <div v-focusable>Plain focusable</div>
  </section>
</template>
```

- `SpatialNavigationPlugin` — creates/starts the nav, provides it
  (`useSpatialNavigation()`), registers both directives, destroys the nav on
  `app.unmount()`.
- `useFocusable(options)` → `{ elRef, focused }` with `focused` as a
  reactive `Ref<boolean>`.
- `v-focusable` — bare marker; `v-spatial-container="'tokens'"` — container
  with reactive token updates.

## Svelte — `spatial-nav-css/svelte`

Actions and the store contract are plain functions, so this works with
Svelte 3/4/5 and imports nothing from the svelte package.

```svelte
<script>
  import { onDestroy } from 'svelte'
  import { createSpatialNav, focusable, spatialContainer } from 'spatial-nav-css/svelte'
  import 'spatial-nav-css/css'

  const { nav, focused, destroy } = createSpatialNav({ autofocus: true })
  onDestroy(destroy)
</script>

<section use:spatialContainer={'wrap remember'}>
  <div use:focusable={{ autofocus: true, onActivate: open }}>Card A</div>
  <div use:focusable={{ navRight: 'none' }}>Card B</div>
</section>

<p>Focused: {$focused?.textContent ?? 'nothing'}</p>
```

- `createSpatialNav(options)` → `{ nav, focused, destroy }` where `focused`
  is a readable store of the focused element.
- `use:focusable={params}` — marker + overrides + `onFocus`/`onActivate`;
  params update reactively.
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
    <div data-focusable>Card</div><div data-focusable>Card</div>
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

Multiple `<spatial-nav>` islands coexist: input only claims first-focus when
nothing on the page holds focus, so islands don't steal from each other.

## Angular, Solid, others

No dedicated adapter yet — the core works as-is:

```ts
// Angular: a service + a directive
@Injectable({ providedIn: 'root' })
export class SpatialNavService {
  readonly nav = createSpatialNavigation({ autofocus: true })
  constructor() { this.nav.start() }
}

@Directive({ selector: '[focusable]' })
export class FocusableDirective {
  constructor(el: ElementRef<HTMLElement>) { el.nativeElement.setAttribute('data-focusable', '') }
}
```

Solid, Qwik, Lit, HTMX, plain HTML: render `data-focusable` /
`data-spatial-container` attributes and call `createSpatialNavigation()`
once. That's the entire integration surface.
