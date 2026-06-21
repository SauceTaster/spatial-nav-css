/**
 * Vanilla "how do I exclude something?" page. Renders every exclusion
 * mechanism from fixture.ts with a live badge computed from the real engine —
 * so what you read is what the engine actually does (including the two
 * CSS-visibility cases the jsdom test can't judge).
 */
import { createSpatialNavigation, getFocusables, isElementVisible } from 'spatial-nav-css'
import 'spatial-nav-css/css'
import '../shared/examples.css'
import './vanilla.css'
import { EXCLUSION_ROWS } from './fixture'

const app = document.getElementById('app')!

const zone = document.createElement('div')
zone.id = 'exclusion-zone'
zone.setAttribute('data-spatial-container', 'wrap')
zone.className = 'excl-list'

for (const row of EXCLUSION_ROWS) {
  const line = document.createElement('div')
  line.className = 'excl-row'

  const meta = document.createElement('div')
  meta.className = 'excl-meta'
  meta.innerHTML = `<strong>${row.label}</strong><span class="tag">${row.mechanism}</span>`

  const slot = document.createElement('div')
  slot.className = 'excl-slot'
  slot.appendChild(row.build(document))

  const badge = document.createElement('span')
  badge.className = 'excl-badge'
  badge.dataset.for = row.id

  line.append(meta, slot, badge)
  zone.appendChild(line)
}
app.appendChild(zone)

const nav = createSpatialNavigation({ autofocus: true })
nav.start()

// Paint each badge from the engine's actual focusable set.
function paintBadges() {
  const stops = new Set(getFocusables(zone, undefined, isElementVisible))
  for (const badge of zone.querySelectorAll<HTMLElement>('.excl-badge')) {
    const el = document.getElementById(badge.dataset.for!)
    const isStop = !!el && stops.has(el)
    badge.textContent = isStop ? '◉ navigable stop' : '— skipped'
    badge.dataset.stop = String(isStop)
  }
}
paintBadges()
