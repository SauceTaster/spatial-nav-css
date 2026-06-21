import { afterEach, describe, expect, it } from 'vitest'
import { createSpatialNavigation } from 'spatial-nav-css'
import { defineSpatialElements } from 'spatial-nav-css/elements'
import { rectProvider, type LayoutMap } from '../shared/test-utils'

defineSpatialElements() // safe to call repeatedly

afterEach(() => {
  document.body.innerHTML = ''
})

describe('web components example', () => {
  it('<spatial-container> reflects boolean attrs to data-spatial-container', () => {
    document.body.innerHTML = `
      <spatial-container wrap remember>
        <button id="a">A</button><button id="b">B</button>
      </spatial-container>`
    const container = document.querySelector('spatial-container') as HTMLElement
    expect(container.getAttribute('data-spatial-container')).toBe('wrap remember')
  })

  it('updates the reflected tokens when an attribute changes', () => {
    document.body.innerHTML = `<spatial-container remember><button id="a">A</button></spatial-container>`
    const container = document.querySelector('spatial-container') as HTMLElement
    expect(container.getAttribute('data-spatial-container')).toBe('remember')
    container.setAttribute('contain', '')
    expect(container.getAttribute('data-spatial-container')).toBe('contain remember')
  })

  it('an external engine navigates the light-DOM children', () => {
    document.body.innerHTML = `
      <spatial-container wrap>
        <button id="a">A</button>
        <button id="b">B</button>
        <button id="c">C</button>
      </spatial-container>`
    const layout: LayoutMap = { a: [0, 0, 80, 40], b: [100, 0, 80, 40], c: [200, 0, 80, 40] }
    const nav = createSpatialNavigation({
      adapters: [],
      visibilityFilter: () => true,
      scrollBehavior: false,
      getRect: rectProvider(layout),
    })
    nav.start()
    nav.focus('#a')
    nav.navigate('right')
    expect(nav.getFocused()?.id).toBe('b')
    nav.focus('#c')
    nav.navigate('right') // wrap
    expect(nav.getFocused()?.id).toBe('a')
    nav.destroy()
  })
})
