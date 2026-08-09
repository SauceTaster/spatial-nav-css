/**
 * Seeded in-memory database behind the mock API.
 *
 * Every value is derived from a fixed seed, so the dev pages and the headless
 * tests see byte-identical data — a test can assert "the third card is
 * Aetherbound" without pinning a snapshot. Mutations apply to this module's
 * state; `resetDb()` restores the seed between tests.
 */

/** mulberry32 — small, fast, deterministic. No Math.random anywhere. */
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

const pick = <T>(rand: () => number, items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)]!

// ---------------------------------------------------------------- games ----

export interface Game {
  id: string
  title: string
  developer: string
  genres: string[]
  installed: boolean
  sizeGB: number
  playtimeHours: number
  lastPlayed: string | null
  hue: number
  favorite: boolean
}

const TITLE_A = [
  'Aetherbound', 'Nightfall', 'Ironvale', 'Starforge', 'Ember', 'Halcyon',
  'Voidrunner', 'Sunderfall', 'Cobalt', 'Wraithwood', 'Zenith', 'Drifter',
  'Ashen', 'Lumen', 'Rampart', 'Glasshouse', 'Tidebreak', 'Foxglove',
]
const TITLE_B = [
  'Protocol', 'Odyssey', 'Chronicles', 'Reckoning', 'Horizon', 'Directive',
  'Sanctum', 'Legacy', 'Uprising', 'Dominion', 'Requiem', 'Ascent',
]
const STUDIOS = [
  'Northlight Studios', 'Paper Lantern', 'Vermilion Works', 'Hollowpoint',
  'Blue Marble Interactive', 'Foundry 9', 'Tessellate Games',
]
const GENRES = ['Action', 'RPG', 'Strategy', 'Roguelike', 'Simulation', 'Puzzle', 'Racing', 'Co-op']

function seedGames(count = 48): Game[] {
  const rand = prng(0x5eed)
  const seen = new Set<string>()
  const games: Game[] = []
  for (let i = 0; i < count; i++) {
    let title = `${pick(rand, TITLE_A)} ${pick(rand, TITLE_B)}`
    while (seen.has(title)) title = `${pick(rand, TITLE_A)} ${pick(rand, TITLE_B)} ${seen.size}`
    seen.add(title)
    const installed = rand() > 0.45
    const playtimeHours = Math.round(rand() * 120)
    games.push({
      id: `game-${i + 1}`,
      title,
      developer: pick(rand, STUDIOS),
      genres: [pick(rand, GENRES), pick(rand, GENRES)].filter((g, j, a) => a.indexOf(g) === j),
      installed,
      sizeGB: Math.round(rand() * 90) + 2,
      playtimeHours,
      // Fixed epoch base so dates never drift with the wall clock.
      lastPlayed: playtimeHours > 0 ? new Date(1767225600000 - i * 86400000).toISOString() : null,
      hue: Math.floor(rand() * 360),
      favorite: rand() > 0.8,
    })
  }
  return games
}

// ---------------------------------------------------------------- media ----

export interface MediaLibrary {
  id: string
  name: string
  kind: 'movies' | 'shows' | 'music' | 'photos'
  itemCount: number
  sizeGB: number
  scanning: boolean
}

export interface StreamSession {
  id: string
  user: string
  title: string
  device: string
  quality: string
  transcoding: boolean
  progress: number
  bandwidthMbps: number
}

export interface MediaUser {
  id: string
  name: string
  email: string
  role: 'admin' | 'user' | 'guest'
  active: boolean
  lastSeen: string
}

export interface Channel {
  id: string
  number: number
  name: string
  category: string
}

export interface Programme {
  id: string
  channelId: string
  title: string
  /** Minutes from the guide's start-of-day origin. */
  startMin: number
  durationMin: number
  category: string
  isLive: boolean
}

function seedLibraries(): MediaLibrary[] {
  return [
    { id: 'lib-movies', name: 'Movies', kind: 'movies', itemCount: 1284, sizeGB: 4210, scanning: false },
    { id: 'lib-shows', name: 'TV Shows', kind: 'shows', itemCount: 8931, sizeGB: 9877, scanning: true },
    { id: 'lib-music', name: 'Music', kind: 'music', itemCount: 24310, sizeGB: 612, scanning: false },
    { id: 'lib-photos', name: 'Photos', kind: 'photos', itemCount: 51204, sizeGB: 1843, scanning: false },
  ]
}

