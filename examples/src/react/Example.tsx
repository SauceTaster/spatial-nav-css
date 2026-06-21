/**
 * React adapter example — the idiomatic pattern, plus the focusability gotchas.
 *
 * Surfaces:
 *  - useFocusable() to make a div a spatial stop (returns {ref, focused})
 *  - <SpatialContainer> zones (wrap / remember)
 *  - the EXCLUSION gotcha: a plain <div> with no useFocusable is skipped; a
 *    <button> opted out with tabindex={-1} is skipped even though it's native
 *  - autoRestoreFocus: activating a card removes it, and focus lands on a
 *    surviving neighbor with zero app code
 *
 * The component takes no provider — main.tsx wraps it for the browser, and the
 * test wraps it with deterministic engine options. That split is what lets the
 * same example be the regression fixture.
 */
import { useState } from 'react'
import { SpatialContainer, useFocusable } from 'spatial-nav-css/react'

function Card({ id, label, onRemove }: { id: string; label: string; onRemove: () => void }) {
  const { ref, focused } = useFocusable<HTMLButtonElement>({ onActivate: onRemove })
  return (
    <button
      ref={ref}
      id={id}
      className="tile"
      style={focused ? { outlineOffset: '2px' } : undefined}
      data-focused={focused ? 'true' : 'false'}
    >
      {label}
      <span className="tag">{focused ? '◉ focused — Enter removes' : 'card'}</span>
    </button>
  )
}

export function ReactExample() {
  const [cards, setCards] = useState(() =>
    ['Aurora', 'Basalt', 'Cinder', 'Dune', 'Ember', 'Frost'].map((label, i) => ({
      id: `card-${i}`,
      label,
    })),
  )
  const [removed, setRemoved] = useState<string | null>(null)

  const remove = (id: string, label: string) => {
    setCards((cs) => cs.filter((c) => c.id !== id))
    setRemoved(label)
  }

  return (
    <div className="ex-body">
      <SpatialContainer className="ex-panel" remember>
        <h2>Toolbar — a remember zone</h2>
        <p className="hint">
          Native <code>&lt;button&gt;</code>s are focusable for free. The middle one opts out with{' '}
          <code>tabIndex=&#123;-1&#125;</code>, so spatial nav skips it.
        </p>
        <div className="ex-row">
          <button className="btn" id="tb-play">▶ Play</button>
          <button className="btn" id="tb-skip" tabIndex={-1} title="excluded via tabindex=-1">
            (skipped)
          </button>
          <button className="btn" id="tb-info">ⓘ Info</button>
        </div>
      </SpatialContainer>

      <SpatialContainer className="ex-panel" wrap remember>
        <h2>Cards — wrap + remember</h2>
        <p className="hint">
          Each card is a <code>useFocusable()</code> stop. <kbd>Enter</kbd>/Ⓐ removes it; the engine
          restores focus to a neighbor (<code>autoRestoreFocus</code>). The hatched tile is a plain{' '}
          <code>&lt;div&gt;</code> with no hook — never a stop.
        </p>
        <div className="ex-grid">
          {cards.map((c) => (
            <Card key={c.id} id={c.id} label={c.label} onRemove={() => remove(c.id, c.label)} />
          ))}
          <div className="tile decoration" id="decoration">
            <span className="tag">decorative — not focusable</span>
          </div>
        </div>
        <p className="status" id="status">
          {removed ? `removed “${removed}” — focus auto-restored` : 'activate a card to remove it'}
        </p>
      </SpatialContainer>
    </div>
  )
}
