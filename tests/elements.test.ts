import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
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
  it('rejects using one tag name for both element roles', () => {
    expect(() =>
      defineSpatialElements({ navTag: 'spatial-same', containerTag: 'spatial-same' }),
    ).toThrow(/distinct navTag and containerTag/)
  })

  it('<spatial-nav> owns a navigation instance scoped to itself', async () => {
    document.body.innerHTML = `<spatial-nav adapters="" auto-focus><button id="a"></button></spatial-nav>`
    const el = document.querySelector<SpatialNavElement>('spatial-nav')!
    expect(el.nav).not.toBeNull()
    expect(el.nav!.engine.root).toBe(el)
    const button = document.getElementById('a')!
    Object.defineProperty(button, 'checkVisibility', {
      configurable: true,
      value: () => true,
    })
    await Promise.resolve()
    expect(document.activeElement?.id).toBe('a')
  })

  it('auto-focus retries on DOMContentLoaded when children are parsed after connection', async () => {
    // Streaming parser order: the element connects (and its microtask runs)
    // before any of its children exist.
    Object.defineProperty(document, 'readyState', { configurable: true, value: 'loading' })
    try {
      const el = document.createElement('spatial-nav') as SpatialNavElement
      el.setAttribute('adapters', '')
      el.setAttribute('auto-focus', '')
      document.body.appendChild(el)
      await Promise.resolve() // microtask checkpoint: no focusables yet
      expect(document.activeElement?.id).not.toBe('a')

      const button = document.createElement('button')
      button.id = 'a'
      Object.defineProperty(button, 'checkVisibility', {
        configurable: true,
        value: () => true,
      })
      el.appendChild(button)
      document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true }))
      expect(document.activeElement?.id).toBe('a')
    } finally {
      Reflect.deleteProperty(document, 'readyState')
    }
  })

  it('auto-focus retry is cleaned up when disconnected before DOMContentLoaded', async () => {
    Object.defineProperty(document, 'readyState', { configurable: true, value: 'loading' })
    const removeListener = vi.spyOn(document, 'removeEventListener')
    try {
      const el = document.createElement('spatial-nav') as SpatialNavElement
      el.setAttribute('adapters', '')
      el.setAttribute('auto-focus', '')
      document.body.appendChild(el)
      await Promise.resolve() // microtask registers the DOMContentLoaded retry
      el.remove()
      expect(removeListener).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function))

      const outside = document.createElement('button')
      outside.id = 'outside'
      document.body.appendChild(outside)
      outside.focus()
      expect(() =>
        document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true })),
      ).not.toThrow()
      expect(document.activeElement?.id).toBe('outside')
    } finally {
      removeListener.mockRestore()
      Reflect.deleteProperty(document, 'readyState')
    }
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
