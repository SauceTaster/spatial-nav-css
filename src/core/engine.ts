import type { Direction, NavRect, ScoringOptions } from './types'
import { DEFAULT_SCORING } from './types'
import {
  OPPOSITE,
  classifyDirection,
  findBestCandidate,
  toNavRect,
  unionRects,
  wrapOrigin,
} from './geometry'
import {
  DEFAULT_FOCUSABLE_SELECTOR,
  getFocusables,
  isHTMLElementNode,
  isRendered,
  isSemanticallyNavigable,
  matchesFocusableSelector,
  ownerDocumentOf,
} from './dom'
import { containerChain, findContainer, type NavConfigCache, readNavConfig } from './config'
import { dispatchSpatialEvent } from '../events'

export interface EngineOptions {
  /** Subtree the engine operates on. Defaults to `document`. */
  root?: Document | HTMLElement
  /** Selector for focusable elements. */
  focusableSelector?: string
  /** Distance-function tunables. */
  scoring?: Partial<ScoringOptions>
  /** Rect provider — injectable for tests and virtualized layouts. */
  getRect?: (el: HTMLElement) => NavRect
  /** Visibility predicate — injectable for tests. */
  visibilityFilter?: (el: HTMLElement) => boolean
  /**
   * Scroll behavior when focus moves. `false` disables scrolling entirely.
   * Defaults to 'auto'. Use 'smooth' to opt in; it becomes 'instant' under
   * prefers-reduced-motion.
   */
  scrollBehavior?: ScrollBehavior | false
  /** Class applied to the focused element (gamepad focus isn't :focus-visible). */
  focusClass?: string
  /**
   * When the focused element is removed from the DOM (list re-render,
   * virtualization, route change), restore focus automatically — to the
   * nearest surviving container's memory, then its default focus, then its
   * first focusable, then the root's first focusable. Debounced briefly so
   * bulk re-renders settle first, and cancelled if focus moves on its own.
   * Requires start(). Default true.
   */
  autoRestoreFocus?: boolean
}

/** Debounce for auto-restore: lets a burst of removals/re-renders settle. */
const AUTO_RESTORE_DELAY_MS = 100

export interface FocusMoveDetail {
  direction?: Direction | null
  from?: HTMLElement | null
  source?: string
  /** The move came from a held control rather than a discrete press. */
  repeat?: boolean
}

interface ScopeCandidate {
  element: HTMLElement
  rect: NavRect
  /** True when this entry represents a nested container (zone), not the element itself. */
  isGroup: boolean
}

export class SpatialEngine {
  readonly root: Document | HTMLElement
  private readonly doc: Document
  private readonly selector: string
  private readonly scoring: ScoringOptions
  private readonly getRect: (el: HTMLElement) => NavRect
  private readonly isVisible: (el: HTMLElement) => boolean
  private readonly scrollBehavior: ScrollBehavior | false
  private readonly focusClass: string

  private current: HTMLElement | null = null
  private readonly memory = new WeakMap<HTMLElement, HTMLElement>()
  private readonly autoRestore: boolean
  /** Container chain of `current` at adopt time — survives its removal. */
  private currentChain: HTMLElement[] = []
  private restoreTimer: ReturnType<typeof setTimeout> | null = null
  private removalObserver: MutationObserver | null = null
  /** tabindex attributes added by the engine, restored by destroy(). */
  private readonly managedTabIndexes = new Set<HTMLElement>()
  /** One-shot guard for the collapsed-rect dev diagnostic (see diagnoseNoTarget). */
  private warnedCollapse = false
  private readonly onFocusIn = (event: FocusEvent): void => {
    const target = event.target
    if (!isHTMLElementNode(target)) return
    // Any real focus move cancels a pending removal restore, including focus
    // that intentionally moved to another navigation region.
    this.cancelRestore()
    // An application handler for this same event may already have moved focus
    // on — a menu redirecting entry to its first item, for instance. React
    // dispatches from its root container, *below* this document-level
    // listener, so that redirect runs first and adopting the event's original
    // target here would strand the focus ring on an element that no longer
    // holds DOM focus. The redirect raises its own focusin, which adopts.
    if (this.resolveActiveElement() !== target) return
    if (
      this.rootContains(target) &&
      (target === this.current || matchesFocusableSelector(target, this.selector))
    ) {
      this.adopt(target)
    } else {
      // Keep the last spatial position for a later resume, but do not leave a
      // second visible focus ring while another control/region owns DOM focus.
      this.undecorate(this.current)
    }
  }
  private started = false

