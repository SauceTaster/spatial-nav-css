/**
 * Gamepad-navigable replacements for window.alert() / window.confirm().
 *
 * The native blocking dialogs are browser chrome: they freeze all page JS
 * (including gamepad polling), cannot be styled, and do not provide a portable
 * application-controlled controller dismissal path. These helpers render an
 * HTML <dialog> via showModal() instead, so a running engine whose root
 * contains the mount can keep processing its configured adapters and the
 * promise resolves on dismissal:
 *
 *   await spatialAlert('Saved!')
 *   if (await spatialConfirm('Delete this save?', { okLabel: 'Delete' })) …
 *
 * Messages are rendered with textContent — never as HTML.
 *
 * Where showModal() is unavailable (jsdom, very old engines) the dialog
 * falls back to the `open` attribute plus explicit spatial containment. That
 * fallback is not a full modal Tab/pointer/assistive-technology trap.
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
  /** Element to append the dialog to. Defaults to document.body. */
  mount?: HTMLElement
}

export interface SpatialConfirmOptions extends SpatialAlertOptions {
  /** Label for the dismiss button. Default 'Cancel'. */
  cancelLabel?: string
  /**
   * Which button opens focused. Default 'ok'. Use 'cancel' for destructive
   * confirmations, so a held or double-tapped activate button cannot destroy
   * something by carrying its press into the dialog.
   */
  defaultButton?: 'ok' | 'cancel'
}

interface DialogButton {
  label: string
  value: 'ok' | 'cancel'
  primary?: boolean
}

let nextDialogId = 0

function openDialog(
  message: string,
  options: SpatialAlertOptions,
  buttons: DialogButton[],
): Promise<string> {
  const doc =
    options.document ??
    options.mount?.ownerDocument ??
    (typeof document !== 'undefined' ? document : null)
  if (!doc) throw new Error('spatial dialogs require a DOM document')
  const mount = options.mount ?? doc.body
  if (!mount) {
    throw new Error('spatial dialogs require document.body or an explicit mount')
  }
  if (mount.ownerDocument !== doc) {
    throw new Error('spatial dialog mount must belong to the target document')
  }
  if (!mount.isConnected) {
    throw new Error('spatial dialog mount must be connected to the target document')
  }
  const priorFocus = doc.activeElement
  const dialog = doc.createElement('dialog')
  dialog.className = options.className ? `spatial-dialog ${options.className}` : 'spatial-dialog'
  dialog.setAttribute('role', buttons.length === 1 ? 'alertdialog' : 'dialog')
  const id = `spatial-dialog-${++nextDialogId}`

  if (options.title) {
    const heading = doc.createElement('h2')
    heading.id = `${id}-title`
    heading.className = 'spatial-dialog-title'
    heading.textContent = options.title
    dialog.appendChild(heading)
    dialog.setAttribute('aria-labelledby', heading.id)
  }
  const body = doc.createElement('p')
  body.id = `${id}-message`
  body.className = 'spatial-dialog-message'
  body.textContent = message
  dialog.appendChild(body)
  if (options.title) dialog.setAttribute('aria-describedby', body.id)
  else dialog.setAttribute('aria-labelledby', body.id)

  const row = doc.createElement('div')
  row.className = 'spatial-dialog-buttons'
  dialog.appendChild(row)

  const nativeModal = typeof dialog.showModal === 'function' && typeof dialog.close === 'function'

  return new Promise<string>((resolve, reject) => {
    let settled = false
    const restorePriorFocus = (): void => {
      if (
        priorFocus &&
        'focus' in priorFocus &&
        typeof priorFocus.focus === 'function' &&
        priorFocus.isConnected
      ) {
        try {
          ;(priorFocus as HTMLElement).focus({ preventScroll: true })
        } catch {
          // Dismissal still settles if a host/custom focus method rejects
          // restoration; the prior element may no longer be focusable.
        }
      }
    }
    // Resolution is driven directly by each interaction; the dialog's own
    // close/cancel events are only a catch-all for the browser's built-in
    // Escape dismissal. settle() is idempotent so every path is safe.
    const settle = (value: string): void => {
      if (settled) return
      settled = true
      if (nativeModal && dialog.open) {
        try {
          dialog.close()
        } catch {
          // Removal below is the final cleanup path.
        }
      }
      dialog.remove()
      restorePriorFocus()
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
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      settle('cancel')
    })
    dialog.addEventListener('close', () => settle('cancel'))

    mount.appendChild(dialog)
    try {
      if (nativeModal) {
        dialog.showModal() // focuses the [autofocus] button; the engine adopts it
      } else {
        dialog.setAttribute('data-spatial-container', 'contain')
        dialog.setAttribute('open', '')
        primary?.focus()
      }
    } catch (error) {
      dialog.remove()
      restorePriorFocus()
      reject(error)
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
  const primary = options.defaultButton ?? 'ok'
  const result = await openDialog(message, options, [
    { label: options.cancelLabel ?? 'Cancel', value: 'cancel', primary: primary === 'cancel' },
    { label: options.okLabel ?? 'OK', value: 'ok', primary: primary === 'ok' },
  ])
  return result === 'ok'
}
