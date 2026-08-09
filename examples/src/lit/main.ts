/**
 * Lit example — render into the LIGHT DOM so the engine can see into
 * components. The engine's candidate query is a querySelectorAll over the
 * configured root's tree and never pierces shadow roots (docs/edge-cases.md,
 * "Shadow DOM"). `createRenderRoot() { return this }` keeps every button in
 * that tree; <sn-shadow-vault> below deliberately keeps Lit's default shadow
 * root so the failure mode is visible on the page and pinned by the test.
 */
import { LitElement, css, html } from 'lit'
import { createSpatialNavigation, type SpatialEvent } from 'spatial-nav-css'
import 'spatial-nav-css/css'
import '../shared/examples.css'

/** A card whose inner <button> is a real spatial candidate (light DOM). */
export class SnCard extends LitElement {
  static properties = {
    label: { type: String },
    buttonId: { type: String, attribute: 'button-id' },
  }
  // `declare` + constructor defaults: with ES2022 class fields an initialized
  // field would shadow the reactive accessor Lit generates.
  declare label: string
  declare buttonId: string
  constructor() {
    super()
    this.label = ''
    this.buttonId = ''
  }
  createRenderRoot() {
    return this
  }
  render() {
    return html`<button class="tile" id=${this.buttonId}>${this.label}</button>`
  }
}

/** A row of cards. The host element itself declares the spatial container. */
export class SnRail extends LitElement {
  static properties = {
    heading: { type: String },
    items: { type: Array },
  }
  declare heading: string
  declare items: string[]
  constructor() {
    super()
    this.heading = ''
    this.items = []
  }
  connectedCallback() {
    super.connectedCallback()
    // Markup may pre-set the attribute to pick different container tokens.
    if (!this.hasAttribute('data-spatial-container')) {
      this.setAttribute('data-spatial-container', 'remember')
    }
  }
  createRenderRoot() {
    return this
  }
  render() {
    return html`
      <h2>${this.heading}</h2>
      <div class="ex-row">
        ${this.items.map(
          (label, i) => html`<sn-card button-id="${this.id}-${i}" label=${label}></sn-card>`,
        )}
      </div>
    `
  }
}

/** Status line: a reactive property driven by the bubbling 'spatial:focus'. */
export class SnStatus extends LitElement {
  static properties = {
    message: { type: String },
  }
  declare message: string
  constructor() {
    super()
    this.message = 'waiting for focus…'
  }
  private readonly onSpatialFocus = (event: Event): void => {
    const label = (event.target as HTMLElement).textContent?.trim()
    this.message = `focus → ${label} [${(event as SpatialEvent).detail.source}]`
  }
  connectedCallback() {
    super.connectedCallback()
    this.ownerDocument.addEventListener('spatial:focus', this.onSpatialFocus)
  }
  disconnectedCallback() {
    this.ownerDocument.removeEventListener('spatial:focus', this.onSpatialFocus)
    super.disconnectedCallback()
  }
  createRenderRoot() {
    return this
  }
  render() {
    return html`<p class="status">${this.message}</p>`
  }
}

/**
 * WHAT DOES NOT WORK — kept on purpose. This component uses Lit's default
 * shadow root, so its button renders and clicks fine but the engine's
 * candidate query stops at the shadow boundary: arrows can never land here.
 * A component that must keep shadow DOM should put its focusables in slotted
 * light-DOM children instead.
 */
export class SnShadowVault extends LitElement {
  static properties = {
    label: { type: String },
  }
  declare label: string
  constructor() {
    super()
    this.label = 'Unreachable'
  }
  static styles = css`
    button {
      height: 84px;
      min-width: 160px;
      border: 1px dashed rgba(255, 255, 255, 0.25);
      border-radius: 8px;
      background: transparent;
      color: inherit;
      font-size: 13px;
      cursor: pointer;
    }
  `
  render() {
    return html`<button>${this.label}</button>`
  }
}

function define(name: string, ctor: CustomElementConstructor): void {
  if (!customElements.get(name)) customElements.define(name, ctor)
}
define('sn-card', SnCard)
define('sn-rail', SnRail)
define('sn-status', SnStatus)
define('sn-shadow-vault', SnShadowVault)

// Page glue: lit.html provides #app; the vitest import path does not, so the
// live engine only exists in the browser (the test builds its own instance
// with deterministic engine options).
const app = document.getElementById('app')
if (app) {
  void (async () => {
    // First render is async — wait for rails, then the cards they created,
    // so autofocus has candidates to land on.
    await Promise.all([...app.querySelectorAll<SnRail>('sn-rail')].map((el) => el.updateComplete))
    await Promise.all([...app.querySelectorAll<SnCard>('sn-card')].map((el) => el.updateComplete))
    // Scope the engine to the app region so the page-chrome links above it
    // never compete as candidates (root defaults to the whole document).
    const nav = createSpatialNavigation({ root: app, autofocus: true })
    nav.start()
  })()
}
