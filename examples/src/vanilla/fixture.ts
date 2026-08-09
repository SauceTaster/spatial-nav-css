/**
 * The exclusion cheat-sheet, as data. Every way to keep an element OUT of
 * spatial navigation, each paired with whether the engine should treat it as a
 * stop. The browser page renders these with a live PASS/skip badge; the test
 * asserts the engine agrees for this fixture.
 *
 * Two independent mechanisms are at play:
 *   selector   — the focusable selector excludes tabindex=-1, :disabled, and
 *                non-interactive elements without [data-focusable]
 *   visibility — isElementVisible() drops anything inside [inert], [hidden], or
 *                [aria-hidden=true] (via closest), plus display/visibility CSS
 */
export interface ExclusionRow {
  id: string
  label: string
  mechanism: string
  expectStop: boolean
  /** Relies on CSS visibility (display/visibility), which needs a real layout. */
  cssVisibility?: boolean
  build(doc: Document): HTMLElement
}

function btn(doc: Document, id: string, text: string): HTMLButtonElement {
  const b = doc.createElement('button')
  b.id = id
  b.className = 'item'
  b.textContent = text
  return b
}

export const EXCLUSION_ROWS: ExclusionRow[] = [
  {
    id: 'native-btn',
    label: 'Native <button>',
    mechanism: 'focusable for free',
    expectStop: true,
    build: (doc) => btn(doc, 'native-btn', 'A button'),
  },
  {
    id: 'focusable-div',
    label: 'Plain <div> + data-focusable (spatial-only example)',
    mechanism: 'opt-in hook; not an accessible control by itself',
    expectStop: true,
    build: (doc) => {
      const d = doc.createElement('div')
      d.id = 'focusable-div'
      d.className = 'item'
      d.setAttribute('data-focusable', '')
      d.textContent = 'A card'
      return d
    },
  },
  {
    id: 'tabindex-btn',
    label: 'Native control + tabindex="-1"',
    mechanism: 'opt a native widget out',
    expectStop: false,
    build: (doc) => {
      const b = btn(doc, 'tabindex-btn', 'tabindex=-1')
      b.tabIndex = -1
      return b
    },
  },
  {
    id: 'disabled-btn',
    label: 'Disabled control',
    mechanism: ':disabled',
    expectStop: false,
    build: (doc) => {
      const b = btn(doc, 'disabled-btn', 'disabled')
      b.disabled = true
      return b
    },
  },
  {
    id: 'plain-div',
    label: 'Plain <div>, no hook',
    mechanism: 'never a stop',
    expectStop: false,
    build: (doc) => {
      const d = doc.createElement('div')
      d.id = 'plain-div'
      d.className = 'item'
      d.textContent = 'decorative'
      return d
    },
  },
  {
    id: 'inert-child',
    label: 'Button inside [inert]',
    mechanism: 'inert ancestor (whole subtree)',
    expectStop: false,
    build: (doc) => {
      const wrap = doc.createElement('div')
      wrap.setAttribute('inert', '')
      wrap.appendChild(btn(doc, 'inert-child', 'inside inert'))
      return wrap
    },
  },
  {
    id: 'ariahidden-child',
    label: 'Button inside aria-hidden',
    mechanism: 'aria-hidden ancestor',
    expectStop: false,
    build: (doc) => {
      const wrap = doc.createElement('div')
      wrap.setAttribute('aria-hidden', 'true')
      wrap.appendChild(btn(doc, 'ariahidden-child', 'inside aria-hidden'))
      return wrap
    },
  },
  {
    id: 'hidden-btn',
    label: 'Button with [hidden]',
    mechanism: 'the hidden attribute',
    expectStop: false,
    build: (doc) => {
      const b = btn(doc, 'hidden-btn', 'hidden')
      b.hidden = true
      return b
    },
  },
  {
    id: 'displaynone-btn',
    label: 'Button, display:none',
    mechanism: 'CSS display',
    expectStop: false,
    cssVisibility: true,
    build: (doc) => {
      const b = btn(doc, 'displaynone-btn', 'display:none')
      b.style.display = 'none'
      return b
    },
  },
  {
    id: 'vishidden-btn',
    label: 'Button, visibility:hidden',
    mechanism: 'CSS visibility',
    expectStop: false,
    cssVisibility: true,
    build: (doc) => {
      const b = btn(doc, 'vishidden-btn', 'visibility:hidden')
      b.style.visibility = 'hidden'
      return b
    },
  },
]

/** Build the fixture inside a spatial container. Returns the container. */
export function buildExclusionFixture(doc: Document = document): HTMLElement {
  const zone = doc.createElement('div')
  zone.id = 'exclusion-zone'
  zone.setAttribute('data-spatial-container', 'wrap')
  for (const row of EXCLUSION_ROWS) zone.appendChild(row.build(doc))
  return zone
}
