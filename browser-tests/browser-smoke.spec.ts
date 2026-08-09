import { expect, test } from '@playwright/test'

interface ConformanceResult {
  pass: boolean
  results: Array<{ name: string; pass: boolean; actual: string; expected: string }>
}

test('the CSS cascade, focus ring, visibility, and modal behavior work in a browser', async ({
  page,
}) => {
  await page.goto('/demo/css-conformance.html')
  await page.waitForFunction(() => '__cssConformance' in window)
  const report = await page.evaluate(
    () => (window as Window & { __cssConformance?: ConformanceResult }).__cssConformance!,
  )
  const failures = report.results.filter((result) => !result.pass)
  expect(report.pass, JSON.stringify(failures, null, 2)).toBe(true)
})

test('a scoped engine does not steal focus back from another region', async ({ page }) => {
  await page.goto('/demo/')
  const activeId = await page.evaluate(async () => {
    const moduleUrl = '/dist/index.js'
    const { createSpatialNavigation } = await import(moduleUrl)
    document.body.innerHTML = `
      <main id="scope"><button id="inside">Inside</button><button id="fallback">Fallback</button></main>
      <button id="outside">Outside</button>`
    const root = document.querySelector<HTMLElement>('#scope')!
    const nav = createSpatialNavigation({ root, adapters: [], scrollBehavior: false })
    nav.start()
    nav.focus('#inside')
    document.querySelector('#inside')?.remove()
    document.querySelector<HTMLElement>('#outside')?.focus()
    await new Promise((resolve) => setTimeout(resolve, 180))
    const result = (document.activeElement as HTMLElement | null)?.id ?? null
    nav.destroy()
    return result
  })
  expect(activeId).toBe('outside')
})

test('native focus on an excluded control suspends spatial ownership', async ({ page }) => {
  await page.goto('/demo/')
  const state = await page.evaluate(async () => {
    const moduleUrl = '/dist/index.js'
    const { createSpatialNavigation } = await import(moduleUrl)
    document.body.innerHTML = `
      <main id="scope">
        <button id="spatial">Spatial</button>
        <button id="excluded" tabindex="-1">Managed elsewhere</button>
      </main>`
    const nav = createSpatialNavigation({
      root: document.querySelector<HTMLElement>('#scope')!,
      adapters: [],
      scrollBehavior: false,
    })
    nav.start()
    nav.focus('#spatial')
    document.querySelector<HTMLElement>('#excluded')!.focus()
    const result = {
      active: (document.activeElement as HTMLElement).id,
      spatial: nav.getFocused()?.id ?? null,
      staleRing: document.querySelector('#spatial')!.classList.contains('spatial-focused'),
    }
    nav.destroy()
    return result
  })
  expect(state).toEqual({ active: 'excluded', spatial: null, staleRing: false })
})

test('arrow keys inside a shadow-DOM text field remain native', async ({ page }) => {
  await page.goto('/demo/')
  await page.evaluate(async () => {
    const moduleUrl = '/dist/index.js'
    const { createSpatialNavigation, keyboardAdapter } = await import(moduleUrl)
    document.body.innerHTML = '<div id="host"></div><button id="other">Other</button>'
    const host = document.querySelector<HTMLElement>('#host')!
    const shadow = host.attachShadow({ mode: 'open' })
    const input = document.createElement('input')
    input.id = 'editor'
    input.value = 'abc'
    shadow.appendChild(input)
    const nav = createSpatialNavigation({ adapters: [keyboardAdapter()], scrollBehavior: false })
    nav.start()
    ;(window as Window & { __browserSmokeNav?: { destroy(): void } }).__browserSmokeNav = nav
    input.focus()
  })
  await page.keyboard.press('ArrowRight')
  const focused = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('#host')!
    return host.shadowRoot?.activeElement?.id ?? null
  })
  expect(focused).toBe('editor')
  await page.evaluate(() => {
    ;(window as Window & { __browserSmokeNav?: { destroy(): void } }).__browserSmokeNav?.destroy()
  })
})

test('the dialog helper uses the native modal path and restores focus', async ({ page }) => {
  await page.goto('/demo/')
  const state = await page.evaluate(async () => {
    const moduleUrl = '/dist/dialogs/index.js'
    const { spatialConfirm } = await import(moduleUrl)
    document.body.innerHTML = '<button id="prior">Prior</button>'
    const prior = document.querySelector<HTMLButtonElement>('#prior')!
    prior.focus()
    const result = spatialConfirm('Proceed?', { title: 'Native modal smoke' })
    const dialog = document.querySelector<HTMLDialogElement>('dialog')!
    const before = {
      open: dialog.open,
      modal: dialog.matches(':modal'),
      active: document.activeElement?.textContent,
      labelled: Boolean(dialog.getAttribute('aria-labelledby')),
    }
    dialog.querySelector<HTMLButtonElement>('button')!.click()
    return {
      before,
      confirmed: await result,
      dialogRemoved: document.querySelector('dialog') === null,
      restored: document.activeElement === prior,
    }
  })

  expect(state).toEqual({
    before: { open: true, modal: true, active: 'OK', labelled: true },
    confirmed: false,
    dialogRemoved: true,
    restored: true,
  })
})
