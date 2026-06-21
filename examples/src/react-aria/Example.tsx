/**
 * React Aria Components interop example.
 *
 * The key idea: a RAC collection (ListBox/Menu/GridList) uses a roving
 * tabindex, so the spatial engine sees exactly ONE focusable per collection —
 * the whole list behaves as a single spatial stop, and entering it lands on
 * RAC's current item. RAC owns ↑/↓ inside the list (it preventDefaults them);
 * the keyboard adapter skips defaultPrevented events, so there's no
 * double-handling. Spatial nav takes the orthogonal axis and everything else.
 *
 *  - spatialZone()       marks a layout region as a container
 *  - spatialFocusable()  marks custom tiles as stops (collections don't need it)
 *  - useSpatialFocused() reports focus-within for styling under gamepad input,
 *                        which RAC's :focus-visible modality can't see
 */
import { ListBox, ListBoxItem } from 'react-aria-components'
import { spatialFocusable, spatialZone, useSpatialFocused } from 'spatial-nav-css/react-aria'

const LIBRARY = [
  { id: 'home', label: 'Home' },
  { id: 'movies', label: 'Movies' },
  { id: 'shows', label: 'TV Shows' },
  { id: 'music', label: 'Music' },
]

export function ReactAriaExample() {
  const { ref, focused } = useSpatialFocused<HTMLDivElement>()
  return (
    <div className="ex-body">
      <section
        ref={ref}
        className="ex-panel"
        style={focused ? { boxShadow: 'inset 0 0 0 2px var(--accent)' } : undefined}
        {...spatialZone('remember')}
      >
        <h2>Library — a RAC ListBox is ONE spatial stop {focused ? '◉' : ''}</h2>
        <p className="hint">
          Inside the list, <kbd>↑</kbd>/<kbd>↓</kbd> are React Aria's roving focus. <kbd>→</kbd>
          leaves the whole list as a single stop via spatial nav — no key double-handling.
        </p>
        <ListBox aria-label="Library" selectionMode="single" defaultSelectedKeys={['home']}>
          {LIBRARY.map((item) => (
            <ListBoxItem key={item.id} id={item.id} className="tile" style={{ height: 'auto', padding: '10px 12px' }}>
              {item.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </section>

      <section className="ex-panel" {...spatialZone('remember')}>
        <h2>Content tiles — spatialFocusable()</h2>
        <p className="hint">
          Custom (non-collection) tiles spread <code>spatialFocusable()</code> to become stops.
          Navigate <kbd>←</kbd> off the first tile to land back on the list's current item. (This
          zone is <code>remember</code> not <code>wrap</code> — so ← can exit to the sidebar.)
        </p>
        <div className="ex-grid">
          {['Continue', 'Trending', 'New', 'For You'].map((label, i) => (
            <button key={label} id={`tile-${i}`} className="tile" {...spatialFocusable()}>
              {label}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
