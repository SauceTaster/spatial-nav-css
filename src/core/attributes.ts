/**
 * Attribute bookkeeping shared by the framework bindings (internal).
 *
 * The `data-nav-*` / `data-spatial-autofocus` attributes are the library's
 * documented declarative configuration surface, so an element can already
 * carry them from the consumer's own markup. A binding must therefore never
 * blind-delete them: it records what each attribute held *before* it wrote
 * one, and puts exactly that back when the option is withdrawn or the
 * binding detaches from the element.
 */

/** Attribute name → the value it held before this binding wrote it. */
export type OwnedAttributes = Map<string, string | null>

export interface FocusableAttributeOptions {
  autofocus?: boolean
  navUp?: string
  navDown?: string
  navLeft?: string
  navRight?: string
}

function write(el: HTMLElement, name: string, value: string, owned: OwnedAttributes): void {
  if (!owned.has(name)) owned.set(name, el.getAttribute(name))
  el.setAttribute(name, value)
}

function release(el: HTMLElement, name: string, owned: OwnedAttributes): void {
  if (!owned.has(name)) return
  const previous = owned.get(name) ?? null
  owned.delete(name)
  if (previous === null) el.removeAttribute(name)
  else el.setAttribute(name, previous)
}

function sync(el: HTMLElement, name: string, value: string | undefined, owned: OwnedAttributes): void {
  if (value === undefined) release(el, name, owned)
  else write(el, name, value, owned)
}

/** Apply the focusable option set, owning only what it actually writes. */
export function applyFocusableAttributes(
  el: HTMLElement,
  options: FocusableAttributeOptions,
  owned: OwnedAttributes,
): void {
  const selector = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined
  write(el, 'data-focusable', '', owned)
  sync(el, 'data-spatial-autofocus', options.autofocus ? '' : undefined, owned)
  sync(el, 'data-nav-up', selector(options.navUp), owned)
  sync(el, 'data-nav-down', selector(options.navDown), owned)
  sync(el, 'data-nav-left', selector(options.navLeft), owned)
  sync(el, 'data-nav-right', selector(options.navRight), owned)
}

/** Put every attribute this binding wrote back the way it found it. */
export function releaseOwnedAttributes(el: HTMLElement, owned: OwnedAttributes): void {
  for (const name of [...owned.keys()]) release(el, name, owned)
}
