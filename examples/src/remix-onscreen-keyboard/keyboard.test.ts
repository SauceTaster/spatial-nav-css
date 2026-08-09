import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createSpatialNavigation,
  keyboardAdapter,
  type SpatialNavigation,
  type SpatialNavigationOptions,
} from 'spatial-nav-css'
import { testNavOptions, type LayoutMap } from '../shared/test-utils'
import { CATALOG, KEY_ROWS, LONG_PRESS_MS, buildKeyboard, resultId } from './fixture'

/**
 * Deterministic TV layout on a 60px key pitch: letter rows at y = row·60,
 * keys 56px square at x = col·60. The bottom row mirrors the page CSS —
 * CLEAR spans columns 0–1, SPACE columns 2–7, ⌫ columns 8–9 — and the
 * results rail sits well below the grid.
 */
const UNIT = 60
const KEY = 56
function tvLayout(): LayoutMap {
  const layout: LayoutMap = {}
  KEY_ROWS.forEach((letters, row) => {
    letters.forEach((ch, col) => {
      layout[`key-${ch}`] = [col * UNIT, row * UNIT, KEY, KEY]
    })
  })
  const y = KEY_ROWS.length * UNIT
  layout['key-clear'] = [0, y, UNIT + KEY, KEY]
  layout['key-space'] = [2 * UNIT, y, 5 * UNIT + KEY, KEY]
  layout['key-backspace'] = [8 * UNIT, y, UNIT + KEY, KEY]
  CATALOG.forEach((title, i) => {
    layout[resultId(title)] = [i * 150, y + 120, 140, 84]
  })
  return layout
}

let nav: SpatialNavigation | null = null

function mount(options: SpatialNavigationOptions = {}) {
  const f = buildKeyboard(document.body)
  const n = createSpatialNavigation({ ...testNavOptions(tvLayout()), autofocus: true, ...options })
  nav = n
  n.start()
  return { f, n }
}

const typeWord = (n: SpatialNavigation, word: string) => {
  for (const ch of word) {
    n.focus(ch === ' ' ? '#key-space' : `#key-${ch}`)
    n.activate()
  }
}

afterEach(() => {
  vi.useRealTimers()
  nav?.destroy()
  nav = null
  document.body.innerHTML = ''
})

describe('on-screen TV keyboard', () => {
  it('autofocuses Q and types, filters, backspaces, and clears via spatial:activate', () => {
    const { f, n } = mount()
    expect(n.getFocused()?.id).toBe('key-q')
    expect(f.getResults()).toEqual([...CATALOG])

    typeWord(n, 'dune')
    expect(f.getQuery()).toBe('dune')
    expect(f.getResults()).toEqual(['Dune'])

    n.focus('#key-backspace')
    n.activate()
    expect(f.getQuery()).toBe('dun')
    expect(f.getResults()).toEqual(['Dune'])

    n.focus('#key-clear')
    n.activate()
    expect(f.getQuery()).toBe('')
    expect(f.getResults()).toEqual([...CATALOG])

    // SPACE is just another character key.
    typeWord(n, 'the m')
    expect(f.getQuery()).toBe('the m')
    expect(f.getResults()).toEqual(['The Matrix'])
  })

  it('wraps left/right at the row edges of the grid', () => {
    const { n } = mount()
    n.focus('#key-p')
    n.navigate('right')
    expect(n.getFocused()?.id).toBe('key-q')
    n.navigate('left')
    expect(n.getFocused()?.id).toBe('key-p')
    // Wrap engages only at a true edge: from L, the staggered P is still
    // geometrically to the right, so no wrap happens there.
    n.focus('#key-l')
    n.navigate('right')
    expect(n.getFocused()?.id).toBe('key-p')
  })

  it('reaches the wide SPACE key from every key above its span (pure geometry)', () => {
    const { n } = mount()
    for (const ch of ['c', 'v', 'b', 'n', 'm']) {
      n.focus(`#key-${ch}`)
      n.navigate('down')
      expect(n.getFocused()?.id, `down from ${ch}`).toBe('key-space')
    }
    // Keys outside the span split to the other wide keys by the same rule.
    n.focus('#key-z')
    n.navigate('down')
    expect(n.getFocused()?.id).toBe('key-clear')
  })

  it('routes: bottom row ↓ and top row ↑ enter the rail, result ↑ returns to SPACE', () => {
    const { f, n } = mount()
    n.focus('#key-space')
    n.navigate('down')
    expect(n.getFocused()?.id).toBe(resultId(CATALOG[0]))
    n.navigate('up')
    expect(n.getFocused()?.id).toBe('key-space')

    n.focus('#key-t')
    n.navigate('up')
    expect(n.getFocused()?.id).toBe(resultId(CATALOG[0]))

    // The route targets the first *mounted* result, so it follows the filter…
    typeWord(n, 'moo')
    expect(f.getResults()).toEqual(['Moon'])
    n.focus('#key-space')
    n.navigate('down')
    expect(n.getFocused()?.id).toBe(resultId('Moon'))

    // …and with no matches the move simply fails: an override is
    // authoritative, so geometry is never consulted as a fallback.
    n.focus('#key-clear')
    n.activate()
    typeWord(n, 'zzz')
    expect(f.getResults()).toEqual([])
    n.focus('#key-space')
    expect(n.navigate('down')).toBe(false)
    expect(n.getFocused()?.id).toBe('key-space')
  })

  it('contain: without its routes, focus still cannot leave the grid', () => {
    const { f, n } = mount()
    // Remove the sanctioned exits and push toward the rail below — `contain`
    // keeps the search inside the keyboard (wrap may cycle it to the far
    // row, but it never reaches a result).
    f.elements.space.removeAttribute('data-nav-down')
    n.focus('#key-space')
    n.navigate('down')
    expect(f.elements.grid.contains(n.getFocused()!)).toBe(true)

    const q = document.getElementById('key-q')!
    q.removeAttribute('data-nav-up')
    n.focus(q)
    n.navigate('up')
    expect(f.elements.grid.contains(n.getFocused()!)).toBe(true)
  })

  it('long-press ⌫ clears the whole query (engine release path)', () => {
    const { f, n } = mount()
    typeWord(n, 'alien')
    expect(f.getResults()).toEqual(['Alien', 'Aliens'])

    n.focus('#key-backspace')
    n.activate()
    n.engine.activateRelease(LONG_PRESS_MS - 1)
    expect(f.getQuery()).toBe('alie') // a short press deletes one character

    n.activate()
    expect(f.getQuery()).toBe('ali')
    n.engine.activateRelease(LONG_PRESS_MS)
    expect(f.getQuery()).toBe('') // holding ⌫ clears everything
    expect(f.getResults()).toEqual([...CATALOG])
  })

  it('long-press ⌫ over the real keyboard adapter (keydown, hold, keyup)', () => {
    // Fake performance.now so the adapter's measured hold time is exact.
    vi.useFakeTimers({ toFake: ['performance'] })
    const { f, n } = mount({ adapters: [keyboardAdapter()] })
    typeWord(n, 'dune')
    n.focus('#key-backspace')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    expect(f.getQuery()).toBe('dun') // activate fires on the press
    vi.advanceTimersByTime(LONG_PRESS_MS + 100)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }))
    expect(f.getQuery()).toBe('') // the release carried the hold duration
  })
})
