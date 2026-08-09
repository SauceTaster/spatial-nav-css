/**
 * React Aria Components interop example.
 *
 * The tested vertical ListBox uses a roving tabindex, so the spatial engine
 * sees one collection stop. RAC owns ↑/↓ keyboard events inside it; the
 * keyboard adapter skips defaultPrevented events, and spatial navigation gets
 * the orthogonal keyboard axis. Semantic gamepad intents bypass RAC's keyboard
 * handling, so controller traversal inside a collection needs an app bridge
 * or independently focusable items.
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
