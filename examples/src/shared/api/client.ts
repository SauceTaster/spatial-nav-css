/**
 * Typed fetch client + TanStack Query keys.
 *
 * Components never call fetch directly: they use these query options, so
 * caching, invalidation, and loading states behave the same on the dev pages
 * and under test.
 */
import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { API } from './handlers'
import type {
  Channel,
  Game,
  LogEntry,
  MediaLibrary,
  MediaUser,
  MetricPoint,
  Programme,
  ServiceStatus,
  StoragePool,
  StreamSession,
  SystemSettings,
} from './db'

/**
 * Carries the response status and parsed body, so a form can map a 422 back
 * onto the field it came from instead of pattern-matching the message text.
 */
export class ApiError extends Error {
  readonly status: number
  readonly body: { error?: string; field?: string } & Record<string, unknown>

  constructor(status: number, body: Record<string, unknown>, fallback: string) {
    super(typeof body.error === 'string' ? body.error : fallback)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }

  /** The offending field on a validation error, when the server named one. */
  get field(): string | undefined {
    return typeof this.body.field === 'string' ? this.body.field : undefined
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    throw new ApiError(response.status, body, `${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) })

export interface GameQuery {
  search?: string
  genre?: string
  filter?: 'all' | 'installed' | 'favorites'
  sort?: 'title' | 'playtime' | 'size'
  page?: number
  pageSize?: number
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const rendered = search.toString()
  return rendered ? `?${rendered}` : ''
}

export const queries = {
  games: (params: GameQuery = {}) =>
    queryOptions({
      queryKey: ['games', params] as const,
      queryFn: () => request<Page<Game>>(`/games${queryString({ ...params })}`),
    }),
  game: (id: string) =>
    queryOptions({
      queryKey: ['game', id] as const,
      queryFn: () => request<Game>(`/games/${id}`),
    }),
  libraries: () =>
    queryOptions({
      queryKey: ['libraries'] as const,
      queryFn: () => request<{ items: MediaLibrary[] }>('/libraries'),
    }),
  sessions: () =>
    queryOptions({
      queryKey: ['sessions'] as const,
      queryFn: () => request<{ items: StreamSession[] }>('/sessions'),
    }),
  mediaUsers: () =>
    queryOptions({
      queryKey: ['media-users'] as const,
      queryFn: () => request<{ items: MediaUser[] }>('/media-users'),
    }),
  channels: () =>
    queryOptions({
      queryKey: ['channels'] as const,
      queryFn: () => request<{ items: Channel[] }>('/channels'),
    }),
  programmes: (from: number, to: number) =>
    queryOptions({
      queryKey: ['programmes', from, to] as const,
      queryFn: () => request<{ items: Programme[] }>(`/programmes${queryString({ from, to })}`),
    }),
  services: () =>
    queryOptions({
      queryKey: ['services'] as const,
      queryFn: () => request<{ items: ServiceStatus[] }>('/services'),
    }),
  storage: () =>
    queryOptions({
      queryKey: ['storage'] as const,
      queryFn: () => request<{ items: StoragePool[] }>('/storage'),
    }),
  settings: () =>
    queryOptions({
      queryKey: ['settings'] as const,
      queryFn: () => request<SystemSettings>('/settings'),
    }),
  logs: (level?: string) =>
    queryOptions({
      queryKey: ['logs', level ?? 'all'] as const,
      queryFn: () => request<{ items: LogEntry[] }>(`/logs${queryString({ level })}`),
    }),
  metrics: () =>
    queryOptions({
      queryKey: ['metrics'] as const,
      queryFn: () => request<{ items: MetricPoint[] }>('/metrics'),
    }),
}

export const mutations = {
  install: (id: string) => request<Game>(`/games/${id}/install`, { method: 'POST' }),
  uninstall: (id: string) => request<Game>(`/games/${id}/install`, { method: 'DELETE' }),
  favorite: (id: string, favorite: boolean) =>
    request<Game>(`/games/${id}/favorite`, { method: 'POST', ...json({ favorite }) }),
  scanLibrary: (id: string) => request<MediaLibrary>(`/libraries/${id}/scan`, { method: 'POST' }),
  stopSession: (id: string) => request<StreamSession>(`/sessions/${id}`, { method: 'DELETE' }),
  updateUser: (id: string, patch: Partial<MediaUser>) =>
    request<MediaUser>(`/media-users/${id}`, { method: 'PATCH', ...json(patch) }),
  serviceAction: (id: string, action: 'start' | 'stop' | 'restart') =>
    request<ServiceStatus>(`/services/${id}/${action}`, { method: 'POST' }),
  saveSettings: (patch: Partial<SystemSettings>) =>
    request<SystemSettings>('/settings', { method: 'PUT', ...json(patch) }),
}

/** Invalidate everything a mutation can affect. */
export const invalidate = {
  games: (client: QueryClient) =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['games'] }),
      client.invalidateQueries({ queryKey: ['game'] }),
    ]),
}
