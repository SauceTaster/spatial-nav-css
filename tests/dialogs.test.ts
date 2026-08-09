import { afterEach, describe, expect, it, vi } from 'vitest'
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
  it('rejects a detached mount instead of leaving a nonfunctional dialog behind', async () => {
    const mount = document.createElement('div')
    await expect(spatialAlert('Saved', { mount })).rejects.toThrow(/mount must be connected/)
    expect(mount.querySelector('dialog')).toBeNull()

    document.body.innerHTML = `<button id="prior">Prior</button>`
    const prior = document.getElementById('prior')!
    prior.focus()
    const showModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
    const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: vi.fn(() => {
        throw new Error('host rejected modal')
      }),
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: vi.fn(),
    })
    try {
      await expect(spatialAlert('Saved')).rejects.toThrow(/host rejected modal/)
      expect(document.querySelector('dialog')).toBeNull()
      expect(document.activeElement).toBe(prior)
    } finally {
      if (showModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModal)
      else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
      if (close) Object.defineProperty(HTMLDialogElement.prototype, 'close', close)
      else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
    }
  })

  it('renders message + title as text (never HTML) and resolves on OK', async () => {
    const done = spatialAlert('<b>saved</b>', { title: 'Status <i>!</i>' })
    const dialog = document.querySelector('dialog.spatial-dialog')!
    expect(dialog.querySelector('.spatial-dialog-message')!.innerHTML).not.toContain('<b>')
    expect(dialog.querySelector('.spatial-dialog-title')!.textContent).toBe('Status <i>!</i>')
    expect(dialog.querySelector<HTMLButtonElement>('button')!.textContent).toBe('OK')

    const labelledBy = dialog.getAttribute('aria-labelledby')
    const describedBy = dialog.getAttribute('aria-describedby')
    expect(labelledBy).toBeTruthy()
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(labelledBy!)?.textContent).toBe('Status <i>!</i>')
    expect(document.getElementById(describedBy!)?.textContent).toBe('<b>saved</b>')

    // Fallback trap + focus
    expect(dialog.getAttribute('data-spatial-container')).toBe('contain')
    expect(document.activeElement?.textContent).toBe('OK')

    document.querySelector<HTMLButtonElement>('dialog button')!.click()
    await done
    expect(document.querySelector('dialog')).toBeNull() // removed after close
  })
})

describe('spatialConfirm', () => {
  it('focuses OK by default and Cancel when asked', async () => {
    // Destructive confirms should not open with the destructive choice under
    // the cursor — a held activate press would carry straight into it.
    const p1 = spatialConfirm('Sure?')
    await tick()
    expect(document.activeElement?.textContent).toBe('OK')
    document.querySelector<HTMLButtonElement>('dialog button')!.click()
    await expect(p1).resolves.toBe(false)

    const p2 = spatialConfirm('Stop this stream?', {
      okLabel: 'Stop',
      defaultButton: 'cancel',
    })
    await tick()
    expect(document.activeElement?.textContent).toBe('Cancel')
    const stop = [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find(
      (b) => b.textContent === 'Stop',
    )!
    stop.click()
    await expect(p2).resolves.toBe(true)
  })

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