function seedSessions(): StreamSession[] {
  const rand = prng(0xb0a7)
  const users = ['ada', 'grace', 'linus', 'margaret', 'alan']
  const devices = ['Living Room TV', 'iPad', 'Chrome / macOS', 'Shield TV', 'Steam Deck']
  const titles = ['Arrival', 'Blade Runner 2049', 'The Expanse S3E5', 'Chef’s Table', 'Interstellar']
  return Array.from({ length: 5 }, (_, i) => ({
    id: `session-${i + 1}`,
    user: users[i]!,
    title: titles[i]!,
    device: devices[i]!,
    quality: pick(rand, ['4K HDR', '1080p', '720p']),
    transcoding: rand() > 0.5,
    progress: Math.round(rand() * 100),
    bandwidthMbps: Math.round(rand() * 60) + 4,
  }))
}

function seedMediaUsers(): MediaUser[] {
  const names = ['Ada Lovelace', 'Grace Hopper', 'Linus Torvalds', 'Margaret Hamilton', 'Alan Turing', 'Radia Perlman']
  const roles: MediaUser['role'][] = ['admin', 'user', 'user', 'admin', 'guest', 'user']
  return names.map((name, i) => ({
    id: `user-${i + 1}`,
    name,
    email: `${name.split(' ')[0]!.toLowerCase()}@example.test`,
    role: roles[i]!,
    active: i !== 4,
    lastSeen: new Date(1767225600000 - i * 3600000).toISOString(),
  }))
}

const CHANNEL_NAMES = [
  'Aurora One', 'Aurora Two', 'Meridian', 'Cinema Prime', 'Cinema Classics',
  'Docuscope', 'Kids Zone', 'Sportsnet', 'Sportsnet Extra', 'Newsline',
  'Retro TV', 'Music Box', 'Nature HD', 'Comedy Central Station', 'Late Night',
]
const PROGRAMME_TITLES = [
  'Morning Report', 'Market Watch', 'The Long Haul', 'Deep Field', 'Kitchen Rules',
  'Frontier', 'Night Shift', 'Wildlands', 'The Interview', 'Replay', 'Encore',
  'Headlines', 'Documentary Hour', 'Feature Presentation', 'Highlights',
]

function seedChannels(): Channel[] {
  const rand = prng(0xc4a9)
  return CHANNEL_NAMES.map((name, i) => ({
    id: `channel-${i + 1}`,
    number: 100 + i,
    name,
    category: pick(rand, ['Entertainment', 'Movies', 'Sports', 'News', 'Kids', 'Music']),
  }))
}

function seedProgrammes(channels: Channel[]): Programme[] {
  const rand = prng(0x9e11)
  const out: Programme[] = []
  for (const channel of channels) {
    let startMin = 0
    let index = 0
    // 24 hours of guide data per channel, in 30-minute multiples.
    while (startMin < 24 * 60) {
      const durationMin = pick(rand, [30, 30, 60, 60, 90, 120])
      out.push({
        id: `${channel.id}-p${index}`,
        channelId: channel.id,
        title: pick(rand, PROGRAMME_TITLES),
        startMin,
        durationMin: Math.min(durationMin, 24 * 60 - startMin),
        category: channel.category,
        isLive: rand() > 0.85,
      })
      startMin += durationMin
      index++
    }
  }
  return out
}

// --------------------------------------------------------------- system ----

export interface ServiceStatus {
  id: string
  name: string
  state: 'running' | 'stopped' | 'degraded'
  uptimeHours: number
  cpuPercent: number
  memoryMB: number
  autostart: boolean
}

export interface StoragePool {
  id: string
  name: string
  filesystem: string
  totalGB: number
  usedGB: number
  health: 'healthy' | 'degraded' | 'rebuilding'
  disks: number
}

export interface SystemSettings {
  hostname: string
  timezone: string
  sshPort: number
  sshPasswordAuth: boolean
  automaticUpdates: boolean
  updateChannel: 'stable' | 'beta' | 'nightly'
  telemetry: boolean
  logLevel: 'error' | 'warn' | 'info' | 'debug'
  maxUploadMB: number
  transcodeThreads: number
  remoteAccess: boolean
  motd: string
}

