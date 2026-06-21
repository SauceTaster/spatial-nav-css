import type { NavRect } from '../src/core/types'

export function rect(left: number, top: number, width: number, height: number): NavRect {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

/** A grid of candidate rects, `cols` wide, cell 100×100 on a 110 pitch. */
export function gridCandidates(count: number, cols = 20): Array<{ element: number; rect: NavRect }> {
  const out: Array<{ element: number; rect: NavRect }> = []
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = (i / cols) | 0
    out.push({ element: i, rect: rect(col * 110, row * 110, 100, 100) })
  }
  return out
}

export interface DomFixture {
  /** Focusable card elements in DOM order. */
  cards: HTMLElement[]
  rects: Map<HTMLElement, NavRect>
  getRect: (el: HTMLElement) => NavRect
}

/**
 * A TV-style page in jsdom: a sidebar zone plus `rails` horizontal rail
 * containers of `cardsPerRail` cards each, with synthetic geometry (jsdom
 * has no layout). Mirrors the media-center demo at scale.
 */
export function buildTvPage(rails: number, cardsPerRail: number): DomFixture {
  document.body.innerHTML = ''
  const rects = new Map<HTMLElement, NavRect>()
  const cards: HTMLElement[] = []

  const sidebar = document.createElement('nav')
  sidebar.setAttribute('data-spatial-container', 'remember')
  rects.set(sidebar, rect(0, 0, 200, rails * 240))
  for (let i = 0; i < 6; i++) {
    const item = document.createElement('button')
    item.textContent = `menu-${i}`
    rects.set(item, rect(10, 20 + i * 50, 180, 40))
    sidebar.appendChild(item)
  }
  document.body.appendChild(sidebar)

  const main = document.createElement('main')
  document.body.appendChild(main)
  for (let r = 0; r < rails; r++) {
    const rail = document.createElement('div')
    rail.setAttribute('data-spatial-container', 'remember')
    rects.set(rail, rect(220, r * 240, 1200, 220))
    for (let c = 0; c < cardsPerRail; c++) {
      const card = document.createElement('div')
      card.setAttribute('data-focusable', '')
      card.id = `card-${r}-${c}`
      rects.set(card, rect(230 + c * 160, 10 + r * 240, 150, 200))
      rail.appendChild(card)
      cards.push(card)
    }
    main.appendChild(rail)
  }

  return {
    cards,
    rects,
    getRect: (el) => rects.get(el) ?? rect(0, 0, 0, 0),
  }
}
