import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpatialEngine } from '../src/core/engine'
import { rect, rectProvider } from './helpers'

/**
 * Hardening for a silent-death failure mode the Godot/CEF embedding hit:
 * when a host reports a 0/unknown viewport, focusables sized with raw vw/vh
 * collapse to the same ~0px rect and navigation finds nothing with no error.
 * The engine emits a one-time dev-mode console.warn so it never fails silently.
 */
afterEach(() => {
  document.body.innerHTML = ''
})

describe('collapsed-rect diagnostic', () => {
  it('warns once when no target is found because focusables collapsed to ~0px', () => {
    document.body.innerHTML = `<button id="a"></button><button id="b"></button>
      <button id="c"></button><button id="d"></button>`
    const engine = new SpatialEngine({
      getRect: () => rect(0, 0, 0, 0), // every focusable coincident at zero area
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    engine.focus(document.getElementById('a')!)
    expect(engine.navigate('right')).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[0])).toContain('~0px rect')

    // One-shot: a second dead navigation does not warn again.
    engine.navigate('down')
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('does NOT warn at a legitimate edge where focusables have real size', () => {
    document.body.innerHTML = `<button id="a"></button><button id="b"></button><button id="c"></button>`
    const engine = new SpatialEngine({
      getRect: rectProvider({ a: [0, 0, 80, 80], b: [100, 0, 80, 80], c: [200, 0, 80, 80] }),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    engine.focus(document.getElementById('c')!) // rightmost — a real edge
    expect(engine.navigate('right')).toBe(false)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('does NOT warn for a tiny UI (one real focusable at an edge)', () => {
    document.body.innerHTML = `<button id="a"></button><button id="b"></button>`
    const engine = new SpatialEngine({
      getRect: () => rect(0, 0, 0, 0),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    engine.focus(document.getElementById('a')!)
    engine.navigate('right')
    expect(warn).not.toHaveBeenCalled() // < 3 focusables: a genuine edge, not a collapse
    warn.mockRestore()
  })
})
