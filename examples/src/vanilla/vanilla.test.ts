import { afterEach, describe, expect, it } from 'vitest'
import { createSpatialNavigation, getFocusables, isElementVisible } from 'spatial-nav-css'
import { EXCLUSION_ROWS, buildExclusionFixture } from './fixture'
import { rectProvider, type LayoutMap } from '../shared/test-utils'

afterEach(() => {
  document.body.innerHTML = ''
})

// jsdom doesn't lay elements out, so the library's real isElementVisible
// (which calls checkVisibility) can't judge CSS display/visibility — that's why
// the lib's own tests stub the visibility filter. We mirror that here: the
// selector + ancestor rules below are fully deterministic; the two CSS cases
// are asserted in the browser page. This stand-in covers the [inert]/[hidden]/
// [aria-hidden] closest() contract without depending on layout.
const noHiddenAncestor = (el: HTMLElement) => !el.closest('[aria-hidden="true"], [inert], [hidden]')

describe('exclusion gotchas', () => {
  it('treats exactly the expected elements as stops (selector + ancestor rules)', () => {
    const zone = buildExclusionFixture(document)
    document.body.appendChild(zone)
    const stops = new Set(getFocusables(zone, undefined, noHiddenAncestor).map((el) => el.id))

    for (const row of EXCLUSION_ROWS) {
      if (row.cssVisibility) continue // browser-only (needs real layout)
      expect(stops.has(row.id), `${row.label} — ${row.mechanism}`).toBe(row.expectStop)
    }
  })

  it('isElementVisible drops [inert] / [aria-hidden] / [hidden] subtrees', () => {
    const zone = buildExclusionFixture(document)
    document.body.appendChild(zone)
    // These return false via the closest() short-circuit, before checkVisibility,
    // so they're reliable in jsdom.
    expect(isElementVisible(document.getElementById('inert-child')!)).toBe(false)
    expect(isElementVisible(document.getElementById('ariahidden-child')!)).toBe(false)
    expect(isElementVisible(document.getElementById('hidden-btn')!)).toBe(false)
  })

  it('directional navigation only ever lands on real stops', () => {
    const zone = buildExclusionFixture(document)
    document.body.appendChild(zone)

    // Only the two genuine stops get a rect; everything excluded stays at zero.
    const layout: LayoutMap = {
      'native-btn': [0, 0, 100, 40],
      'focusable-div': [120, 0, 100, 40],
    }
    const nav = createSpatialNavigation({
      adapters: [],
      visibilityFilter: () => true,
      scrollBehavior: false,
      getRect: rectProvider(layout),
    })
    nav.start()

    nav.focus('#native-btn')
    nav.navigate('right')
    expect(nav.getFocused()?.id).toBe('focusable-div')

    // wrap returns to the only other laid-out stop. The disabled / tabindex=-1 /
    // plain-div rows are excluded by the selector; the remaining rows simply
    // have no rect here (their visibility-based exclusion is the test above).
    nav.navigate('right')
    expect(nav.getFocused()?.id).toBe('native-btn')

    nav.destroy()
  })
})
