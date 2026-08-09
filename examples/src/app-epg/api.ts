/** Data layer for the guide: channels once, programmes per time window. */
import { useQuery } from '@tanstack/react-query'
import { queries } from '../shared/api/client'
import type { Channel, Programme } from '../shared/api/db'
import type { TimeWindow } from './guide'

export function useChannels() {
  return useQuery(queries.channels())
}

export function useProgrammes(win: TimeWindow) {
  return useQuery({
    ...queries.programmes(win.from, win.to),
    // Switching time window must not empty the grid mid-keystroke: an empty
    // render would destroy the focused block and hand focus to autoRestore
    // for no reason. Keeping the previous window mounted makes the swap a
    // re-render rather than a teardown.
    placeholderData: (previous: { items: Programme[] } | undefined) => previous,
  })
}

export type { Channel, Programme }
