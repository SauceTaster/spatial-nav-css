import type { AdapterContext, InputAdapter, NavIntent } from './types'

/**
 * Owns the set of input adapters and routes their intents to a single
 * handler. Adapters added while running are started immediately.
 */
export class InputManager {
  private readonly adapters = new Set<InputAdapter>()
  private readonly activeAdapters = new Set<InputAdapter>()
  private readonly context: AdapterContext
  private running = false
  private desiredRunning = false
  private transitioning = false
  private destroying = false

  constructor(handler: (intent: NavIntent) => boolean, win?: Window) {
    const resolvedWindow = win ?? (typeof window !== 'undefined' ? window : null)
    if (!resolvedWindow) {
      throw new Error('InputManager requires a browser Window; pass one explicitly')
    }
    this.context = {
      window: resolvedWindow,
      dispatch: (intent) => handler(intent),
    }
  }

  add(adapter: InputAdapter): void {
    if (this.adapters.has(adapter)) return
    this.adapters.add(adapter)
    if (!this.running || !this.desiredRunning) return
    this.runExclusive(() => {
      this.activeAdapters.add(adapter)
      try {
        adapter.start(this.context)
      } catch (error) {
        this.activeAdapters.delete(adapter)
        this.adapters.delete(adapter)
        try {
          adapter.stop()
        } catch {
          // Preserve the start failure; stop is best-effort rollback here.
        }
        throw error
      }
    })
  }

  remove(adapter: InputAdapter): void {
    if (!this.adapters.delete(adapter)) return
    if (this.activeAdapters.delete(adapter)) {
      this.runExclusive(() => adapter.stop())
    }
  }

  start(): void {
    if (this.destroying) return
    this.desiredRunning = true
    this.reconcile()
  }

  stop(): void {
    this.desiredRunning = false
    this.reconcile()
  }

  private reconcile(): void {
    if (this.transitioning) return
    this.transitioning = true

    let firstError: unknown
    try {
      while (this.running !== this.desiredRunning) {
        if (this.desiredRunning) {
          try {
            this.startAdapters()
          } catch (error) {
            firstError ??= error
            // A failed start is terminal for this request. In particular, do
            // not loop forever if a rollback stop hook requested a restart.
            this.desiredRunning = false
          }
        } else {
          try {
            this.stopAdapters()
          } catch (error) {
            firstError ??= error
          }
        }
      }
    } finally {
      this.transitioning = false
    }

    if (firstError) throw firstError
  }

  private startAdapters(): void {
    this.running = true
    // Snapshot so an adapter added from another adapter's start hook is not
    // started once by add() and then a second time by live Set iteration.
    for (const adapter of [...this.adapters]) {
      if (!this.desiredRunning) return
      if (!this.adapters.has(adapter)) continue // removed by an earlier start hook
      if (this.activeAdapters.has(adapter)) continue // started by an earlier start hook
      this.activeAdapters.add(adapter)
      try {
        adapter.start(this.context)
      } catch (error) {
        this.running = false
        const active = [...this.activeAdapters]
        this.activeAdapters.clear()
        for (const started of active.reverse()) {
          try {
            started.stop()
          } catch {
            // Preserve the original start failure.
          }
        }
        throw error
      }
    }
  }

  private stopAdapters(): void {
    this.running = false
    const active = [...this.activeAdapters]
    this.activeAdapters.clear()
    let firstError: unknown
    for (const adapter of active) {
      try {
        adapter.stop()
      } catch (error) {
        firstError ??= error
      }
    }
    if (firstError) throw firstError
  }

  /**
   * Keep adapter hooks from synchronously starting or stopping other adapters
   * while the current hook is still unwinding. The outermost operation applies
   * the last requested running state once the hook completes.
   */
  private runExclusive(callback: () => void): void {
    if (this.transitioning) {
      callback()
      return
    }

    this.transitioning = true
    let firstError: unknown
    try {
      callback()
    } catch (error) {
      firstError = error
    } finally {
      this.transitioning = false
    }

    try {
      this.reconcile()
    } catch (error) {
      firstError ??= error
    }

    if (firstError) throw firstError
  }

  destroy(): void {
    if (this.destroying) return
    this.destroying = true
    this.desiredRunning = false
    try {
      this.reconcile()
    } finally {
      this.adapters.clear()
      this.activeAdapters.clear()
      this.running = false
      this.desiredRunning = false
      this.destroying = false
    }
  }
}
