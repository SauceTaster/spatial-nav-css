/**
 * MSW request handlers — the examples' "backend".
 *
 * Mocking at the fetch boundary (rather than stubbing hooks or passing props)
 * is what makes these examples realistic: components go through a real
 * loading → success → refetch lifecycle, TanStack Query caches and
 * invalidates for real, and the same handlers serve both the dev pages
 * (service worker) and the headless tests (node interceptors).
 */
import { HttpResponse, delay, http } from 'msw'
import { db, type Game, type SystemSettings } from './db'

/** Base path all example endpoints hang off. */
export const API = '/api'

/**
 * Latency profile. Tests set 0 so queries resolve on the first flush;
 * the dev pages keep a small delay so skeleton states are actually visible.
 */
export const latency = { ms: 120 }
export function setLatency(ms: number): void {
  latency.ms = ms
}

/** Flip to make the next matching request fail, for error-state demos. */
export const failures = new Set<string>()
export function failNext(route: string): void {
  failures.add(route)
}
function shouldFail(route: string): boolean {
  if (!failures.has(route)) return false
  failures.delete(route)
  return true
}

async function respond<T>(route: string, body: T): Promise<Response> {
  if (latency.ms > 0) await delay(latency.ms)
  if (shouldFail(route)) {
    return HttpResponse.json({ error: `${route} is unavailable` }, { status: 503 })
  }
  return HttpResponse.json(body as never)
}

const num = (url: URL, key: string, fallback: number): number => {
  const raw = url.searchParams.get(key)
  const parsed = raw === null ? Number.NaN : Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const handlers = [
  // ------------------------------------------------------------- games ----
  http.get(`${API}/games`, async ({ request }) => {
    const url = new URL(request.url)
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase()
    const genre = url.searchParams.get('genre') ?? ''
    const filter = url.searchParams.get('filter') ?? 'all'
    const sort = url.searchParams.get('sort') ?? 'title'
    const page = num(url, 'page', 0)
    const pageSize = num(url, 'pageSize', 0)

    let items = db.games.filter((game) => {
      if (search && !game.title.toLowerCase().includes(search)) return false
      if (genre && !game.genres.includes(genre)) return false
      if (filter === 'installed' && !game.installed) return false
      if (filter === 'favorites' && !game.favorite) return false
      return true
    })
    items = [...items].sort((a, b) =>
      sort === 'playtime'
        ? b.playtimeHours - a.playtimeHours
        : sort === 'size'
          ? b.sizeGB - a.sizeGB
          : a.title.localeCompare(b.title),
    )
    const total = items.length
    if (pageSize > 0) items = items.slice(page * pageSize, page * pageSize + pageSize)
    return respond('games', { items, total, page, pageSize })
  }),

  http.get(`${API}/games/:id`, async ({ params }) => {
    const game = db.games.find((g) => g.id === params.id)
    if (!game) return HttpResponse.json({ error: 'not found' }, { status: 404 })
    return respond('game', game)
  }),

  http.post(`${API}/games/:id/install`, async ({ params }) => {
    const game = db.games.find((g) => g.id === params.id)
    if (!game) return HttpResponse.json({ error: 'not found' }, { status: 404 })
    game.installed = true
    return respond('install', game)
  }),

  http.delete(`${API}/games/:id/install`, async ({ params }) => {
    const game = db.games.find((g) => g.id === params.id)
    if (!game) return HttpResponse.json({ error: 'not found' }, { status: 404 })
    game.installed = false
    return respond('uninstall', game)
  }),

  http.post(`${API}/games/:id/favorite`, async ({ params, request }) => {
    const game = db.games.find((g) => g.id === params.id)
    if (!game) return HttpResponse.json({ error: 'not found' }, { status: 404 })
    const body = (await request.json()) as Partial<Game>
    game.favorite = Boolean(body.favorite)
    return respond('favorite', game)
  }),

  // ------------------------------------------------------------- media ----
  http.get(`${API}/libraries`, async () => respond('libraries', { items: db.libraries })),

  http.post(`${API}/libraries/:id/scan`, async ({ params }) => {
    const library = db.libraries.find((l) => l.id === params.id)
    if (!library) return HttpResponse.json({ error: 'not found' }, { status: 404 })
    library.scanning = true
    return respond('scan', library)
  }),

  http.get(`${API}/sessions`, async () => respond('sessions', { items: db.sessions })),

  http.delete(`${API}/sessions/:id`, async ({ params }) => {
    const index = db.sessions.findIndex((s) => s.id === params.id)
    if (index === -1) return HttpResponse.json({ error: 'not found' }, { status: 404 })
    const [removed] = db.sessions.splice(index, 1)
    return respond('session-stop', removed)
  }),

  http.get(`${API}/media-users`, async () => respond('media-users', { items: db.mediaUsers })),

  http.patch(`${API}/media-users/:id`, async ({ params, request }) => {
    const user = db.mediaUsers.find((u) => u.id === params.id)
    if (!user) return HttpResponse.json({ error: 'not found' }, { status: 404 })
    Object.assign(user, await request.json())
    return respond('media-user-update', user)
  }),

  // --------------------------------------------------------------- epg ----
  http.get(`${API}/channels`, async () => respond('channels', { items: db.channels })),

  http.get(`${API}/programmes`, async ({ request }) => {
    const url = new URL(request.url)
    const from = num(url, 'from', 0)
    const to = num(url, 'to', 24 * 60)
    const items = db.programmes.filter((p) => p.startMin + p.durationMin > from && p.startMin < to)
    return respond('programmes', { items, from, to })
  }),

  // ------------------------------------------------------------ system ----
  http.get(`${API}/services`, async () => respond('services', { items: db.services })),

  http.post(`${API}/services/:id/:action`, async ({ params }) => {
    const service = db.services.find((s) => s.id === params.id)
    if (!service) return HttpResponse.json({ error: 'not found' }, { status: 404 })
    if (params.action === 'start') service.state = 'running'
    if (params.action === 'stop') service.state = 'stopped'
    if (params.action === 'restart') service.state = 'running'
    return respond('service-action', service)
  }),

  http.get(`${API}/storage`, async () => respond('storage', { items: db.pools })),

  http.get(`${API}/settings`, async () => respond('settings', db.settings)),

  http.put(`${API}/settings`, async ({ request }) => {
    const patch = (await request.json()) as Partial<SystemSettings>
    if (typeof patch.sshPort === 'number' && (patch.sshPort < 1 || patch.sshPort > 65535)) {
      return HttpResponse.json({ error: 'sshPort out of range', field: 'sshPort' }, { status: 422 })
    }
    db.settings = { ...db.settings, ...patch }
    return respond('settings-save', db.settings)
  }),

  http.get(`${API}/logs`, async ({ request }) => {
    const url = new URL(request.url)
    const level = url.searchParams.get('level')
    const items = level ? db.logs.filter((l) => l.level === level) : db.logs
    return respond('logs', { items })
  }),

  http.get(`${API}/metrics`, async () => respond('metrics', { items: db.metrics })),
]