export interface LogEntry {
  id: string
  at: string
  level: 'error' | 'warn' | 'info'
  service: string
  message: string
}

function seedServices(): ServiceStatus[] {
  const rand = prng(0x5e12)
  const names = ['nginx', 'postgres', 'redis', 'transcoder', 'scheduler', 'backup-agent', 'metrics-collector']
  return names.map((name, i) => ({
    id: `svc-${i + 1}`,
    name,
    state: i === 5 ? 'stopped' : i === 3 ? 'degraded' : 'running',
    uptimeHours: Math.round(rand() * 900),
    cpuPercent: Math.round(rand() * 40 * 10) / 10,
    memoryMB: Math.round(rand() * 2048) + 64,
    autostart: i !== 5,
  }))
}

function seedPools(): StoragePool[] {
  return [
    { id: 'pool-1', name: 'tank', filesystem: 'zfs', totalGB: 16000, usedGB: 11240, health: 'healthy', disks: 8 },
    { id: 'pool-2', name: 'fast', filesystem: 'ext4', totalGB: 2000, usedGB: 830, health: 'healthy', disks: 2 },
    { id: 'pool-3', name: 'archive', filesystem: 'btrfs', totalGB: 32000, usedGB: 29500, health: 'degraded', disks: 12 },
  ]
}

function defaultSettings(): SystemSettings {
  return {
    hostname: 'mediavault',
    timezone: 'UTC',
    sshPort: 22,
    sshPasswordAuth: false,
    automaticUpdates: true,
    updateChannel: 'stable',
    telemetry: false,
    logLevel: 'info',
    maxUploadMB: 512,
    transcodeThreads: 4,
    remoteAccess: true,
    motd: 'Authorized access only.',
  }
}

function seedLogs(): LogEntry[] {
  const rand = prng(0x10c5)
  const services = ['nginx', 'postgres', 'transcoder', 'scheduler']
  const messages = [
    'connection established', 'slow query detected', 'job finished in 4.2s',
    'retrying upstream', 'cache warm complete', 'disk latency spike',
  ]
  return Array.from({ length: 40 }, (_, i) => ({
    id: `log-${i + 1}`,
    at: new Date(1767225600000 - i * 60000).toISOString(),
    level: (rand() > 0.85 ? 'error' : rand() > 0.6 ? 'warn' : 'info') as LogEntry['level'],
    service: pick(rand, services),
    message: pick(rand, messages),
  }))
}

export interface MetricPoint {
  t: number
  cpu: number
  memory: number
  networkMbps: number
}

function seedMetrics(): MetricPoint[] {
  const rand = prng(0x4e11)
  return Array.from({ length: 48 }, (_, i) => ({
    t: i,
    cpu: Math.round((30 + Math.sin(i / 4) * 18 + rand() * 8) * 10) / 10,
    memory: Math.round((55 + Math.cos(i / 6) * 10 + rand() * 5) * 10) / 10,
    networkMbps: Math.round((120 + Math.sin(i / 3) * 60 + rand() * 30) * 10) / 10,
  }))
}

// ------------------------------------------------------------------ db -----

export interface Db {
  games: Game[]
  libraries: MediaLibrary[]
  sessions: StreamSession[]
  mediaUsers: MediaUser[]
  channels: Channel[]
  programmes: Programme[]
  services: ServiceStatus[]
  pools: StoragePool[]
  settings: SystemSettings
  logs: LogEntry[]
  metrics: MetricPoint[]
}

function build(): Db {
  const channels = seedChannels()
  return {
    games: seedGames(),
    libraries: seedLibraries(),
    sessions: seedSessions(),
    mediaUsers: seedMediaUsers(),
    channels,
    programmes: seedProgrammes(channels),
    services: seedServices(),
    pools: seedPools(),
    settings: defaultSettings(),
    logs: seedLogs(),
    metrics: seedMetrics(),
  }
}

export let db: Db = build()

/** Restore the seeded state. Call between tests. */
export function resetDb(): void {
  db = build()
}