  constructor(options: EngineOptions = {}) {
    const root = options.root ?? (typeof document !== 'undefined' ? document : null)
    if (!root) {
      throw new Error(
        'SpatialEngine requires a DOM root. Pass { root } in a browser environment; ' +
          'use createSpatialNavigation() for an SSR-safe facade.',
      )
    }
    this.root = root
    this.doc = ownerDocumentOf(this.root)
    this.selector = options.focusableSelector ?? DEFAULT_FOCUSABLE_SELECTOR
    try {
      this.root.querySelector(this.selector)
    } catch {
      throw new TypeError('EngineOptions.focusableSelector must be a valid CSS selector')
    }
    this.scoring = { ...DEFAULT_SCORING, ...options.scoring }
    for (const [name, value] of Object.entries(this.scoring)) {
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`EngineOptions.scoring.${name} must be a finite non-negative number`)
      }
    }
    if (this.scoring.alignedOverlapRatio > 1) {
      throw new RangeError('EngineOptions.scoring.alignedOverlapRatio must be between 0 and 1')
    }
    this.getRect = options.getRect ?? ((el) => toNavRect(el.getBoundingClientRect()))
    // The semantic policy (aria-hidden / inert / hidden / open modal) is
    // enforced unconditionally: a custom filter augments it, it does not
    // replace it. Every portaled overlay library keeps focus inside its
    // modal by aria-hiding the rest of the page, so a replaceable policy
    // meant supplying a filter silently let navigation reach controls behind
    // an open dialog.
    const rendered = options.visibilityFilter ?? isRendered
    this.isVisible = (el) => isSemanticallyNavigable(el) && rendered(el)
    const scrollBehavior = options.scrollBehavior ?? 'auto'
    if (
      scrollBehavior !== false &&
      scrollBehavior !== 'auto' &&
      scrollBehavior !== 'instant' &&
      scrollBehavior !== 'smooth'
    ) {
      throw new TypeError("EngineOptions.scrollBehavior must be false, 'auto', 'instant', or 'smooth'")
    }
    this.scrollBehavior = scrollBehavior
    const focusClass = options.focusClass ?? 'spatial-focused'
    try {
      if (typeof focusClass !== 'string') throw new TypeError()
      this.doc.createElement('div').classList.add(focusClass)
    } catch {
      throw new TypeError('EngineOptions.focusClass must be one non-empty DOM class token')
    }
    this.focusClass = focusClass
    this.autoRestore = options.autoRestoreFocus ?? true
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.doc.addEventListener('focusin', this.onFocusIn)
    const Observer = this.doc.defaultView?.MutationObserver
    if (this.autoRestore && Observer) {
      this.removalObserver = new Observer(() => {
        this.pruneManagedTabIndexes()
        // Disabling the focused control strands the user just as removal
        // does — `getFocused()` starts reporting null and the next press
        // restarts from the top — and "the button you pressed disables
        // itself while it works" is an extremely common admin-UI shape.
        // Watching one attribute costs far less than the confusion.
        if (this.current && !this.isEligibleSpatialTarget(this.current)) this.scheduleRestore()
        // The mirror image: an overlay finishing its exit transition removes
        // the aria-hidden it put on the page, and the element that already
        // holds DOM focus becomes navigable again — but no focus event fires
        // to say so. Adopt it rather than letting the restore fallback drag
        // the user to the first focusable on the page.
        else if (!this.current) this.adoptActiveElement()
      })
      this.removalObserver.observe(this.root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'aria-hidden', 'inert', 'hidden'],
      })
    }
    this.adoptActiveElement()
  }

  /** Adopt whatever already holds DOM focus, when it is a valid target. */
  private adoptActiveElement(): void {
    const active = this.resolveActiveElement()
    if (
      isHTMLElementNode(active) &&
      this.rootContains(active) &&
      matchesFocusableSelector(active, this.selector) &&
      this.isVisible(active)
    ) {
      this.adopt(active)
    }
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.doc.removeEventListener('focusin', this.onFocusIn)
    this.removalObserver?.disconnect()
    this.removalObserver = null
    this.cancelRestore()
  }

  destroy(): void {
    this.stop()
    this.undecorate(this.current)
    this.current = null
    this.currentChain = []
    for (const el of this.managedTabIndexes) {
      if (el.getAttribute('tabindex') === '-1') el.removeAttribute('tabindex')
    }
    this.managedTabIndexes.clear()
  }

  private cancelRestore(): void {
    if (this.restoreTimer !== null) {
      clearTimeout(this.restoreTimer)
      this.restoreTimer = null
    }
  }

  private pruneManagedTabIndexes(): void {
    for (const el of this.managedTabIndexes) {
      if (el.isConnected && this.rootContains(el)) continue
      if (el.getAttribute('tabindex') === '-1') el.removeAttribute('tabindex')
      this.managedTabIndexes.delete(el)
    }
  }

  private scheduleRestore(): void {
    this.cancelRestore()
    this.restoreTimer = setTimeout(() => {
      this.restoreTimer = null
      // Usable again inside this root, or focus already landed somewhere on
      // its own (including another scoped engine) — stand down. Eligibility,
      // not mere connectivity: a control that disabled itself is still in
      // the document but can no longer hold spatial focus, and a browser
      // that blurs it leaves the user with nothing.
      const current = this.current
      const usable =
        !!current &&
        current.isConnected &&
        this.rootContains(current) &&
        this.isEligibleSpatialTarget(current)
      if (usable) return
      const active = this.resolveActiveElement()
      const hasRealFocus =
        isHTMLElementNode(active) &&
        active !== this.doc.body &&
        active !== this.doc.documentElement &&
        active !== current
      if (hasRealFocus) return
      this.restoreFocus()
    }, AUTO_RESTORE_DELAY_MS)
  }

  /**
   * The focused element is gone: bring focus back to the nearest surviving
   * ancestor container — its memory, then its declared default focus, then
   * its first focusable — falling back to the root's entry point. Restoration
   * can still fail when no surviving eligible target exists.
   */
  private restoreFocus(): void {
    const detail: FocusMoveDetail = { source: 'restore' }
    for (const container of this.currentChain) {
      if (!container.isConnected || !this.rootContains(container)) continue
      const remembered = this.memory.get(container)
      if (
        this.isEligibleSpatialTarget(remembered) &&
        container.contains(remembered) &&
        this.focus(remembered, detail)
      ) {
        return
      }
      if (remembered) this.memory.delete(container)
      const preferred = this.findDefaultFocus(container, new Map())
      if (preferred && this.focus(preferred, detail)) return
      const first = this.collectFocusables(container)[0]
      if (first && this.focus(first, detail)) return
    }
    this.focusFirst(detail)
  }

  /**
   * document.activeElement retargeted through open shadow roots — inside a
   * shadow tree the document only reports the host.
   */
  private resolveActiveElement(): Element | null {
    let active = this.doc.activeElement
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
    return active
  }

  getFocused(): HTMLElement | null {
    const active = this.resolveActiveElement()
    if (isHTMLElementNode(active) && active !== this.doc.body && active !== this.doc.documentElement) {
      if (
        this.rootContains(active) &&
        !active.matches(':disabled') &&
        this.isVisible(active) &&
        (active === this.current || matchesFocusableSelector(active, this.selector))
      ) {
        // Real DOM focus is the source of truth. Resync if we missed the
        // focusin (focus events don't fire in unfocused/hidden windows).
        if (active !== this.current) this.adopt(active)
        return active
      }
      this.undecorate(this.current)
      // Focus genuinely lives outside this root (another region, an input):
      // this engine doesn't own focus right now.
      return null
    }
    // Nothing holds focus (body): the spatial position persists.
    return this.validCurrent()
  }

  private validCurrent(): HTMLElement | null {
    return this.current?.isConnected &&
      this.rootContains(this.current) &&
      !this.current.matches(':disabled') &&
      this.isVisible(this.current)
      ? this.current
      : null
  }

  /**
   * Move focus in a direction. Returns true if focus moved.
   *
   * `repeat` marks a move produced by a held control; it is carried on the
   * resulting events so an application can implement accelerated scrolling
   * without re-deriving key-repeat state the adapter already tracks.
   */
  navigate(dir: Direction, source = 'api', repeat = false): boolean {
    const origin = this.getFocused()
    if (!origin) return this.focusFirst({ direction: dir, source, repeat })
    const target = this.findTarget(dir, origin)
    if (!target) {
      this.diagnoseNoTarget()
      dispatchSpatialEvent(origin, 'spatial:nofocustarget', {
        direction: dir,
        from: origin,
        source,
        repeat,
      })
      return false
    }
    return this.focus(target, { direction: dir, from: origin, source, repeat })
  }

  /**
   * Dev-only, one-time diagnostic for a silent-death failure mode surfaced by
   * embeddings such as CEF / preview iframes reporting a 0 or unknown viewport:
   * when focusables are sized or animated with raw vw/vh they can all collapse
   * to the same ~0px rect, so every candidate classifies as "nowhere" and a
   * navigation finds nothing — with no error and no event payload to explain
   * it. The engine can't fix the host's layout, but it can refuse to fail
   * silently. Skipped in production builds and after it has fired once.
   */
  private diagnoseNoTarget(): void {
    if (this.warnedCollapse) return
    // Guard `process` for the browser, where it is usually undefined.
    if (
      typeof process !== 'undefined' &&
      (process as { env?: { NODE_ENV?: string } }).env?.NODE_ENV === 'production'
    ) {
      return
    }
    const focusables = this.collectFocusables(this.root)
    if (focusables.length < 3) return // a genuine edge of a small UI, not a collapse
    let collapsed = 0
    for (const el of focusables) {
      const r = this.getRect(el)
      if (r.width <= 1 && r.height <= 1) collapsed++
    }
    if (collapsed >= focusables.length * 0.8) {
      this.warnedCollapse = true
      console.warn(
        `[spatial-nav-css] navigation found no target: ${collapsed}/${focusables.length} focusables ` +
          'have a ~0px rect (likely a 0 or unknown viewport — e.g. CEF or a preview iframe). ' +
          'Avoid sizing or animating focusables with raw vw/vh that can collapse to 0; ' +
          'use clamp(min, vw, max) instead.',
      )
    }
  }

  /**
   * Resolve the element navigation would move to, without moving.
   *
   * The hierarchy is inspired by css-nav-1 scope concepts: within the current
   * container, sibling containers compete as single candidates (one rect per
   * zone — a sidebar, a header, a carousel). Once a zone wins, the search
   * descends into it. This keeps "right from the sidebar" biased toward the
   * content area instead of an unrelated diagonal element.
   */
  findTarget(dir: Direction, from: HTMLElement): HTMLElement | null {
    if (!from.isConnected || !this.rootContains(from) || !this.isVisible(from)) return null
    // One config cache per navigation pass: getComputedStyle dominates the
    // engine's cost, so each element is read at most once per keypress.
    const cache: NavConfigCache = new Map()

    const config = readNavConfig(from, cache)
    const override = config.explicit[dir]
    if (override !== undefined) {
      if (override === 'none') return null
      let el: HTMLElement | null = null
      try {
        el = this.root.querySelector<HTMLElement>(override)
      } catch {
        // A malformed selector blocks the direction rather than throwing —
        // a loudly-broken override must not crash the input path.
        return null
      }
      // An override resolving to the origin itself is a no-op, not a move.
      return el && el !== from && this.isEligibleSpatialTarget(el) ? el : null
    }

    const fromRect = this.getRect(from)
    let scope: HTMLElement | null = findContainer(from, this.root, cache)

    for (;;) {
      const scopeNode: ParentNode = scope ?? this.root
      const candidates = this.collectScopeCandidates(scopeNode, from, cache)
      const picked = this.pickBest(candidates, fromRect, dir, from, cache)
      if (picked) return this.resolveEntry(picked, from, cache)

      if (!scope) return null
      const scopeConfig = readNavConfig(scope, cache)
      // Wrap only when the container actually has items strictly behind us
      // on this axis — i.e. we're at the end of a row/column, not merely
      // pressing orthogonally to the container's layout direction. The
      // 'beyond' tier is required: the looser 'overlapping' tier would let a
      // same-row sibling that sits a few pixels off-axis (baseline
      // alignment, mixed card heights) count as "behind us" for an
      // orthogonal press, turning "down" in a horizontal row into a
      // sideways wrap instead of an exit.
      if (
        scopeConfig.wrap &&
        candidates.some((c) => classifyDirection(fromRect, c.rect, OPPOSITE[dir]) === 'beyond')
      ) {
        const extent = unionRects([fromRect, ...candidates.map((c) => c.rect)])
        const origin = wrapOrigin(extent, fromRect, dir)
        const wrapped = this.pickBest(candidates, origin, dir, from, cache)
        if (wrapped) return this.resolveEntry(wrapped, from, cache)
      }
      if (scopeConfig.trap) return null
      scope = findContainer(scope, this.root, cache)
    }
  }

  /** Focus an element (or selector). Returns true if focus moved. */
  focus(target: HTMLElement | string, detail: FocusMoveDetail = {}): boolean {
    let el: HTMLElement | null
    try {
      el = typeof target === 'string' ? this.root.querySelector<HTMLElement>(target) : target
    } catch {
      return false
    }
    if (!el?.isConnected || !this.rootContains(el) || el.matches(':disabled') || !this.isVisible(el)) {
      return false
    }

    const previousActive = this.resolveActiveElement()
    if (previousActive === el) {
      if (this.current !== el) this.adopt(el)
      return false
    }

    const eventDetail = {
      direction: detail.direction ?? null,
      from: detail.from ?? this.current,
      source: detail.source ?? 'api',
      repeat: detail.repeat ?? false,
    }
    if (!dispatchSpatialEvent(el, 'spatial:beforefocus', eventDetail, true)) return false

    // A beforefocus handler may synchronously remove, disable, or hide the
    // target. Revalidate before touching DOM focus.
    if (!el.isConnected || !this.rootContains(el) || el.matches(':disabled') || !this.isVisible(el)) {
      return false
    }

    // Let opt-in/custom elements receive real DOM focus without turning them
    // into sequential Tab stops. Track only attributes we add ourselves.
    const addedTabIndex = !el.hasAttribute('tabindex') && el.tabIndex < 0
    if (addedTabIndex) {
      // With autoRestoreFocus off there is no MutationObserver to prune this
      // set, so removed nodes would be retained until destroy(). Pruning on
      // each addition keeps it bounded by the connected stops instead.
      this.pruneManagedTabIndexes()
      this.managedTabIndexes.add(el)
      el.setAttribute('tabindex', '-1')
    }
    try {
      el.focus({ preventScroll: true })
    } catch {
      if (addedTabIndex) {
        el.removeAttribute('tabindex')
        this.managedTabIndexes.delete(el)
      }
      return false
    }
    // `HTMLElement.focus()` is allowed to do nothing, and composite widgets
    // may synchronously redirect focus from their root to an eligible child.
    const actual = this.resolveActiveElement()
    if (actual !== el) {
      if (addedTabIndex) {
        el.removeAttribute('tabindex')
        this.managedTabIndexes.delete(el)
      }
      if (
        actual === previousActive ||
        !isHTMLElementNode(actual) ||
        !actual.isConnected ||
        !this.rootContains(actual) ||
        actual.matches(':disabled') ||
        !this.isVisible(actual)
      ) {
        return false
      }
      this.adopt(actual)
      this.scrollTo(actual)
      dispatchSpatialEvent(actual, 'spatial:focus', eventDetail)
      return true
    }

    this.adopt(el)
    this.scrollTo(el)
    dispatchSpatialEvent(el, 'spatial:focus', eventDetail)
    return true
  }

  /** Focus the root's default-focus element, else the first focusable. */
  focusFirst(detail: FocusMoveDetail = {}): boolean {
    const cache: NavConfigCache = new Map()
    if (isHTMLElementNode(this.root) && readNavConfig(this.root, cache).remember) {
      const remembered = this.memory.get(this.root)
      if (
        this.isEligibleSpatialTarget(remembered) &&
        this.root.contains(remembered) &&
        this.focus(remembered, detail)
      ) {
        return true
      }
      if (remembered && !this.isEligibleSpatialTarget(remembered)) this.memory.delete(this.root)
    }
    const preferred = this.findDefaultFocus(this.root, cache)
    if (preferred && this.focus(preferred, detail)) return true
    const first = this.collectFocusables(this.root)[0]
    return first ? this.focus(first, detail) : false
  }

  /** Synthesize activation (click) on the focused element. */
  activate(source = 'api'): boolean {
    const el = this.getFocused()
    if (!el) return false
    const proceed = dispatchSpatialEvent(
      el,
      'spatial:activate',
      { direction: null, from: el, source },
      true,
    )
    if (proceed) el.click()
    return true
  }

  /**
   * Announce release of the activate control (long-press detection lives in
   * the app: check detail.durationMs on 'spatial:activaterelease').
   */
  activateRelease(
    durationMs: number,
    source = 'api',
    target: HTMLElement | null = this.getFocused(),
  ): boolean {
    const el = target
    if (!el?.isConnected || !this.rootContains(el)) return false
    dispatchSpatialEvent(el, 'spatial:activaterelease', {
      direction: null,
      from: el,
      source,
      durationMs,
    })
    return true
  }

  /** Announce that a matched activate press ended without a normal release. */
  activateCancel(source = 'api', target: HTMLElement | null = this.getFocused()): boolean {
    const el = target
    if (!el?.isConnected || !this.rootContains(el)) return false
    dispatchSpatialEvent(el, 'spatial:activatecancel', {
      direction: null,
      from: el,
      source,
    })
    return true
  }

  /**
   * Announce a back/cancel intent. Returns true if a listener handled it
   * (called preventDefault()).
   */
  back(source = 'api'): boolean {
    const target = this.getFocused() ?? this.doc
    return !dispatchSpatialEvent(
      target,
      'spatial:back',
      { direction: null, from: this.getFocused(), source },
      true,
    )
  }

  // --- internals ---

  private rootContains(el: HTMLElement): boolean {
    return this.root.contains(el)
  }

  /**
   * True when nothing has meaningfully claimed focus inside this root.
   *
   * That covers the obvious case — no spatial target and the document's
   * active element still the body — plus one that is easy to miss: focus
   * parked on an element inside this root that the engine could never focus,
   * such as the `tabindex="-1"` wrapper a framework modal's focus trap
   * focuses on open. Nothing owns such an element spatially, so claiming
   * from it is safe; without this, the first direction press after opening a
   * portaled dialog did nothing at all and the remote appeared dead.
   *
   * Focus resting on a genuine stop — possibly a different navigation
   * region's — still reads as claimed, so regions never steal from each
   * other.
   */
  canClaimFocus(): boolean {
    if (this.getFocused()) return false
    const active = this.resolveActiveElement()
    if (!active || active === this.doc.body || active === this.doc.documentElement) return true
    return (
      isHTMLElementNode(active) && this.rootContains(active) && !this.isEligibleSpatialTarget(active)
    )
  }

  private isEligibleSpatialTarget(el: HTMLElement | null | undefined): el is HTMLElement {
    return Boolean(
      el?.isConnected &&
        this.rootContains(el) &&
        matchesFocusableSelector(el, this.selector) &&
        this.isVisible(el),
    )
  }

  /**
   * Focus decoration is written two ways. The class is the documented,
   * themeable hook; the attribute is the durable one, because a framework
   * that renders `className`/`:class` rewrites the class attribute on its
   * next render and would otherwise erase the focus ring out from under the
   * engine. Nothing renders `data-spatial-focused`, so it survives.
   */
  private decorate(el: HTMLElement): void {
    el.classList.add(this.focusClass)
    el.setAttribute('data-spatial-focused', '')
  }

  private undecorate(el: HTMLElement | null | undefined): void {
    if (!el) return
    el.classList.remove(this.focusClass)
    el.removeAttribute('data-spatial-focused')
  }

  private adopt(el: HTMLElement): void {
    this.cancelRestore() // focus moved legitimately; no restore needed
    if (this.current !== el) {
      this.undecorate(this.current)
      this.current = el
    }
    this.decorate(el)
    const cache: NavConfigCache = new Map()
    this.currentChain = containerChain(el, this.root, cache)
    for (const container of this.currentChain) {
      if (readNavConfig(container, cache).remember) this.memory.set(container, el)
    }
  }

  private collectFocusables(scope: ParentNode): HTMLElement[] {
    return getFocusables(scope, this.selector, this.isVisible)
  }

  /**
   * Candidates at one scope level: focusables that live directly in the
   * scope, plus one group candidate per nested container (zone). Elements in
   * a zone are represented by the zone's rect until the zone is entered.
   *
   * Container resolution is path-compressed: siblings share their ancestors'
   * answers, so the walk is O(distinct ancestors), not O(candidates × depth).
   */
  private collectScopeCandidates(
    scopeNode: ParentNode,
    from: HTMLElement,
    cache: NavConfigCache,
  ): ScopeCandidate[] {
    const candidates: ScopeCandidate[] = []
    const groupRects = new Map<HTMLElement, NavRect[]>()

    // topmostUnder(node) = outermost container among node and its ancestors,
    // strictly inside scopeNode. Memoized per ancestor; iterative (climb to a
    // memo hit or the boundary, then fill the path back down) so arbitrarily
    // deep DOMs cannot overflow the stack.
    const topmostMemo = new Map<HTMLElement, HTMLElement | null>()
    const topmostUnder = (start: HTMLElement | null): HTMLElement | null => {
      const path: HTMLElement[] = []
      let node = start
      let result: HTMLElement | null = null
      while (node && node !== scopeNode) {
        const hit = topmostMemo.get(node)
        if (hit !== undefined) {
          result = hit
          break
        }
        path.push(node)
        node = node.parentElement
      }
      for (let i = path.length - 1; i >= 0; i--) {
        const n = path[i]!
        result = result ?? (readNavConfig(n, cache).isContainer ? n : null)
        topmostMemo.set(n, result)
      }
      return result
    }

    for (const el of this.collectFocusables(scopeNode)) {
      if (el === from || el.contains(from) || from.contains(el)) continue
      const container = topmostUnder(el.parentElement)
      if (container) {
        if (container.contains(from)) continue
        let rects = groupRects.get(container)
        if (!rects) {
          rects = []
          groupRects.set(container, rects)
        }
        rects.push(this.getRect(el))
      } else {
        // Note: an element can appear both here (it is itself focusable) and
        // below as a zone (it contains focusables) — the isGroup flag keeps
        // the two candidacies distinct.
        candidates.push({ element: el, rect: this.getRect(el), isGroup: false })
      }
    }
    for (const [container, rects] of groupRects) {
      // The zone is the container's box extended over its content extent: a
      // scrollable carousel is conceptually a full band, and items scrolled
      // past its visible box must still count as part of it for alignment.
      //
      // Degenerate members are dropped first. A single collapsed focusable —
      // an offscreen focus guard, a chart library's tabbable <svg> before it
      // measures, a not-yet-laid-out virtualized row — reports a rect at the
      // viewport origin, and unioning that stretches the whole zone up to
      // (0, 0). Every zone-level score then shifts, silently and almost
      // undiagnosably, in a layout that otherwise looks fine.
      const measured = rects.filter((r) => r.width > 0 || r.height > 0)
      const box = this.getRect(container)
      const content = unionRects(measured.length > 0 ? measured : rects)
      const rect = box.width <= 0 && box.height <= 0 ? content : unionRects([box, content])
      candidates.push({ element: container, rect, isGroup: true })
    }
    return candidates
  }

  /** Best candidate at this level, descending into group (zone) winners. */
  private pickBest(
    candidates: ScopeCandidate[],
    origin: NavRect,
    dir: Direction,
    from: HTMLElement,
    cache: NavConfigCache,
  ): HTMLElement | null {
    const remaining = [...candidates]
    for (;;) {
      const best = findBestCandidate(origin, remaining, dir, this.scoring)
      if (!best) return null
      // Rect identity resolves the winning entry — an element that is both
      // focusable and a zone appears twice with distinct rects.
      const entry = remaining.find((c) => c.rect === best.rect)!
      if (!entry.isGroup) return entry.element
      const descended = this.descendInto(entry.element, origin, dir, from, cache)
      if (descended) return descended
      remaining.splice(remaining.indexOf(entry), 1)
    }
  }

  private descendInto(
    container: HTMLElement,
    origin: NavRect,
    dir: Direction,
    from: HTMLElement,
    cache: NavConfigCache,
  ): HTMLElement | null {
    const candidates = this.collectScopeCandidates(container, from, cache)
    const found = this.pickBest(candidates, origin, dir, from, cache)
    if (found) return found
    // The zone won geometrically but none of its content classifies in the
    // direction from outside (scrolled away, exotic layout) — fall back to
    // its preferred entry, then to any focusable.
    const preferred = this.findDefaultFocus(container, cache)
    if (preferred && preferred !== from) return preferred
    for (const el of this.collectFocusables(container)) {
      if (el !== from && !el.contains(from) && !from.contains(el)) return el
    }
    return null
  }

  /**
   * When navigation crosses into a container, honor the container's focus
   * memory (`remember`) or its declared default-focus child instead of the
   * geometrically nearest element.
   */
  private resolveEntry(target: HTMLElement, from: HTMLElement, cache: NavConfigCache): HTMLElement {
    const crossed = containerChain(target, this.root, cache).filter((c) => !c.contains(from))
    for (let i = crossed.length - 1; i >= 0; i--) {
      const container = crossed[i]!
      if (readNavConfig(container, cache).remember) {
        const remembered = this.memory.get(container)
        // Valid memory settles entry outright — even when it equals the
        // geometric target, returning it prevents the default-focus redirect
        // below from hijacking a correct re-entry.
        if (this.isEligibleSpatialTarget(remembered) && container.contains(remembered)) {
          return remembered
        }
        if (remembered) this.memory.delete(container)
      }
      const preferred = this.findDefaultFocus(container, cache)
      if (preferred && preferred !== target) return preferred
    }
    return target
  }

  private findDefaultFocus(scope: ParentNode, cache?: NavConfigCache): HTMLElement | null {
    const byAttr = scope.querySelector<HTMLElement>('[data-spatial-autofocus]')
    if (byAttr && this.isEligibleSpatialTarget(byAttr)) return byAttr
    for (const el of this.collectFocusables(scope)) {
      if (readNavConfig(el, cache).defaultFocus) return el
    }
    return null
  }

  private scrollTo(el: HTMLElement): void {
    if (this.scrollBehavior === false || typeof el.scrollIntoView !== 'function') return
    let behavior: ScrollBehavior = this.scrollBehavior
    if (behavior === 'smooth') {
      const view = this.doc.defaultView
      if (view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) behavior = 'instant'
    }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior })
  }
}
