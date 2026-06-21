import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  type SpatialContainerElement,
  type SpatialNavElement,
  defineSpatialElements,
} from '../src/elements/index'

beforeAll(() => {
  defineSpatialElements()
  // Safe to call twice.
  defineSpatialElements()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('web components', () => {
  it('<spatial-nav> owns a navigation instance scoped to itself', () => {
    document.body.innerHTML = `<spatial-nav adapters=""><button id="a"></button></spatial-nav>`
    const el = document.querySelector<SpatialNavElement>('spatial-nav')!
    expect(el.nav).not.toBeNull()
    expect(el.nav!.engine.root).toBe(el)
  })

  it('<spatial-nav> destroys its navigation on disconnect', () => {
    document.body.innerHTML = `<spatial-nav adapters=""></spatial-nav>`
    const el = document.querySelector<SpatialNavElement>('spatial-nav')!
    expect(el.nav).not.toBeNull()
    el.remove()
    expect(el.nav).toBeNull()
  })

  it('<spatial-container> maps boolean attributes to container tokens', () => {
    document.body.innerHTML = `<spatial-container wrap remember></spatial-container>`
    const el = document.querySelector<SpatialContainerElement>('spatial-container')!
    expect(el.getAttribute('data-spatial-container')).toBe('wrap remember')

    el.setAttribute('contain', '')
    expect(el.getAttribute('data-spatial-container')).toBe('contain wrap remember')
    el.removeAttribute('wrap')
    el.removeAttribute('remember')
    expect(el.getAttribute('data-spatial-container')).toBe('contain')
  })

  it('keyboard input on one island does not steal focus from outside it', () => {
    document.body.innerHTML = `
      <button id="outside"></button>
      <spatial-nav><button id="inside"></button></spatial-nav>`
    document.getElementById('outside')!.focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }))
    expect(document.activeElement?.id).toBe('outside')
  })
})
