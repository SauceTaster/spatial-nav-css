# Virtualized lists

Virtualizers only mount items near the viewport, which breaks naive spatial
navigation in two ways: items past the overscan **don't exist in the DOM**
to be found, and the focused element can be **unmounted** by a scroll. Both
need different integration per stack. The repository has headless contract
tests against the named libraries with injected geometry and scrolling; those
tests do not replace real-browser testing of layout, transforms, mount timing,
or focus behavior.

## TanStack Virtual — `spatial-nav-css/virtual`

(Tests: `tests/virtual-tanstack.test.ts`, against `@tanstack/react-virtual`.
Live demo: `demo/virtual.html` — 10,000 items.)

Within the mounted window, TanStack renders DOM elements and the engine reads
their current geometry each keypress. At the mounted edge the engine fires
`spatial:nofocustarget`, and
`attachVirtualEdges` completes the pattern — *compute next index → scroll →
wait for mount → focus*:

```tsx
import { useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { attachVirtualEdges } from 'spatial-nav-css/virtual'

const virtualizer = useVirtualizer({ count, getScrollElement, estimateSize })

useEffect(() => {
  const zone = scrollerRef.current
  if (!zone) return
  return attachVirtualEdges(nav, {
    zone,                                  // also a data-spatial-container
    count: () => count,
    scrollToIndex: (i) => virtualizer.scrollToIndex(i),
  })
}, [nav, virtualizer, count])

// items carry their index (TanStack's measurement convention already does):
<button key={vi.key} data-index={vi.index} style={virtualItemStyle(vi)}>…</button>
```

The helper is DOM-level and framework-agnostic. It can be adapted to
TanStack's React/Vue/Svelte/Solid integrations, react-window, or hand-rolled
windowing when the host supplies equivalent `scrollToIndex`, item-index, and
mount-settle hooks. The exact snippet above is TanStack-specific; the demo uses
a hand-rolled implementation of the same contract.

Options worth knowing:

- `axis: 'horizontal'` for horizontal virtualizers; `step(index, direction)`
  for grids (return `index ± columns` for vertical moves).
- `findElement` / `getIndex` if you can't use `data-index`.
- `maxAttempts` controls mount-settle retries (default 20) and must be a
  non-negative safe integer.
- A stale advance is cancelled if a newer one starts, and the helper won't
  yank focus if the user moved it elsewhere while waiting.

**Unmount recovery**: immediately after a focused item unmounts, the engine may
report nothing focused; a later direction can claim a mounted item. With the
default `autoRestoreFocus`, the engine may instead run its debounced fallback
first (container memory → default → first mounted focusable). Neither path
preserves virtual item identity automatically. If focus should *follow* the
window or a logical item, restore it by stable index/key from the virtualizer's
range-change callback.

### Preconditions worth knowing before you wire it up

- **`attachVirtualEdges` reacts to `spatial:nofocustarget`, which only fires
  when the search has escalated all the way to the root and found nothing.**
  If your virtualized list sits beside a taller column, pressing down at the
  *mounted* edge finds a candidate in that neighbouring column and the helper
  never hears about it — focus jumps sideways instead of paging. Either make
  the list the last block along its scroll axis, or block the direction at the
  boundary (`--nav-down: none` / `data-nav-down="none"`) so the edge is a real
  edge.
- **Two owners of one `scrollTop`.** The engine scrolls focus into view and the
  virtualizer scrolls to an index. If a `scrollToIndex` target happens to equal
  the current DOM `scrollTop`, no scroll event fires, the row never mounts, and
  the advance quietly gives up. Prefer `scrollBehavior: 'instant'` (or `false`,
  letting the virtualizer own scrolling) when combining the two.

### Accelerated scrolling in a virtualized list

Holding a direction in a long list should cover ground — one item per press is
unusable at 400 items. Two pieces cooperate, and they meet at the mounted edge:

- **Inside the window** the engine finds a target, so `spatial:beforefocus`
  fires and carries `detail.repeat`. An application handler can veto that
  one-step move and focus a further item instead (stride, or jump to the next
  section).
- **At the edge** there is no target, so `spatial:nofocustarget` fires instead
  and `attachVirtualEdges` takes over. Its `step(index, direction, repeat)`
  receives the same flag, so return a bigger jump for held presses:

  ```ts
  step: (index, direction, repeat) =>
    direction === 'down' ? index + (repeat ? COLUMNS * 3 : COLUMNS) : null
  ```

