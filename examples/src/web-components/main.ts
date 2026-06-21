/**
 * Web Components example — zero-framework declarative usage. The markup lives
 * in web-components.html; this entry just registers the elements. Each
 * <spatial-nav> owns its own SpatialNavigation scoped to its subtree; children
 * stay in the light DOM so page CSS and the spatial stylesheet apply normally.
 */
import { defineSpatialElements } from 'spatial-nav-css/elements'
import 'spatial-nav-css/css'
import '../shared/examples.css'

defineSpatialElements()

const log = document.getElementById('log')
if (log) {
  document.addEventListener('spatial:focus', (e) => {
    log.textContent = `focus → ${(e.target as HTMLElement).textContent?.trim()} [${(e as CustomEvent).detail.source}]`
  })
  document.addEventListener('spatial:activate', (e) => {
    log.textContent = `activate → ${(e.target as HTMLElement).textContent?.trim()}`
  })
}
