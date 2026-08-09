/** Data layer for the launcher: query hooks + optimistic mutations. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidate, mutations, queries, type GameQuery, type Page } from '../shared/api/client'
import type { Game } from '../shared/api/db'

export function useGames(params: GameQuery) {
  return useQuery({
    ...queries.games(params),
    // Keeping the previous page mounted while the next one loads is what
    // makes focus survivable: the list never empties between keystrokes.
    placeholderData: (previous: Page<Game> | undefined) => previous,
  })
}

export function useGame(id: string | null) {
  return useQuery({ ...queries.game(id ?? ''), enabled: id !== null })
}

/**
 * Optimistic favorite toggle. The cache updates before the request settles,
 * so the row re-renders immediately — a good stress test for focus stability
 * across re-renders.
 */
export function useToggleFavorite() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) =>
      mutations.favorite(id, favorite),
    onMutate: async ({ id, favorite }) => {
      await client.cancelQueries({ queryKey: ['games'] })
      const snapshot = client.getQueriesData<Page<Game>>({ queryKey: ['games'] })
      for (const [key, page] of snapshot) {
        if (!page) continue
        client.setQueryData<Page<Game>>(key, {
          ...page,
          items: page.items.map((game) => (game.id === id ? { ...game, favorite } : game)),
        })
      }
      return { snapshot }
    },
    onError: (_error, _vars, context) => {
      for (const [key, page] of context?.snapshot ?? []) client.setQueryData(key, page)
    },
    onSettled: () => invalidate.games(client),
  })
}

export function useInstall() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, install }: { id: string; install: boolean }) =>
      install ? mutations.install(id) : mutations.uninstall(id),
    onSuccess: () => invalidate.games(client),
  })
}
