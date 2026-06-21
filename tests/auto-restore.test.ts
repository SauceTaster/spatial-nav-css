import { afterEach, describe, expect, it } from 'vitest'
import { SpatialEngine } from '../src/core/engine'
import { rectProvider, type LayoutMap } from './helpers'

/**
 * autoRestoreFocus: when the focused element is removed, focus returns to
 * the nearest surviving container (memory → default focus → first
 * focusable) after a short debounce — the Norigin-proven TV rule that the
 * focus ring never just vanishes. Requires start() (MutationObserver).
 */
let engine: SpatialEngine | null = null

function makeStarted(html: string, layout: LayoutMap, autoRestoreFocus = true): SpatialEngine {
  document.body.innerHTML = html
  engine = new SpatialEngine({
    getRect: rectProvider(layout),
    visibilityFilter: () => true,
    scrollBehavior: false,
    autoRestoreFocus,
  })
  engine.start()
  return engine
}

const settle = () => new Promise((r) => setTimeout(r, 180)) // > debounce

afterEach(() => {
  engine?.destroy()
  engine = null
  document.body.innerHTML = ''
})

describe('autoRestoreFocus', () => {
  it('restores into the surviving container after the focused child is removed', async () => {
    const e = makeStarted(
      `<div data-spatial-container="remember">
         <button id="r1"></button><button id="r2"></button>
       </div>`,
      { r1: [0, 0, 80, 80], r2: [100, 0, 80, 80] },
    )
    e.focus(document.getElementById('r2')!)
    document.getElementById('r2')!.remove()
    await settle()
    expect(e.getFocused()?.id).toBe('r1')
    expect(document.activeElement?.id).toBe('r1')
  })

  it('prefers the container’s declared default focus when restoring', async () => {
    const e = makeStarted(
      `<div data-spatial-container>
         <button id="d" data-spatial-autofocus></button>
         <button id="x"></button>
         <button id="gone"></button>
       </div>`,
      { d: [0, 0, 80, 80], x: [100, 0, 80, 80], gone: [200, 0, 80, 80] },
    )
    e.focus(document.getElementById('gone')!)
    document.getElementById('gone')!.remove()
    await settle()
    expect(e.getFocused()?.id).toBe('d')
  })

  it('never fights focus that moved on its own during the debounce', async () => {
    const e = makeStarted(
      `<div data-spatial-container><button id="a"></button><button id="b"></button></div>
       <button id="outside"></button>`,
      { a: [0, 0, 80, 80], b: [100, 0, 80, 80], outside: [300, 0, 80, 80] },
    )
    e.focus(document.getElementById('a')!)
    document.getElementById('a')!.remove()
    e.focus(document.getElementById('outside')!) // app re-focused immediately
    await settle()
    expect(e.getFocused()?.id).toBe('outside')
  })

  it('walks up to an outer surviving container when the whole zone is removed', async () => {
    const e = makeStarted(
      `<div id="outer" data-spatial-container>
         <div id="inner" data-spatial-container>
           <button id="leaf"></button>
         </div>
         <button id="sibling"></button>
       </div>`,
      { leaf: [0, 0, 80, 80], sibling: [0, 100, 80, 80] },
    )
    e.focus(document.getElementById('leaf')!)
    document.getElementById('inner')!.remove() // takes the focused leaf with it
    await settle()
    expect(e.getFocused()?.id).toBe('sibling')
  })

  it('coalesces a burst of removals into one restore', async () => {
    const e = makeStarted(
      `<div data-spatial-container>
         <button id="a"></button><button id="b"></button><button id="c"></button>
       </div>`,
      { a: [0, 0, 80, 80], b: [100, 0, 80, 80], c: [200, 0, 80, 80] },
    )
    e.focus(document.getElementById('a')!)
    const focusEvents: string[] = []
    document.addEventListener('spatial:focus', (ev) => {
      focusEvents.push((ev.target as HTMLElement).id)
    })
    document.getElementById('a')!.remove()
    await new Promise((r) => setTimeout(r, 30)) // inside the debounce window
    document.getElementById('b')!.remove()
    await settle()
    expect(e.getFocused()?.id).toBe('c')
    expect(focusEvents).toEqual(['c']) // exactly one restore
  })

  it('is opt-out: autoRestoreFocus: false leaves focus unset until next input', async () => {
    const e = makeStarted(
      `<div data-spatial-container><button id="a"></button><button id="b"></button></div>`,
      { a: [0, 0, 80, 80], b: [100, 0, 80, 80] },
      false,
    )
    e.focus(document.getElementById('a')!)
    document.getElementById('a')!.remove()
    await settle()
    expect(e.getFocused()).toBeNull()
  })
})
