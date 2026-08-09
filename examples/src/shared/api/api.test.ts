import { describe, expect, it } from 'vitest'
import { ApiError, queries, mutations } from './client'
import { createQueryClient } from '../app'
import { db } from './db'

describe('mock API', () => {
  it('serves deterministic seeded data', async () => {
    const client = createQueryClient()
    const page = await client.fetchQuery(queries.games({ pageSize: 4 }))
    expect(page.total).toBe(48)
    expect(page.items).toHaveLength(4)
    // Seeded, so the same titles appear in the dev page and here.
    expect(page.items[0]!.title).toBe(db.games.slice().sort((a, b) => a.title.localeCompare(b.title))[0]!.title)
  })

  it('filters, sorts, and paginates through the fetch layer', async () => {
    const client = createQueryClient()
    const installed = await client.fetchQuery(queries.games({ filter: 'installed' }))
    expect(installed.items.every((g) => g.installed)).toBe(true)

    const bySize = await client.fetchQuery(queries.games({ sort: 'size', pageSize: 5 }))
    const sizes = bySize.items.map((g) => g.sizeGB)
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes)

    const second = await client.fetchQuery(queries.games({ page: 1, pageSize: 10 }))
    expect(second.items).toHaveLength(10)
    expect(second.page).toBe(1)
  })

  it('mutations change server state that later reads observe', async () => {
    const client = createQueryClient()
    const before = await client.fetchQuery(queries.game('game-1'))
    await mutations.install('game-1')
    client.removeQueries({ queryKey: ['game', 'game-1'] })
    const after = await client.fetchQuery(queries.game('game-1'))
    expect(after.installed).toBe(true)
    expect(before.id).toBe(after.id)
  })

  it('surfaces server validation errors as rejected queries', async () => {
    await expect(mutations.saveSettings({ sshPort: 99999 })).rejects.toThrow(/sshPort/)
    const settings = await createQueryClient().fetchQuery(queries.settings())
    expect(settings.sshPort).toBe(22)
  })

  it('keeps the status and offending field on the thrown error', async () => {
    // A form needs to map the failure back onto a field, not parse a string.
    const error = await mutations.saveSettings({ sshPort: 99999 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(422)
    expect((error as ApiError).field).toBe('sshPort')
  })
})
