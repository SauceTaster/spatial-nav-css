import { afterEach, describe, expect, it } from 'vitest'
import { containerChain, findContainer, readNavConfig } from '../src/core/config'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('readNavConfig', () => {
  it('parses explicit data-nav-* overrides', () => {
    document.body.innerHTML = `<button id="a" data-nav-right="#next" data-nav-up="none"></button>`
    const config = readNavConfig(document.getElementById('a')!)
    expect(config.explicit.right).toBe('#next')
    expect(config.explicit.up).toBe('none')
    expect(config.explicit.down).toBeUndefined()
  })

  it('parses container tokens', () => {
    document.body.innerHTML = `<div id="c" data-spatial-container="contain wrap remember"></div>`
    const config = readNavConfig(document.getElementById('c')!)
    expect(config.isContainer).toBe(true)
    expect(config.trap).toBe(true)
    expect(config.wrap).toBe(true)
    expect(config.remember).toBe(true)
  })

  it('treats a bare data-spatial-container as a plain group', () => {
    document.body.innerHTML = `<div id="c" data-spatial-container></div>`
    const config = readNavConfig(document.getElementById('c')!)
    expect(config.isContainer).toBe(true)
    expect(config.trap).toBe(false)
    expect(config.wrap).toBe(false)
  })

  it('reads default-focus from the data attribute', () => {
    document.body.innerHTML = `<button id="a" data-spatial-autofocus></button>`
    expect(readNavConfig(document.getElementById('a')!).defaultFocus).toBe(true)
  })
})

describe('findContainer / containerChain', () => {
  it('finds the nearest container and the full chain', () => {
    document.body.innerHTML = `
      <div id="outer" data-spatial-container>
        <div id="inner" data-spatial-container="remember">
          <button id="leaf"></button>
        </div>
      </div>`
    const leaf = document.getElementById('leaf')!
    expect(findContainer(leaf, document)?.id).toBe('inner')
    expect(containerChain(leaf, document).map((el) => el.id)).toEqual(['inner', 'outer'])
  })

  it('returns null outside any container', () => {
    document.body.innerHTML = `<button id="leaf"></button>`
    expect(findContainer(document.getElementById('leaf')!, document)).toBe(null)
  })
})
