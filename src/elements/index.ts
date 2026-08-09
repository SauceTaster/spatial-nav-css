/**
 * Web Components for spatial-nav-css — framework-free declarative usage:
 *
 *   <script type="module">
 *     import { defineSpatialElements } from 'spatial-nav-css/elements'
 *     defineSpatialElements()
 *   </script>
 *
 *   <spatial-nav auto-focus>
 *     <spatial-container remember>
 *       <button>…</button>
 *     </spatial-container>
 *     <spatial-container wrap remember>
 *       <button>…</button>
 *     </spatial-container>
 *   </spatial-nav>
 *
 * Children stay in the light DOM, so the engine, page CSS, and the spatial
 * stylesheet all apply normally.
 */
import {
  createSpatialNavigation,
  gamepadAdapter,
  keyboardAdapter,
  type InputAdapter,
  type SpatialNavigation,
} from '../index'

const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement

/**
 * `<spatial-nav>` — owns a SpatialNavigation scoped to its subtree.
 *
 * Attributes:
 *   adapters    space-separated: "keyboard gamepad" (default), or "" for a
 *               purely programmatic region (e.g. a secondary nav island)
 *   auto-focus  focus the region's default/first focusable when connected
 */
export class SpatialNavElement extends HTMLElementBase {
  nav: SpatialNavigation | null = null
  private cancelAutofocusRetry: (() => void) | null = null

  connectedCallback(): void {
    if (this.nav) return
    const names = (this.getAttribute('adapters') ?? 'keyboard gamepad').split(/\s+/).filter(Boolean)
    const adapters: InputAdapter[] = []
    if (names.includes('keyboard')) adapters.push(keyboardAdapter())
    if (names.includes('gamepad')) adapters.push(gamepadAdapter())
    const nav = createSpatialNavigation({
      root: this,
      adapters,
      // Autofocus is handled below: a microtask covers fragment-parsed and
      // upgraded elements, and a DOMContentLoaded retry covers parser-created
      // elements whose children have not been parsed yet.
      autofocus: false,
    })
    this.nav = nav
    try {
      nav.start()
    } catch (error) {
      this.nav = null
      nav.destroy()
      throw error
    }
    if (this.hasAttribute('auto-focus')) {
      const view = this.ownerDocument.defaultView
      const defer = view?.queueMicrotask
        ? (callback: () => void) => view.queueMicrotask(callback)
        : (callback: () => void) => void Promise.resolve().then(callback)
      // Returns true when settled: focus landed, something else already has
      // spatial focus, or this element no longer owns `nav`. Returns false
      // only when a retry could still succeed (no focusables found yet).
      const tryAutofocus = (): boolean => {
        if (this.nav !== nav || !this.isConnected || nav.getFocused()) return true
        return nav.focusFirst()
      }
      defer(() => {
        // The microtask checkpoint runs as soon as the stack unwinds after
        // connectedCallback. For a streaming-parser-created element that is
        // still BEFORE its children exist, so when nothing is focusable and
        // the document is mid-parse, retry once the subtree is complete.
        if (tryAutofocus()) return
        const doc = this.ownerDocument
        if (doc.readyState !== 'loading') return
        const onReady = (): void => {
          this.cancelAutofocusRetry = null
          tryAutofocus()
        }
        doc.addEventListener('DOMContentLoaded', onReady, { once: true })
        this.cancelAutofocusRetry = () => doc.removeEventListener('DOMContentLoaded', onReady)
      })
    }
  }

  disconnectedCallback(): void {
    this.cancelAutofocusRetry?.()
    this.cancelAutofocusRetry = null
    this.nav?.destroy()
    this.nav = null
  }
}

/**
 * `<spatial-container>` — declarative focus group. Boolean attributes
 * `contain`, `wrap`, and `remember` map onto the engine's container tokens.
 */
export class SpatialContainerElement extends HTMLElementBase {
  static get observedAttributes(): string[] {
    return ['contain', 'wrap', 'remember']
  }

  connectedCallback(): void {
    this.sync()
  }

  attributeChangedCallback(): void {
    this.sync()
  }

  private sync(): void {
    const tokens = SpatialContainerElement.observedAttributes
      .filter((name) => this.hasAttribute(name))
      .join(' ')
    // data-spatial-container is not observed, so this cannot loop.
    this.setAttribute('data-spatial-container', tokens)
  }
}

export interface DefineSpatialElementsOptions {
  navTag?: string
  containerTag?: string
  registry?: CustomElementRegistry
}

/** Register both elements. Safe to call more than once. */
export function defineSpatialElements(options: DefineSpatialElementsOptions = {}): void {
  const registry =
    options.registry ?? (typeof customElements !== 'undefined' ? customElements : undefined)
  if (!registry) {
    throw new Error('defineSpatialElements() requires a browser CustomElementRegistry')
  }
  const navTag = options.navTag ?? 'spatial-nav'
  const containerTag = options.containerTag ?? 'spatial-container'
  if (navTag === containerTag) {
    throw new Error('defineSpatialElements() requires distinct navTag and containerTag names')
  }
  // A CustomElementRegistry may only register a constructor once. Fresh
  // subclasses keep custom tag aliases working after the defaults exist.
  if (!registry.get(navTag)) registry.define(navTag, class extends SpatialNavElement {})
  if (!registry.get(containerTag)) {
    registry.define(containerTag, class extends SpatialContainerElement {})
  }
}
