/**
 * TV search page. All of the spatial structure — the contained wrap grid,
 * the wide keys, the explicit routes, the long-press ⌫ — lives in fixture.ts,
 * shared verbatim with the jsdom regression test. This entry mounts it, adds
 * the "now playing" line, and starts the engine with the real input adapters.
 */
import { createSpatialNavigation } from 'spatial-nav-css'
import 'spatial-nav-css/css'
import '../shared/examples.css'
import './keyboard.css'
import { buildKeyboard } from './fixture'

const app = document.getElementById('app')!
const { elements } = buildKeyboard(app)

const status = document.createElement('p')
status.className = 'status'
status.textContent = 'Pick a title with Enter'
app.appendChild(status)

// Results keep the default activate → synthetic click, so one click listener
// serves remote and pointer alike.
elements.rail.addEventListener('click', (event) => {
  const result = (event.target as HTMLElement).closest('.result')
  if (result) status.textContent = `▶ Now playing — ${result.textContent}`
})

const nav = createSpatialNavigation({ autofocus: true })
nav.start()
