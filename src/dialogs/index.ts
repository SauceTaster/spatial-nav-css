/**
 * Gamepad-navigable replacements for window.alert() / window.confirm().
 *
 * The native blocking dialogs are browser chrome: they freeze all page JS
 * (including gamepad polling), cannot be styled, and on most desktop
 * browsers cannot be dismissed with a controller at all. These helpers
 * render a real <dialog> via showModal() instead — the engine's native
 * modal awareness contains navigation automatically, every input adapter
 * works, and the promise resolves on dismissal:
 *
 *   await spatialAlert('Saved!')
 *   if (await spatialConfirm('Delete this save?', { okLabel: 'Delete' })) …
 *
 * Messages are rendered with textContent — never as HTML.
 *
 * Where showModal() is unavailable (jsdom, very old engines) the dialog
 * falls back to the `open` attribute plus an explicit
 * data-spatial-container="contain" trap.
 */

export interface SpatialAlertOptions {
  /** Optional heading above the message. */
  title?: string
  /** Label for the confirm button. Default 'OK'. */
  okLabel?: string
  /** Extra class for theming, alongside `spatial-dialog`. */
  className?: string
  /** Target document. Default the global document. */
  document?: Document
}

export interface SpatialConfirmOptions extends SpatialAlertOptions {
  /** Label for the dismiss button. Default 'Cancel'. */
  cancelLabel?: string
}

interface DialogButton {
  label: string
  value: 'ok' | 'cancel'
  primary?: boolean
}

function openDialog(
  message: string,
  options: SpatialAlertOptions,
  buttons: DialogButton[],
): Promise<string> {
  const doc = options.document ?? document
  const dialog = doc.createElement('dialog')
  dialog.className = options.className ? `spatial-dialog ${options.className}` : 'spatial-dialog'

  if (options.title) {
    const heading = doc.createElement('h2')
    heading.className = 'spatial-dialog-title'
    heading.textContent = options.title
    dialog.appendChild(heading)
  }
  const body = doc.createElement('p')
  body.className = 'spatial-dialog-message'
  body.textContent = message
  dialog.appendChild(body)

  const row = doc.createElement('div')
  row.className = 'spatial-dialog-buttons'
  dialog.appendChild(row)

  const nativeModal = typeof dialog.showModal === 'function' && typeof dialog.close === 'function'

  return new Promise<string>((resolve) => {
    let settled = false
    // Resolution is driven directly by each interaction; the dialog's own
    // close/cancel events are only a catch-all for the browser's built-in
    // Escape dismissal. settle() is idempotent so every path is safe.
    const settle = (value: string): void => {
      if (settled) return
      settled = true
      if (nativeModal && dialog.open) dialog.close()
      dialog.remove()
      resolve(value)
    }

    let primary: HTMLButtonElement | null = null
    for (const spec of buttons) {
      const button = doc.createElement('button')
      button.type = 'button'
      button.textContent = spec.label
      if (spec.primary) {
        button.autofocus = true
        button.classList.add('spatial-dialog-primary')
        primary = button
      }
      button.addEventListener('click', () => settle(spec.value))
      row.appendChild(button)
    }

    // B / Escape / remote-back dismisses as cancel. The keyboard adapter
    // consumes the Escape because this marks it handled.
    dialog.addEventListener('spatial:back', (event) => {
      event.preventDefault()
      settle('cancel')
    })
    // The browser's native Escape on a modal fires cancel/close directly.
    dialog.addEventListener('cancel', () => settle('cancel'))
    dialog.addEventListener('close', () => settle('cancel'))

    doc.body.appendChild(dialog)
    if (nativeModal) {
      dialog.showModal() // focuses the [autofocus] button; the engine adopts it
    } else {
      dialog.setAttribute('data-spatial-container', 'contain')
      dialog.setAttribute('open', '')
      primary?.focus()
    }
  })
}

/** A gamepad-navigable alert(). Resolves when dismissed. */
export async function spatialAlert(message: string, options: SpatialAlertOptions = {}): Promise<void> {
  await openDialog(message, options, [{ label: options.okLabel ?? 'OK', value: 'ok', primary: true }])
}

/** A gamepad-navigable confirm(). Resolves true on OK, false on cancel/back. */
export async function spatialConfirm(
  message: string,
  options: SpatialConfirmOptions = {},
): Promise<boolean> {
  const result = await openDialog(message, options, [
    { label: options.cancelLabel ?? 'Cancel', value: 'cancel' },
    { label: options.okLabel ?? 'OK', value: 'ok', primary: true },
  ])
  return result === 'ok'
}
