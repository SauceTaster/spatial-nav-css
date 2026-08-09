/**
 * The device's "system services", behind MSW.
 *
 * Mocking at the fetch boundary is what makes this feel like an OS rather than
 * a mockup: views go through real loading and refetch, downloads actually
 * progress, and the same handlers serve the app, Storybook and the tests.
 */
import { HttpResponse, delay, http } from 'msw'
import { device, type DeviceSettings, type DownloadJob } from './device'

export const API = '/os'

export const latency = { ms: 90 }
export function setLatency(ms: number): void {
  latency.ms = ms
}

async function ok<T>(body: T): Promise<Response> {
  if (latency.ms > 0) await delay(latency.ms)
  return HttpResponse.json(body as never)
}

const num = (url: URL, key: string, fallback: number): number => {
  const raw = Number(url.searchParams.get(key))
  return Number.isFinite(raw) ? raw : fallback
}

/**
 * Advance every active download by `seconds` of wall time. The app ticks this
 * so progress is driven by one authority rather than by each component's own
 * timer, which is also what makes it deterministic under test.
 */
export function advanceDownloads(seconds: number): void {
  for (const job of device.downloads) {
    if (job.state !== 'downloading') continue
    job.doneBytes = Math.min(job.totalBytes, job.doneBytes + job.bytesPerSecond * seconds)
    if (job.doneBytes >= job.totalBytes) {
      job.state = 'done'
      job.bytesPerSecond = 0
      const game = device.games.find((g) => g.id === job.gameId)
      if (game) game.install = 'installed'
      // Promote the next queued job, the way a real download manager would.
      const next = device.downloads.find((j) => j.state === 'queued')
      if (next) {
        next.state = 'downloading'
        next.bytesPerSecond = 38_000_000
      }
    }
  }
}

