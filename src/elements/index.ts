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
 *       <div data-focusable>…</div>
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

/**
 * `<spatial-nav>` — owns a SpatialNavigation scoped to its subtree.
 *
 * Attributes:
 *   adapters    space-separated: "keyboard gamepad" (default), or "" for a
 *               purely programmatic region (e.g. a secondary nav island)
 *   auto-focus  focus the region's default/first focusable when connected
 */
export class SpatialNavElement extends HTMLElement {
  nav: SpatialNavigation | null = null

  connectedCallback(): void {
    if (this.nav) return
    const names = (this.getAttribute('adapters') ?? 'keyboard gamepad').split(/\s+/).filter(Boolean)
    const adapters: InputAdapter[] = []
    if (names.includes('keyboard')) adapters.push(keyboardAdapter())
    if (names.includes('gamepad')) adapters.push(gamepadAdapter())
    this.nav = createSpatialNavigation({
      root: this,
      adapters,
      autofocus: this.hasAttribute('auto-focus'),
    })
    this.nav.start()
  }

  disconnectedCallback(): void {
    this.nav?.destroy()
    this.nav = null
  }
}

/**
 * `<spatial-container>` — declarative focus group. Boolean attributes
 * `contain`, `wrap`, and `remember` map onto the engine's container tokens.
 */
export class SpatialContainerElement extends HTMLElement {
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
  const registry = options.registry ?? customElements
  const navTag = options.navTag ?? 'spatial-nav'
  const containerTag = options.containerTag ?? 'spatial-container'
  if (!registry.get(navTag)) registry.define(navTag, SpatialNavElement)
  if (!registry.get(containerTag)) registry.define(containerTag, SpatialContainerElement)
}