The trap is the seam between them. If your own accelerated jump lands focus on
the *last mounted* item, the next held press produces `nofocustarget` rather
than `beforefocus`, your repeat counter stops advancing, and the hold appears
to stall. Scroll the target to the **middle** of the window when you focus it
(`scrollToIndex(i, { align: 'center' })`), even when the item is already
mounted, so there are mounted rows on both sides and the accelerated path keeps
receiving `beforefocus`.

Also pair acceleration with `scrollBehavior: 'instant'` (or `false`): a smooth
scroll animation has not landed before the next repeat arrives.

### Testing a virtualized list headlessly

TanStack Virtual measures with `offsetWidth`/`offsetHeight` and bails out of
`calculateRange` when the outer size is `0`. jsdom reports `0` for both, so a
straightforward port of the recipe above renders **zero rows** and the test
looks broken rather than failing usefully. `initialRect` does not rescue it —
the resize observer overwrites it on attach.

Supply a floor for the measurement, but **compose with the built-in observer
rather than replacing it** — a bare `cb(...)` measures once and silently
disables resize observation for the life of the list:

```ts
import { observeElementRect } from '@tanstack/react-virtual'

useVirtualizer({
  // …
  // A real fix for SSR and hidden tabs too, not just a test shim.
  observeElementRect: (instance, cb) =>
    observeElementRect(instance, (rect) =>
      cb({ width: rect.width || PANEL_WIDTH, height: rect.height || PANEL_HEIGHT }),
    ),
})
```

Scrolling headlessly needs one more thing, and it is not the obvious one:
`observeElementOffset` reads **`scrollTop`** (inside a `scroll` listener), so
that is the property to define on the scroll element — `scrollTo`,
`scrollHeight` and `clientHeight` alone leave `scrollToIndex` inert. Redefine
`scrollTop` as a real accessor and dispatch a `scroll` event when it changes:

```ts
let top = 0
Object.defineProperty(scroller, 'scrollTop', {
  get: () => top,
  set: (value) => {
    top = value
    scroller.dispatchEvent(new Event('scroll'))
  },
})
Object.defineProperty(scroller, 'clientHeight', { get: () => PANEL_HEIGHT })
Object.defineProperty(scroller, 'scrollHeight', { get: () => rowCount * ROW_HEIGHT })
scroller.scrollTo = (options) => {
  scroller.scrollTop = typeof options === 'number' ? options : (options?.top ?? top)
}
```

The library's own `tests/virtual-tanstack.test.ts` takes a different route —
injecting `scrollToFn` / `observeElementOffset` — which is simpler but does
not exercise the production scroll path. Prefer the shim above when the point
of the test is that scrolling works.

## React Aria / Adobe collections

(Tests: `tests/react-aria-virtualizer.test.ts`, against RAC's `Virtualizer`
+ `ListLayout` with 500 items.)

For the tested vertical RAC `ListBox` pattern, React Aria owns DOM keyboard
arrows along the collection orientation and its virtualizer manages the
mounted boundary. This contract covers keyboards and remotes surfaced as
keyboard events. From the spatial engine's perspective:

- the virtualized collection is still **a single spatial stop**
  (roving tabindex);
- internal keyboard-arrow moves are adopted via `focusin`;
- the orthogonal keyboard axis still exits the collection spatially.

Gamepad and other semantic direction adapters bypass RAC's `KeyboardEvent`
handling and therefore do not traverse the items inside this roving stop. For
controller traversal, bridge those intents to a supported collection API or
render independently focusable spatial items; validate that design with the
actual virtualizer and browser.

```tsx
<Virtualizer layout={ListLayout} layoutOptions={{ rowSize: 40 }}>
  <ListBox aria-label="Library" items={items}>…</ListBox>
</Virtualizer>
```

Don't combine `attachVirtualEdges` with a RAC Virtualizer — two systems
scrolling the same collection fight each other.

## Rules of thumb

| Stack | Inside the window | Past the window |
| --- | --- | --- |
| TanStack Virtual / react-window / custom | engine geometry | `attachVirtualEdges` |
| RAC `Virtualizer` with the tested vertical `ListBox`, keyboard path | react-aria | react-aria |

Treat `GridList`, `Table`, grid layouts, and other collection behaviors as
separate integrations until they are tested with the exact RAC/browser version
in use; they may consume a different set of arrow keys.

`overscan ≥ 1` is a useful starting point because it often leaves a mounted
geometric candidate in the scroll direction, but it is not a guarantee: item
spacing, mount timing, clipping, and list boundaries still matter. Add
`remember` when re-entry should prefer the last focused item if it remains
mounted; otherwise the engine follows its documented fallback chain.
