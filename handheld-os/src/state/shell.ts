/**
 * Shell state: the view stack, the overlay layer, the player, and prefs.
 *
 * Explicitly *not* here:
 *  - server data (library, storage, downloads) — that lives in the Query
 *    cache, which is already a store. Copying it here would create a second
 *    source of truth that drifts.
 *  - focus — that lives in the DOM. Per-view focus memory is declared with
 *    `data-spatial-container="remember"` and restored by the engine. A store
 *    copy of "what is focused" desynchronises the moment anything re-renders.
 *
 * What *is* here is state that is synchronous, cross-cutting, and read by
 * components that must not re-render on every query tick.
 */
import { create } from 'zustand'

// ------------------------------------------------------------------ views --

export type ViewId =
  | 'home'
  | 'library'
  | 'game'
  | 'storage'
  | 'files'
  | 'media'
  | 'downloads'
  | 'settings'

/** A view plus the parameters it was pushed with. */
export type ViewEntry =
  | { id: 'home' }
  | { id: 'library' }
  | { id: 'game'; gameId: string }
  | { id: 'storage' }
  | { id: 'files'; driveId?: string }
  | { id: 'media' }
  | { id: 'downloads' }
  | { id: 'settings'; section?: string }

// --------------------------------------------------------------- overlays --

/**
 * Overlays cover the view stack. At most one is interactive at a time — the
 * top of the stack — which is what makes "where does focus containment go?"
 * answerable in one place.
 */
export type Overlay =
  | { kind: 'quick-access'; tab: QuickAccessTab }
  | { kind: 'sheet'; sheet: SheetSpec }
  | { kind: 'confirm'; confirm: ConfirmSpec }

export type QuickAccessTab = 'power' | 'performance' | 'audio' | 'network' | 'notifications'

export interface SheetSpec {
  id: string
  title: string
  /** Which sheet body to render; the view supplies the content. */
  body: 'game-properties' | 'track-queue' | 'file-details' | 'compat-details'
  payload?: Record<string, unknown>
}

export interface ConfirmSpec {
  id: string
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
  /** Resolved by the confirm overlay; the caller awaits it. */
  resolve: (confirmed: boolean) => void
}

// --------------------------------------------------------------- transport --

export interface PlayerState {
  trackId: string | null
  playing: boolean
  positionSec: number
  /** Ordered track ids. The queue is shell state; the tracks are server data. */
  queue: string[]
  shuffle: boolean
  repeat: 'off' | 'all' | 'one'
}

export interface ShellState {
  booted: boolean
  views: ViewEntry[]
  overlays: Overlay[]
  player: PlayerState
  /** Last toast/notification line shown in the status bar. */
  notice: string | null

  boot: () => void
  push: (view: ViewEntry) => void
  pop: () => void
  replace: (view: ViewEntry) => void
  goHome: () => void

  openQuickAccess: (tab?: QuickAccessTab) => void
  setQuickAccessTab: (tab: QuickAccessTab) => void
  openSheet: (sheet: SheetSpec) => void
  confirm: (spec: Omit<ConfirmSpec, 'id' | 'resolve'>) => Promise<boolean>
  closeOverlay: () => void

  playTrack: (trackId: string, queue?: string[]) => void
  togglePlay: () => void
  skip: (delta: number) => void
  seek: (positionSec: number) => void
  setPlayer: (patch: Partial<PlayerState>) => void

  notify: (message: string | null) => void
  /** The single "go back" entry point, wired to spatial:back. */
  back: () => boolean
}

let confirmSeq = 0

export const useShell = create<ShellState>((set, get) => ({
  booted: false,
  views: [{ id: 'home' }],
  overlays: [],
  player: { trackId: null, playing: false, positionSec: 0, queue: [], shuffle: false, repeat: 'off' },
  notice: null,

  boot: () => set({ booted: true }),

  push: (view) => set((s) => ({ views: [...s.views, view] })),
  // Home is the floor: it can never be popped off.
  pop: () => set((s) => (s.views.length > 1 ? { views: s.views.slice(0, -1) } : s)),
  replace: (view) => set((s) => ({ views: [...s.views.slice(0, -1), view] })),
  goHome: () => set({ views: [{ id: 'home' }], overlays: [] }),

  openQuickAccess: (tab = 'performance') =>
    set((s) =>
      s.overlays.some((o) => o.kind === 'quick-access')
        ? s
        : { overlays: [...s.overlays, { kind: 'quick-access', tab }] },
    ),
  setQuickAccessTab: (tab) =>
    set((s) => ({
      overlays: s.overlays.map((o) => (o.kind === 'quick-access' ? { ...o, tab } : o)),
    })),
  openSheet: (sheet) => set((s) => ({ overlays: [...s.overlays, { kind: 'sheet', sheet }] })),

  confirm: (spec) =>
    new Promise<boolean>((resolve) => {
      const id = `confirm-${++confirmSeq}`
      set((s) => ({
        overlays: [...s.overlays, { kind: 'confirm', confirm: { ...spec, id, resolve } }],
      }))
    }),

  closeOverlay: () =>
    set((s) => {
      const top = s.overlays.at(-1)
      // A dismissed confirm must settle its promise, or the caller hangs.
      if (top?.kind === 'confirm') top.confirm.resolve(false)
      return { overlays: s.overlays.slice(0, -1) }
    }),

  playTrack: (trackId, queue) =>
    set((s) => ({
      player: {
        ...s.player,
        trackId,
        playing: true,
        positionSec: 0,
        queue: queue ?? s.player.queue,
      },
    })),
  togglePlay: () => set((s) => ({ player: { ...s.player, playing: !s.player.playing } })),
  skip: (delta) =>
    set((s) => {
      const { queue, trackId } = s.player
      if (queue.length === 0) return s
      const index = trackId ? queue.indexOf(trackId) : -1
      const next = queue[(index + delta + queue.length) % queue.length]
      return { player: { ...s.player, trackId: next ?? trackId, positionSec: 0, playing: true } }
    }),
  seek: (positionSec) => set((s) => ({ player: { ...s.player, positionSec } })),
  setPlayer: (patch) => set((s) => ({ player: { ...s.player, ...patch } })),

  notify: (message) => set({ notice: message }),

  back: () => {
    const { overlays, views, closeOverlay, pop } = get()
    if (overlays.length > 0) {
      closeOverlay()
      return true
    }
    if (views.length > 1) {
      pop()
      return true
    }
    return false // already home with nothing open: let the caller decide
  },
}))

/** The view currently on top of the stack. */
export const currentView = (s: ShellState): ViewEntry => s.views[s.views.length - 1] as ViewEntry

/** The overlay currently receiving input, if any. */
export const activeOverlay = (s: ShellState): Overlay | null => s.overlays.at(-1) ?? null
