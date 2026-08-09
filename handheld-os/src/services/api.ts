/** Typed client + TanStack Query options for the device services. */
import { queryOptions } from '@tanstack/react-query'
import { API } from './handlers'
import type {
  DeviceSettings,
  DownloadJob,
  Drive,
  Game,
  Track,
} from './device'

export class OsError extends Error {
  readonly status: number
  readonly field?: string
  constructor(status: number, body: { error?: string; field?: string }) {
    super(body.error ?? `Request failed (${status})`)
    this.name = 'OsError'
    this.status = status
    this.field = body.field
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  })
  if (!response.ok) {
    throw new OsError(response.status, (await response.json().catch(() => ({}))) as { error?: string })
  }
  return (await response.json()) as T
}

const body = (value: unknown): RequestInit => ({ body: JSON.stringify(value) })

export interface GameFilters {
  search?: string
  installed?: boolean
  genre?: string
  compat?: string
  sort?: 'alpha' | 'recent' | 'played' | 'size'
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== false) search.set(key, String(value))
  }
  const out = search.toString()
  return out ? `?${out}` : ''
}

export const osQueries = {
  games: (filters: GameFilters = {}) =>
    queryOptions({
      queryKey: ['games', filters] as const,
      queryFn: () => call<{ items: Game[]; total: number }>(`/games${qs({ ...filters })}`),
    }),
  game: (id: string) =>
    queryOptions({
      queryKey: ['game', id] as const,
      queryFn: () => call<Game>(`/games/${id}`),
    }),
  downloads: () =>
    queryOptions({
      queryKey: ['downloads'] as const,
      queryFn: () => call<{ items: DownloadJob[] }>('/downloads'),
    }),
  drives: () =>
    queryOptions({
      queryKey: ['drives'] as const,
      queryFn: () => call<{ items: Drive[] }>('/drives'),
    }),
  tracks: () =>
    queryOptions({
      queryKey: ['tracks'] as const,
      queryFn: () => call<{ items: Track[] }>('/tracks'),
    }),
  settings: () =>
    queryOptions({
      queryKey: ['settings'] as const,
      queryFn: () => call<DeviceSettings>('/settings'),
    }),
  battery: () =>
    queryOptions({
      queryKey: ['battery'] as const,
      queryFn: () => call<{ percent: number; charging: boolean; wattage: number }>('/battery'),
    }),
}

export const osMutations = {
  toggleFavorite: (id: string) => call<Game>(`/games/${id}/favorite`, { method: 'POST' }),
  install: (id: string) => call<Game>(`/games/${id}/install`, { method: 'POST' }),
  uninstall: (id: string) => call<Game>(`/games/${id}/install`, { method: 'DELETE' }),
  download: (id: string, action: 'pause' | 'resume' | 'cancel' | 'prioritise') =>
    call<{ items: DownloadJob[] }>(`/downloads/${id}/${action}`, { method: 'POST' }),
  tickDownloads: (seconds: number) =>
    call<{ items: DownloadJob[] }>(`/downloads/tick${qs({ seconds })}`, { method: 'POST' }),
  deleteNode: (driveId: string, nodeId: string) =>
    call<Drive>(`/drives/${driveId}/nodes/${nodeId}`, { method: 'DELETE' }),
  saveSettings: (patch: Partial<DeviceSettings>) =>
    call<DeviceSettings>('/settings', { method: 'PUT', ...body(patch) }),
}
