/**
 * Default selector for spatially focusable elements. Covers common browser
 * focus stops plus an opt-in `data-focusable` hook for non-interactive
 * elements that intentionally participate in navigation.
 *
 * An explicit tabindex="-1" on a native widget means "not a stop" — e.g. a
 * slider nested inside a focusable settings row. The exception is
 * [data-focusable]: the engine itself assigns tabindex="-1" to those so they
 * can hold real focus, so the opt-in must keep matching.
 */
export const DEFAULT_FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not(:disabled):not([tabindex="-1"])',
  'input:not(:disabled):not([type="hidden"]):not([tabindex="-1"])',
  'select:not(:disabled):not([tabindex="-1"])',
  'textarea:not(:disabled):not([tabindex="-1"])',
  'details > summary:first-of-type',
  '[contenteditable]:not([contenteditable="false"])',
  'audio[controls]',
  'video[controls]',
  'iframe',
  '[tabindex]',
  '[data-focusable]',
].join(', ')

/** Match the configured selector while enforcing native disabled/tab-stop semantics. */
export function matchesFocusableSelector(
  el: HTMLElement,
  selector: string = DEFAULT_FOCUSABLE_SELECTOR,
): boolean {
  try {
    if (!el.matches(selector) || el.matches(':disabled')) return false
  } catch {
    return false
  }
  // The default selector treats all negative tabindex values as an explicit
  // opt-out. `data-focusable` is the one deliberate exception: the engine
  // gives those elements tabindex=-1 so they can receive programmatic focus.
  if (
    selector === DEFAULT_FOCUSABLE_SELECTOR &&
    !el.hasAttribute('data-focusable') &&
    el.hasAttribute('tabindex') &&
    el.tabIndex < 0
  ) {
    return false
  }
  return true
}

/**
 * Semantic reachability: is this element navigable *in principle*, ignoring
 * how it is painted?
 *
 * This is deliberately separate from the rendering check below, because a
 * custom `visibilityFilter` replaces only the latter. Modal containment for
 * every portaled overlay library (Radix, Headless UI, Ark, MUI, …) rests on
 * `aria-hidden` being applied to the rest of the page, so folding that into
 * a replaceable predicate meant an app supplying its own filter silently lost
 * the ability to keep focus inside its own modals.
 */
export function isSemanticallyNavigable(el: HTMLElement): boolean {
  if (el.closest('[aria-hidden="true"], [inert], [hidden]')) return false
  // A native modal dialog (showModal) focus-blocks everything outside the
  // top layer without setting any attribute — only its subtree is navigable
  // while it is open. The tag-index length check keeps dialog-free pages at
  // near-zero cost on this hot path.
  const doc = el.ownerDocument
  if (doc.getElementsByTagName('dialog').length > 0) {
    try {
      const modal = doc.querySelector('dialog:modal')
      if (modal && !modal.contains(el)) return false
    } catch {
      // ':modal' unsupported (jsdom): authors fall back to explicit
      // data-spatial-container="contain" on the dialog.
    }
  }
  return true
}

/** Is the element actually painted? Replaceable via `visibilityFilter`. */
export function isRendered(el: HTMLElement): boolean {
  // Native fast path: one engine call covering rendered boxes and CSS
  // visibility — much cheaper than getComputedStyle per element. Both
  // spellings of the option are required: `visibilityProperty` arrived in
  // Chromium 121 / Firefox 122, while earlier engines (including the
  // Chromium ~108 builds on current Tizen/webOS TVs) only understand
  // `checkVisibilityCSS` and silently drop the unknown member — which would
  // otherwise degrade this call to a rendered-box check that lets
  // `visibility: hidden` elements receive spatial focus.
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true })
  }
  if (el.getClientRects().length === 0) return false
  const style = el.ownerDocument.defaultView?.getComputedStyle(el)
  if (style && (style.visibility === 'hidden' || style.visibility === 'collapse')) return false
  return true
}

/** The default focusability filter: semantically reachable *and* painted. */
export function isElementVisible(el: HTMLElement): boolean {
  return isSemanticallyNavigable(el) && isRendered(el)
}

export function getFocusables(
  scope: ParentNode,
  selector: string = DEFAULT_FOCUSABLE_SELECTOR,
  visibilityFilter: (el: HTMLElement) => boolean = isElementVisible,
): HTMLElement[] {
  const all = scope.querySelectorAll<HTMLElement>(selector)
  const out: HTMLElement[] = []
  for (const el of all) {
    if (matchesFocusableSelector(el, selector) && visibilityFilter(el)) out.push(el)
  }
  return out
}

/** True when key events on this element should be left alone (text entry). */
export function isEditable(el: EventTarget | null): boolean {
  if (!isHTMLElementNode(el)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color'].includes(type)
  }
  return false
}

export function ownerDocumentOf(root: Document | HTMLElement): Document {
  // nodeType, not instanceof: a document from another realm (iframe) is not
  // an instance of this realm's Document, and a Document's ownerDocument is
  // null — instanceof here would yield a null doc and crash downstream.
  // (An element's ownerDocument is only null for Document nodes, excluded
  // by the nodeType branch.)
  return root.nodeType === 9 /* Node.DOCUMENT_NODE */
    ? (root as Document)
    : (root.ownerDocument as Document)
}

/**
 * Cross-realm-safe HTMLElement check (instanceof fails for elements from
 * iframes); duck-types on element nodeType plus style.
 */
export function isHTMLElementNode(value: unknown): value is HTMLElement {
  if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) return true
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Node).nodeType === 1 &&
    'style' in value &&
    'focus' in value
  )
}
