# Virtualized lists

Virtualizers only mount items near the viewport, which breaks naive spatial
navigation in two ways: items past the overscan **don't exist in the DOM**
to be found, and the focused element can be **unmounted** by a scroll. Both
are handled — differently per stack, and each is pinned by tests against the
real libraries.

## TanStack Virtual — `spatial-nav-css/virtual`

(Tests: `tests/virtual-tanstack.test.ts`, against `@tanstack/react-virtual`.
Live demo: `demo/virtual.html` — 10,000 items.)

Within the mounted window, navigation just works: TanStack renders real,
absolutely-positioned elements and the engine reads geometry fresh each
keypress. At the mounted edge the engine fires `spatial:nofocustarget`, and
`attachVirtualEdges` completes the pattern — *compute next index → scroll →
wait for mount → focus*:

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'
import { attachVirtualEdges } from 'spatial-nav-css/virtual'

const virtualizer = useVirtualizer({ count, getScrollElement, estimateSize })

useEffect(() => attachVirtualEdges(nav, {
  zone: scrollerRef.current!,            // also a data-spatial-container
  count: () => count,
  scrollToIndex: (i) => virtualizer.scrollToIndex(i),
}), [])

// items carry their index (TanStack's measurement convention already does):
<div key={vi.key} data-index={vi.index} data-focusable style={...}>…</div>
```

The helper is DOM-level and framework-agnostic — the same call works with
TanStack's React/Vue/Svelte/Solid adapters, react-window, or hand-rolled
windowing (that's what the demo uses).

Options worth knowing:

- `axis: 'horizontal'` for horizontal virtualizers; `step(index, direction)`
  for grids (return `index ± columns` for vertical moves).
- `findElement` / `getIndex` if you can't use `data-index`.
- A stale advance is cancelled if a newer one starts, and the helper won't
  yank focus if the user moved it elsewhere while waiting.

**Unmount recovery**: if the focused item is scrolled out and unmounted,
the engine reports nothing focused and the next input claims a mounted item
(pinned by test — no crash, no dead focus). If you want focus to *follow*
the window, re-focus by index from your virtualizer's range-change callback.

## React Aria / Adobe — nothing to add

(Tests: `tests/react-aria-virtualizer.test.ts`, against RAC's `Virtualizer`
+ `ListLayout` with 500 items.)

RAC collections own arrow keys along their orientation and virtualize
*internally* — focus and selection live on the collection (data), not the
DOM, so crossing the mounted boundary is react-aria's own business and
works out of the box. From the spatial engine's perspective nothing
changes:

- the virtualized collection is still **a single spatial stop**
  (roving tabindex);
- internal arrow moves are adopted via `focusin`;
- the orthogonal axis still exits the collection spatially.

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
| RAC `Virtualizer` (ListBox, GridList, Table) | react-aria | react-aria |

Keep `overscan ≥ 1` so there is always a geometric candidate in the scroll
direction before the edge handler is needed, and remember `remember` on the
zone — re-entering a virtualized rail restores the last focused item if it
is still mounted, falling back gracefully when it isn't.