export const handlers = [
  http.get(`${API}/games`, async ({ request }) => {
    const url = new URL(request.url)
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase()
    const installed = url.searchParams.get('installed')
    const genre = url.searchParams.get('genre') ?? ''
    const compat = url.searchParams.get('compat') ?? ''
    const sort = url.searchParams.get('sort') ?? 'alpha'

    let items = device.games.filter((game) => {
      if (search && !game.title.toLowerCase().includes(search)) return false
      if (installed === 'true' && game.install !== 'installed') return false
      if (genre && !game.genres.includes(genre)) return false
      if (compat && game.compat !== compat) return false
      return true
    })
    items = [...items].sort((a, b) =>
      sort === 'recent'
        ? (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0)
        : sort === 'played'
          ? b.playedMinutes - a.playedMinutes
          : sort === 'size'
            ? b.sizeBytes - a.sizeBytes
            : a.sortKey.localeCompare(b.sortKey),
    )
    return ok({ items, total: items.length, sort })
  }),

  http.get(`${API}/games/:id`, async ({ params }) => {
    const game = device.games.find((g) => g.id === params.id)
    if (!game) return HttpResponse.json({ error: 'not found' }, { status: 404 })
    return ok(game)
  }),

  http.post(`${API}/games/:id/favorite`, async ({ params }) => {
    const game = device.games.find((g) => g.id === params.id)
    if (!game) return HttpResponse.json({ error: 'not found' }, { status: 404 })
    game.favorite = !game.favorite
    return ok(game)
  }),

  http.post(`${API}/games/:id/install`, async ({ params }) => {
    const game = device.games.find((g) => g.id === params.id)
    if (!game) return HttpResponse.json({ error: 'not found' }, { status: 404 })
    const existing = device.downloads.find((j) => j.gameId === game.id && j.state !== 'done')
    if (!existing) {
      const active = device.downloads.some((j) => j.state === 'downloading')
      device.downloads.unshift({
        id: `job-${device.downloads.length + 1}`,
        gameId: game.id,
        title: game.title,
        state: active ? 'queued' : 'downloading',
        totalBytes: game.sizeBytes,
        doneBytes: 0,
        bytesPerSecond: active ? 0 : 38_000_000,
        kind: 'install',
        queuedAt: 1767225600000,
      })
    }
    game.install = 'downloading'
    return ok(game)
  }),

  http.delete(`${API}/games/:id/install`, async ({ params }) => {
    const game = device.games.find((g) => g.id === params.id)
    if (!game) return HttpResponse.json({ error: 'not found' }, { status: 404 })
    game.install = 'not-installed'
    return ok(game)
  }),

  // ------------------------------------------------------------ downloads --
  http.get(`${API}/downloads`, async () => ok({ items: device.downloads })),

  http.post(`${API}/downloads/:id/:action`, async ({ params }) => {
    const job = device.downloads.find((j) => j.id === params.id)
    if (!job) return HttpResponse.json({ error: 'not found' }, { status: 404 })
    const action = params.action as string
    if (action === 'pause') {
      job.state = 'paused'
      job.bytesPerSecond = 0
    }
    if (action === 'resume') {
      job.state = 'downloading'
      job.bytesPerSecond = 38_000_000
    }
    if (action === 'cancel') {
      device.downloads = device.downloads.filter((j) => j.id !== job.id)
    }
    if (action === 'prioritise') {
      device.downloads = [job, ...device.downloads.filter((j) => j.id !== job.id)]
      for (const other of device.downloads) {
        if (other !== job && other.state === 'downloading') {
          other.state = 'queued'
          other.bytesPerSecond = 0
        }
      }
      job.state = 'downloading'
      job.bytesPerSecond = 38_000_000
    }
    return ok({ items: device.downloads } as { items: DownloadJob[] })
  }),

  http.post(`${API}/downloads/tick`, async ({ request }) => {
    const url = new URL(request.url)
    advanceDownloads(num(url, 'seconds', 1))
    return ok({ items: device.downloads })
  }),

  // -------------------------------------------------------------- storage --
  http.get(`${API}/drives`, async () => ok({ items: device.drives })),

  http.delete(`${API}/drives/:driveId/nodes/:nodeId`, async ({ params }) => {
    const drive = device.drives.find((d) => d.id === params.driveId)
    if (!drive) return HttpResponse.json({ error: 'not found' }, { status: 404 })
    const prune = (node: { children?: unknown[] }): void => {
      const children = node.children as Array<{ id: string; children?: unknown[] }> | undefined
      if (!children) return
      const index = children.findIndex((c) => c.id === params.nodeId)
      if (index >= 0) children.splice(index, 1)
      else for (const child of children) prune(child)
    }
    prune(drive.root)
    // Re-total on the way back up; a treemap is only honest if sizes are.
    const total = (node: { sizeBytes: number; children?: unknown[] }): number => {
      const children = node.children as Array<{ sizeBytes: number; children?: unknown[] }> | undefined
      if (!children) return node.sizeBytes
      node.sizeBytes = children.reduce((sum, c) => sum + total(c), 0)
      return node.sizeBytes
    }
    total(drive.root)
    return ok(drive)
  }),

  // ---------------------------------------------------------------- media --
  http.get(`${API}/tracks`, async () => ok({ items: device.tracks })),

  // -------------------------------------------------------------- system --
  http.get(`${API}/settings`, async () => ok(device.settings)),

  http.put(`${API}/settings`, async ({ request }) => {
    const patch = (await request.json()) as Partial<DeviceSettings>
    if (typeof patch.tdpWatts === 'number' && (patch.tdpWatts < 3 || patch.tdpWatts > 30)) {
      return HttpResponse.json({ error: 'TDP must be 3–30 W', field: 'tdpWatts' }, { status: 422 })
    }
    if (typeof patch.deviceName === 'string' && patch.deviceName.trim() === '') {
      return HttpResponse.json(
        { error: 'Device name cannot be empty', field: 'deviceName' },
        { status: 422 },
      )
    }
    device.settings = { ...device.settings, ...patch }
    return ok(device.settings)
  }),

  http.get(`${API}/battery`, async () => ok(device.battery)),
]
