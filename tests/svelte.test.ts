import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSpatialNav, focusable, focusedStore, spatialContainer } from '../src/svelte/index'
import { rect } from './helpers'

const testOptions = {
  adapters: [],
  visibilityFilter: () => true,
  scrollBehavior: false as const,
  getRect: () => rect(0, 0, 10, 10),
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('svelte adapter', () => {
  it('focusable action sets and updates engine attributes', () => {
    const node = document.createElement('div')
    const action = focusable(node, { autofocus: true, navRight: '#next' })
    expect(node.hasAttribute('data-focusable')).toBe(true)
    expect(node.hasAttribute('data-spatial-autofocus')).toBe(true)
    expect(node.getAttribute('data-nav-right')).toBe('#next')

    action.update?.({ navRight: 'none' })
    expect(node.hasAttribute('data-spatial-autofocus')).toBe(false)
    expect(node.getAttribute('data-nav-right')).toBe('none')
  })

  it('focusable action wires spatial event callbacks and cleans up', () => {
    const node = document.createElement('div')
    document.body.appendChild(node)
    const onActivate = vi.fn()
    const action = focusable(node, { onActivate })
    node.dispatchEvent(new CustomEvent('spatial:activate', { bubbles: true }))
    expect(onActivate).toHaveBeenCalledOnce()
    action.destroy?.()
    node.dispatchEvent(new CustomEvent('spatial:activate', { bubbles: true }))
    expect(onActivate).toHaveBeenCalledOnce()
  })

  it('spatialContainer action sets and updates tokens', () => {
    const node = document.createElement('section')
    const action = spatialContainer(node, 'wrap')
    expect(node.getAttribute('data-spatial-container')).toBe('wrap')
    action.update?.('contain remember')
    expect(node.getAttribute('data-spatial-container')).toBe('contain remember')
  })

  it('createSpatialNav exposes a focused store that emits on focus changes', () => {
    document.body.innerHTML = `<button id="a"></button><button id="b"></button>`
    const { nav, focused, destroy } = createSpatialNav(testOptions)
    const seen: Array<string | null> = []
    const unsubscribe = focused.subscribe((el) => seen.push(el ? el.id : null))
    expect(seen).toEqual([null])

    nav.focus(document.getElementById('a')!)
    expect(seen.at(-1)).toBe('a')
    nav.focus(document.getElementById('b')!)
    expect(seen.at(-1)).toBe('b')

    unsubscribe()
    destroy()
  })

  it('focusedStore stops emitting after unsubscribe', () => {
    document.body.innerHTML = `<button id="a"></button>`
    const { nav, destroy } = createSpatialNav(testOptions)
    const store = focusedStore(nav)
    const run = vi.fn()
    const unsubscribe = store.subscribe(run)
    const calls = run.mock.calls.length
    unsubscribe()
    nav.focus(document.getElementById('a')!)
    expect(run.mock.calls.length).toBe(calls)
    destroy()
  })
})
