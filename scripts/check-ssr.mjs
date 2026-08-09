// Server-import/render smoke test for every public JavaScript entry point.
import { strict as assert } from 'node:assert'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createSSRApp } from 'vue'

const core = await import('../dist/index.js')
const react = await import('../dist/react/index.js')
await import('../dist/react-aria/index.js')
const vue = await import('../dist/vue/index.js')
const svelte = await import('../dist/svelte/index.js')
await import('../dist/elements/index.js')
await import('../dist/virtual/index.js')
await import('../dist/dialogs/index.js')
await import('../dist/debug/index.js')

const nav = core.createSpatialNavigation()
assert.equal(nav.getFocused(), null)
assert.equal(nav.navigate('right'), false)
assert.throws(() => nav.engine, /unavailable during server rendering/)
assert.throws(() => new core.SpatialEngine(), /requires a DOM root/)
assert.throws(() => new core.InputManager(() => false), /requires a browser Window/)

assert.equal(
  renderToString(
    createElement(react.SpatialNavigationProvider, null, createElement('main', null, 'ok')),
  ),
  '<main>ok</main>',
)

const vueApp = createSSRApp({ render: () => null })
vueApp.use(vue.SpatialNavigationPlugin)

const svelteNav = svelte.createSpatialNav()
let focused
const unsubscribe = svelteNav.focused.subscribe((value) => {
  focused = value
})
assert.equal(focused, null)
unsubscribe()
svelteNav.destroy()

// The CDN/IIFE bundle must define window.SpatialNav and stay loadable in a
// DOM-less environment (same server-safety contract as the module entries).
{
  const { readFileSync } = await import('node:fs')
  const { runInContext, createContext } = await import('node:vm')
  const context = createContext({})
  runInContext(readFileSync(new URL('../dist/spatial-nav.global.js', import.meta.url), 'utf8'), context)
  assert.equal(typeof context.SpatialNav, 'object')
  assert.equal(typeof context.SpatialNav.createSpatialNavigation, 'function')
  assert.equal(typeof context.SpatialNav.defineSpatialElements, 'function')
  assert.equal(typeof context.SpatialNav.spatialConfirm, 'function')
  assert.equal(typeof context.SpatialNav.attachDebugOverlay, 'function')
  assert.equal(context.SpatialNav.createSpatialNavigation().getFocused(), null)
}

console.log('SSR import safety checks passed.')
