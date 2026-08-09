import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Structural guarantees on the shipped stylesheet. These are contracts the
 * engine and docs rely on — losing one in a refactor must fail CI.
 * (vitest runs with cwd at the project root.)
 */
const css = readFileSync('css/spatial.css', 'utf8')

const ENGINE_PROPS = [
  '--spatial-container',
  '--spatial-default-focus',
  '--nav-up',
  '--nav-down',
  '--nav-left',
  '--nav-right',
]

describe('css/spatial.css contracts', () => {
  it.each(ENGINE_PROPS)('registers %s as non-inheriting via @property', (prop) => {
    const block = new RegExp(
      `@property\\s+${prop}\\s*\\{[^}]*inherits:\\s*false[^}]*\\}`.replace(/--/g, '\\-\\-'),
    )
    expect(css).toMatch(block)
  })

  it('styles the engine-applied focus class', () => {
    expect(css).toMatch(/\.spatial-focused[\s\S]*?\{[\s\S]*?outline:/)
  })

  it('also styles the mirrored focus attribute, which frameworks cannot clobber', () => {
    // A framework rendering className rewrites the class attribute; the
    // ring must not depend on the class alone. Every rule that decorates
    // .spatial-focused has an attribute counterpart.
    expect(css).toMatch(/\[data-spatial-focused\][\s\S]*?\{[\s\S]*?outline:/)
    for (const modifier of ['spatial-glow', 'spatial-pop']) {
      expect(css).toContain(`.${modifier}[data-spatial-focused]`)
    }
  })

  it('keeps a :focus-visible fallback for plain keyboard tabbing', () => {
    expect(css).toContain(':focus-visible')
  })

  it('respects prefers-reduced-motion', () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
  })

  it('exposes every documented theming variable with a default', () => {
    for (const v of [
      '--spatial-focus-ring-color',
      '--spatial-focus-ring-glow',
      '--spatial-focus-ring-width',
      '--spatial-focus-ring-offset',
      '--spatial-focus-ring-radius',
      '--spatial-scroll-margin',
    ]) {
      expect(css, `missing default for ${v}`).toMatch(new RegExp(`${v}:\\s*[^;]+;`))
    }
  })

  it('gives opt-in focusables scroll margin without imposing pointer or selection behavior', () => {
    expect(css).toMatch(/scroll-margin:/)
    expect(css).not.toContain('cursor: pointer')
    expect(css).not.toContain('user-select: none')
  })

  it('parses without unbalanced braces', () => {
    const opens = (css.match(/\{/g) ?? []).length
    const closes = (css.match(/\}/g) ?? []).length
    expect(opens).toBe(closes)
  })

  it('parses as a stylesheet (no rules silently dropped to zero)', () => {
    const style = document.createElement('style')
    style.textContent = css
    document.head.appendChild(style)
    const sheet = style.sheet as CSSStyleSheet
    expect(sheet.cssRules.length).toBeGreaterThan(5)
    style.remove()
  })
})
