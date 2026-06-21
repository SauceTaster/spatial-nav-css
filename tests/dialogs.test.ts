import { afterEach, describe, expect, it } from 'vitest'
import { spatialAlert, spatialConfirm } from '../src/dialogs/index'
import { SpatialEngine } from '../src/core/engine'
import { rect } from './helpers'

/**
 * jsdom has no showModal(), so these exercise the fallback path (open
 * attribute + explicit contain trap); the showModal path is verified in a
 * real browser via the demo/conformance harness.
 */
const tick = () => new Promise((r) => setTimeout(r, 0))

afterEach(() => {
  document.body.innerHTML = ''
})

describe('spatialAlert', () => {
  it('renders message + title as text (never HTML) and resolves on OK', async () => {
    const done = spatialAlert('<b>saved</b>', { title: 'Status <i>!</i>' })
    const dialog = document.querySelector('dialog.spatial-dialog')!
    expect(dialog.querySelector('.spatial-dialog-message')!.innerHTML).not.toContain('<b>')
    expect(dialog.querySelector('.spatial-dialog-title')!.textContent).toBe('Status <i>!</i>')
    expect(dialog.querySelector<HTMLButtonElement>('button')!.textContent).toBe('OK')

    // Fallback trap + focus
    expect(dialog.getAttribute('data-spatial-container')).toBe('contain')
    expect(document.activeElement?.textContent).toBe('OK')

    document.querySelector<HTMLButtonElement>('dialog button')!.click()
    await done
    expect(document.querySelector('dialog')).toBeNull() // removed after close
  })
})

describe('spatialConfirm', () => {
  it('resolves true on OK, false on cancel', async () => {
    const p1 = spatialConfirm('Sure?')
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('dialog button')]
    expect(buttons.map((b) => b.textContent)).toEqual(['Cancel', 'OK'])
    buttons[1]!.click()
    await expect(p1).resolves.toBe(true)

    const p2 = spatialConfirm('Sure?', { okLabel: 'Delete', cancelLabel: 'Keep' })
    const b2 = [...document.querySelectorAll<HTMLButtonElement>('dialog button')]
    expect(b2.map((b) => b.textContent)).toEqual(['Keep', 'Delete'])
    b2[0]!.click()
    await expect(p2).resolves.toBe(false)
  })

  it('spatial:back (B / Escape / remote) dismisses as cancel', async () => {
    const p = spatialConfirm('Leave without saving?')
    const dialog = document.querySelector('dialog')!
    const backEvent = new CustomEvent('spatial:back', {
      detail: { direction: null, from: null, source: 'gamepad' },
      bubbles: true,
      cancelable: true,
    })
    dialog.dispatchEvent(backEvent)
    expect(backEvent.defaultPrevented).toBe(true) // marked handled for the adapter
    await expect(p).resolves.toBe(false)
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('is spatially navigable between its buttons', async () => {
    const p = spatialConfirm('Pick one')
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('dialog button')]
    const engine = new SpatialEngine({
      getRect: (el) =>
        el === buttons[0]
          ? rect(0, 0, 80, 40)
          : el === buttons[1]
            ? rect(100, 0, 80, 40)
            : rect(0, 0, 0, 0),
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    engine.focus(buttons[1]!) // OK
    expect(engine.navigate('left')).toBe(true)
    expect(engine.getFocused()).toBe(buttons[0]) // Cancel
    expect(engine.navigate('left')).toBe(false) // contained — nothing outside
    engine.activate()
    await expect(p).resolves.toBe(false)
  })

  it('settles exactly once under double dismissal', async () => {
    const p = spatialConfirm('Once?')
    const ok = document.querySelectorAll<HTMLButtonElement>('dialog button')[1]!
    ok.click()
    ok.click() // second click on the (removed) button
    await expect(p).resolves.toBe(true)
    await tick()
    expect(document.querySelector('dialog')).toBeNull()
  })
})
