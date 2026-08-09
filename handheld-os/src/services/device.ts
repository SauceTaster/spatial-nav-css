/**
 * The device's seeded state: what is installed, what is downloading, what is
 * on disk, what is playing.
 *
 * Everything derives from a fixed seed so a screenshot, a Storybook story and
 * a test all describe the same machine. `resetDevice()` restores it.
 */

function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(rand: () => number, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!

// ------------------------------------------------------------------ games --

export type InstallState = 'installed' | 'not-installed' | 'downloading' | 'queued' | 'paused'

export interface Game {
  id: string
  title: string
  /** Sort key: title without a leading article, upper-cased. */
  sortKey: string
  developer: string
  genres: string[]
  install: InstallState
  sizeBytes: number
  playedMinutes: number
  lastPlayed: number | null
  /** Verified / playable / unsupported, as a handheld compatibility rating. */
  compat: 'verified' | 'playable' | 'unsupported' | 'unknown'
  hue: number
  favorite: boolean
  hasCloudSave: boolean
  achievements: { earned: number; total: number }
}

const WORD_A = [
  'Aether', 'Nightfall', 'Iron', 'Star', 'Ember', 'Halcyon', 'Void', 'Sunder',
  'Cobalt', 'Wraith', 'Zenith', 'Drift', 'Ashen', 'Lumen', 'Rampart', 'Glass',
  'Tide', 'Foxglove', 'Onyx', 'Quill', 'Vesper', 'Kestrel', 'Bram', 'Yarrow',
]
const WORD_B = [
  'bound', 'fall', 'vale', 'forge', 'light', 'reach', 'runner', 'spire',
  'wake', 'mark', 'song', 'gate', 'hollow', 'crest', 'watch', 'ward',
]
const SUFFIX = [
  '', '', '', '', ' II', ' Remastered', ': Directors Cut', ' Origins',
  ': Reckoning', ' Chronicles', ' Redux',
]
const STUDIOS = [
  'Northlight Studios', 'Paper Lantern', 'Vermilion Works', 'Hollowpoint',
  'Blue Marble Interactive', 'Foundry 9', 'Tessellate', 'Kettle & Bone',
]
const GENRES = [
  'Action', 'RPG', 'Strategy', 'Roguelike', 'Simulation', 'Puzzle', 'Racing',
  'Co-op', 'Metroidvania', 'Souls-like', 'Shooter', 'Farming',
]
const GB = 1024 ** 3

/** Drop a leading article so "The Long Haul" files under L, as stores do. */
export function sortKeyFor(title: string): string {
  return title.replace(/^(the|a|an)\s+/i, '').toUpperCase()
}

function seedGames(count: number): Game[] {
  const rand = prng(0x5eed_1337)
  const seen = new Set<string>()
  const games: Game[] = []
  for (let i = 0; i < count; i++) {
    let title = `${pick(rand, WORD_A)}${pick(rand, WORD_B)}${pick(rand, SUFFIX)}`
    if (rand() > 0.85) title = `The ${title}`
    while (seen.has(title)) title = `${title} ${seen.size}`
    seen.add(title)

    const installed = rand() > 0.55
    const playedMinutes = installed ? Math.round(rand() * 6000) : Math.round(rand() * 400)
    const total = 10 + Math.floor(rand() * 60)
    games.push({
      id: `game-${i + 1}`,
      title,
      sortKey: sortKeyFor(title),
      developer: pick(rand, STUDIOS),
      genres: [...new Set([pick(rand, GENRES), pick(rand, GENRES)])],
      install: installed ? 'installed' : 'not-installed',
      sizeBytes: Math.round((0.4 + rand() * 90) * GB),
      playedMinutes,
      // Fixed epoch base: dates must not drift with the wall clock.
      lastPlayed: playedMinutes > 0 ? 1767225600000 - i * 43200000 : null,
      compat: pick(rand, ['verified', 'verified', 'playable', 'unsupported', 'unknown'] as const),
      hue: Math.floor(rand() * 360),
      favorite: rand() > 0.88,
      hasCloudSave: rand() > 0.35,
      achievements: { earned: Math.floor(rand() * total), total },
    })
  }
  return games.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
}

// -------------------------------------------------------------- downloads --

export interface DownloadJob {
  id: string
  gameId: string
  title: string
  state: 'downloading' | 'queued' | 'paused' | 'done' | 'failed'
  totalBytes: number
  doneBytes: number
  bytesPerSecond: number
  kind: 'install' | 'update' | 'shader'
  queuedAt: number
}

function seedDownloads(games: Game[]): DownloadJob[] {
  const rand = prng(0xd0_0d)
  const pool = games.filter((g) => g.install === 'not-installed').slice(0, 14)
  return pool.map((game, i) => {
    const state: DownloadJob['state'] =
      i === 0 ? 'downloading' : i < 3 ? 'queued' : i === 3 ? 'paused' : i < 9 ? 'done' : 'queued'
    const totalBytes = game.sizeBytes
    return {
      id: `job-${i + 1}`,
      gameId: game.id,
      title: game.title,
      state,
      totalBytes,
      doneBytes:
        state === 'done' ? totalBytes : state === 'queued' ? 0 : Math.round(totalBytes * rand()),
      bytesPerSecond: state === 'downloading' ? 38_000_000 : 0,
      kind: pick(rand, ['install', 'install', 'update', 'shader'] as const),
      queuedAt: 1767225600000 - i * 900000,
    }
  })
}

// ---------------------------------------------------------------- storage --

/** A node in the on-disk tree. Directories carry children; files do not. */
export interface FsNode {
  id: string
  name: string
  kind: 'dir' | 'file'
  /** Own size for files; for directories the sum of descendants. */
  sizeBytes: number
  children?: FsNode[]
  /** Set when this node corresponds to an installed game. */
  gameId?: string
}

export interface Drive {
  id: string
  label: string
  kind: 'internal' | 'sd' | 'usb'
  totalBytes: number
  root: FsNode
}

const FILE_LEAVES = [
  ['pak0.vpk', 4.2], ['pak1.vpk', 12.5], ['textures_hi.pak', 22.0], ['audio_en.pak', 3.1],
  ['shaders.cache', 1.4], ['engine.bin', 0.6], ['movies.pak', 8.8], ['levels.pak', 6.3],
] as const

function seedDrives(games: Game[]): Drive[] {
  const rand = prng(0xd_1_5c)
  const installed = games.filter((g) => g.install === 'installed')

  const gameDir = (game: Game): FsNode => {
    // Split the game's size across a plausible set of asset files so the
    // treemap has real, uneven leaves to lay out.
    const chosen = FILE_LEAVES.filter(() => rand() > 0.25)
    const leaves = (chosen.length > 0 ? chosen : FILE_LEAVES.slice(0, 3)).map(([name, weight], i) => ({
      name,
      weight: weight * (0.6 + rand() * 0.8),
      i,
    }))
    const weightTotal = leaves.reduce((sum, l) => sum + l.weight, 0)
    const children: FsNode[] = leaves.map((leaf) => ({
      id: `${game.id}-f${leaf.i}`,
      name: leaf.name,
      kind: 'file',
      sizeBytes: Math.round((leaf.weight / weightTotal) * game.sizeBytes),
    }))
    return {
      id: `dir-${game.id}`,
      name: game.title,
      kind: 'dir',
      gameId: game.id,
      sizeBytes: children.reduce((sum, c) => sum + c.sizeBytes, 0),
      children,
    }
  }

  const onInternal = installed.slice(0, Math.ceil(installed.length * 0.7))
  const onCard = installed.slice(Math.ceil(installed.length * 0.7))

  const system: FsNode = {
    id: 'dir-system',
    name: 'System',
    kind: 'dir',
    sizeBytes: 0,
    children: [
      { id: 'sys-os', name: 'os.img', kind: 'file', sizeBytes: 9 * GB },
      { id: 'sys-fw', name: 'firmware', kind: 'file', sizeBytes: 1.2 * GB },
      { id: 'sys-log', name: 'logs', kind: 'file', sizeBytes: 0.3 * GB },
    ],
  }
  system.sizeBytes = system.children!.reduce((s, c) => s + c.sizeBytes, 0)

  const buildRoot = (id: string, name: string, dirs: FsNode[], extra: FsNode[] = []): FsNode => {
    const children = [...extra, { id: `${id}-steamapps`, name: 'steamapps', kind: 'dir' as const, sizeBytes: dirs.reduce((s, d) => s + d.sizeBytes, 0), children: dirs }]
    return {
      id,
      name,
      kind: 'dir',
      sizeBytes: children.reduce((s, c) => s + c.sizeBytes, 0),
      children,
    }
  }

  return [
    {
      id: 'drive-internal',
      label: 'Internal 1 TB',
      kind: 'internal',
      totalBytes: 1024 * GB,
      root: buildRoot('root-internal', '/', onInternal.map(gameDir), [system]),
    },
    {
      id: 'drive-sd',
      label: 'microSD 512 GB',
      kind: 'sd',
      totalBytes: 512 * GB,
      root: buildRoot('root-sd', '/run/media/sd', onCard.map(gameDir)),
    },
  ]
}

// ------------------------------------------------------------------ media --

export interface Track {
  id: string
  title: string
  artist: string
  album: string
  durationSec: number
  trackNo: number
}

const ALBUMS = [
  { album: 'Signal Bloom', artist: 'Kestrel Wave', tracks: 9 },
  { album: 'Long Dark Drive', artist: 'Nocturne Fleet', tracks: 7 },
  { album: 'Paper Cities', artist: 'Ada Vance', tracks: 11 },
  { album: 'Rustline', artist: 'The Ironsmiths', tracks: 8 },
]
const TRACK_WORDS = [
  'Ashes', 'Lantern', 'Meridian', 'Static', 'Harbour', 'Glasswork', 'Tundra',
  'Afterglow', 'Copperline', 'Sunder', 'Nightjar', 'Ravine', 'Hollow',
]

function seedTracks(): Track[] {
  const rand = prng(0x7_4_a_c)
  const out: Track[] = []
  for (const entry of ALBUMS) {
    for (let n = 1; n <= entry.tracks; n++) {
      out.push({
        id: `${entry.album.replace(/\s+/g, '-').toLowerCase()}-${n}`,
        title: `${pick(rand, TRACK_WORDS)} ${pick(rand, TRACK_WORDS)}`.replace(/(\w+) \1/, '$1'),
        artist: entry.artist,
        album: entry.album,
        durationSec: 110 + Math.floor(rand() * 220),
        trackNo: n,
      })
    }
  }
  return out
}

// ----------------------------------------------------------------- system --

export interface DeviceSettings {
  deviceName: string
  performanceOverlay: 'off' | 'fps' | 'detailed'
  frameLimit: 30 | 40 | 60 | 90 | 0
  refreshHz: 60 | 90
  tdpWatts: number
  brightness: number
  colorProfile: 'native' | 'vivid' | 'calibrated'
  wifi: boolean
  bluetooth: boolean
  airplane: boolean
  autoUpdates: boolean
  updateChannel: 'stable' | 'beta' | 'preview'
  developerMode: boolean
  hapticStrength: number
  volume: number
}

function defaultSettings(): DeviceSettings {
  return {
    deviceName: 'handheld-01',
    performanceOverlay: 'fps',
    frameLimit: 60,
    refreshHz: 90,
    tdpWatts: 12,
    brightness: 72,
    colorProfile: 'native',
    wifi: true,
    bluetooth: true,
    airplane: false,
    autoUpdates: true,
    updateChannel: 'stable',
    developerMode: false,
    hapticStrength: 60,
    volume: 45,
  }
}

export interface Device {
  games: Game[]
  downloads: DownloadJob[]
  drives: Drive[]
  tracks: Track[]
  settings: DeviceSettings
  battery: { percent: number; charging: boolean; wattage: number }
}

function build(): Device {
  const games = seedGames(420)
  return {
    games,
    downloads: seedDownloads(games),
    drives: seedDrives(games),
    tracks: seedTracks(),
    settings: defaultSettings(),
    battery: { percent: 63, charging: false, wattage: 11.4 },
  }
}

export let device: Device = build()

export function resetDevice(): void {
  device = build()
}

/** Depth-first walk, parents before children. */
export function walkFs(node: FsNode, visit: (node: FsNode, depth: number) => void, depth = 0): void {
  visit(node, depth)
  for (const child of node.children ?? []) walkFs(child, visit, depth + 1)
}

export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(bytes >= 10 * GB ? 0 : 1)} GB`
  const mb = bytes / 1024 ** 2
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
}

export function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  return `${Math.round(minutes / 60)} hrs`
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
