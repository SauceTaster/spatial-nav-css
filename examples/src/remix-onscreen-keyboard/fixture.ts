/**
 * The classic TV search screen: a non-focusable query readout, a QWERTY grid
 * that is one spatial container, and a results rail underneath. One fixture
 * renders the whole thing for both the page (main.ts) and the jsdom
 * regression test (keyboard.test.ts).
 *
 * The spatial structure is entirely declarative:
 *  - the grid is data-spatial-container="contain wrap" — ←→ wrap at the row
 *    edges, and focus can only leave through an explicit data-nav-* route
 *  - SPACE spans six key columns, so every key above its span reaches it by
 *    pure geometry — a wide key needs no per-key wiring
 *  - the routes are the grid's only doors: ↑ from the top row and ↓ from the
 *    bottom row jump to the first mounted result, ↑ from any result returns
 *    to SPACE (the readout above the grid is deliberately not focusable)
 *  - a short press on ⌫ deletes one character (spatial:activate); holding it
 *    LONG_PRESS_MS or longer clears the whole query (spatial:activaterelease
 *    carries detail.durationMs)
 */
import type { SpatialEvent } from 'spatial-nav-css'

export const LONG_PRESS_MS = 600

export const KEY_ROWS: readonly (readonly string[])[] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]

export const CATALOG: readonly string[] = [
  'Alien',
  'Aliens',
  'Arrival',
  'Blade Runner',
  'Dune',
  'Inception',
  'Interstellar',
  'Metropolis',
  'Moon',
  'Solaris',
  'Stalker',
  'The Matrix',
]

export const resultId = (title: string): string =>
  `result-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

// Both grid exits route here; the selector resolves against the current DOM,
// so it always means "the first result that survived the filter".
const RESULT_SELECTOR = '#results .result'

export interface KeyboardFixture {
  elements: {
    query: HTMLElement
    grid: HTMLElement
    space: HTMLButtonElement
    backspace: HTMLButtonElement
    clear: HTMLButtonElement
    rail: HTMLElement
  }
  /** The raw query string (the readout renders exactly this). */
  getQuery(): string
  /** Titles currently mounted in the rail, in order. */
  getResults(): string[]
}

export function buildKeyboard(root: HTMLElement): KeyboardFixture {
  const doc = root.ownerDocument

  // A TV search field is a readout, not an editable input: it never takes
  // focus, so the keyboard adapter's ignoreEditable logic never engages and
  // the arrow keys always mean navigation.
  const query = doc.createElement('div')
  query.id = 'search-query'
  query.className = 'search-query'
  query.setAttribute('role', 'status')
  const value = doc.createElement('span')
  value.className = 'search-value'
  const caret = doc.createElement('span')
  caret.className = 'search-caret'
  query.append(value, caret)

  const grid = doc.createElement('div')
  grid.id = 'keyboard'
  grid.className = 'kb-grid'
  grid.setAttribute('role', 'group')
  grid.setAttribute('aria-label', 'On-screen keyboard')
  grid.setAttribute('data-spatial-container', 'contain wrap')

  const makeKey = (id: string, label: string, token: string): HTMLButtonElement => {
    const b = doc.createElement('button')
    b.type = 'button'
    b.id = id
    b.className = 'kb-key'
    b.textContent = label
    b.dataset.key = token
    return b
  }

  KEY_ROWS.forEach((letters, rowIndex) => {
    const row = doc.createElement('div')
    row.className = 'kb-row'
    for (const ch of letters) {
      const key = makeKey(`key-${ch}`, ch, ch)
      if (ch === 'q') key.setAttribute('data-spatial-autofocus', '')
      // ↑ from the top row leaves the contained grid for the results — the
      // readout above is not focusable, so this is the natural door up.
      if (rowIndex === 0) key.setAttribute('data-nav-up', RESULT_SELECTOR)
      row.appendChild(key)
    }
    grid.appendChild(row)
  })

  const bottom = doc.createElement('div')
  bottom.className = 'kb-row'
  const clear = makeKey('key-clear', 'clear', 'clear')
  clear.classList.add('kb-key-wide-2', 'kb-key-action')
  const space = makeKey('key-space', 'space', ' ')
  space.classList.add('kb-key-wide-6', 'kb-key-action')
  const backspace = makeKey('key-backspace', '⌫', 'backspace')
  backspace.classList.add('kb-key-wide-2')
  backspace.title = 'hold to clear'
  // ↓ from the bottom row is the other door: without this route, `contain`
  // would keep the search inside the grid even though the rail sits below.
  for (const key of [clear, space, backspace]) key.setAttribute('data-nav-down', RESULT_SELECTOR)
  bottom.append(clear, space, backspace)
  grid.appendChild(bottom)

  const rail = doc.createElement('div')
  rail.id = 'results'
  rail.className = 'results-rail'
  rail.setAttribute('role', 'group')
  rail.setAttribute('aria-label', 'Search results')

  let text = ''

  const render = () => {
    value.textContent = text
    query.dataset.empty = String(text === '')
    const q = text.toLowerCase()
    const matches = CATALOG.filter((title) => title.toLowerCase().includes(q))
    rail.textContent = ''
    for (const title of matches) {
      const item = doc.createElement('button')
      item.type = 'button'
      item.id = resultId(title)
      item.className = 'result'
      item.textContent = title
      // The deterministic way back in: land on SPACE, the widest stop,
      // wherever the rail was entered from.
      item.setAttribute('data-nav-up', '#key-space')
      rail.appendChild(item)
    }
    if (matches.length === 0) {
      const empty = doc.createElement('p')
      empty.className = 'results-empty'
      empty.textContent = 'No titles match'
      rail.appendChild(empty)
    }
  }

  const setQuery = (next: string) => {
    if (next === text) return
    text = next
    render()
  }

  const applyKey = (token: string) => {
    if (token === 'backspace') setQuery(text.slice(0, -1))
    else if (token === 'clear') setQuery('')
    else setQuery(text + token)
  }

  grid.addEventListener('spatial:activate', (event) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>('[data-key]')
    if (!key) return
    // Handled here — cancelling suppresses the engine's synthetic click, so
    // the click listener below stays a pointer-only path (no double typing).
    event.preventDefault()
    applyKey(key.dataset.key!)
  })
  grid.addEventListener('click', (event) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>('[data-key]')
    if (key) applyKey(key.dataset.key!)
  })

  backspace.addEventListener('spatial:activaterelease', (event) => {
    const { durationMs } = (event as SpatialEvent).detail
    // Release reports how long the activate control was held: a short press
    // already deleted one character on the way down, a long hold clears all.
    if (durationMs !== undefined && durationMs >= LONG_PRESS_MS) setQuery('')
  })

  render()
  root.append(query, grid, rail)

  return {
    elements: { query, grid, space, backspace, clear, rail },
    getQuery: () => text,
    getResults: () => Array.from(rail.querySelectorAll('.result'), (el) => el.textContent ?? ''),
  }
}
