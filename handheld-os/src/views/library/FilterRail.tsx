/**
 * The library's left rail: search plus four filters.
 *
 * Every row here is a plain `<button>` (or the shared `Toggle`, which is one)
 * that *cycles* its value on activate. The obvious alternative — the shared
 * `Stepper`, where left/right change the value — is wrong in this position:
 * `Stepper` sets `--nav-left`/`--nav-right` to `none` so its own axis is not
 * hijacked, and in a left rail right *is* the way into the grid. A control
 * that eats the only exit is a trap on a device with no Tab key.
 */
import { Toggle } from '../../ui/controls'
import type { GameFilters } from '../../services/api'
import { GENRES } from './constants'

export type SortKey = NonNullable<GameFilters['sort']>

export interface LibraryFilters {
  search: string
  installed: boolean
  /** Empty string means "any" for both of these. */
  genre: string
  compat: string
  sort: SortKey
}

export const DEFAULT_FILTERS: LibraryFilters = {
  search: '',
  installed: false,
  genre: '',
  compat: '',
  sort: 'alpha',
}

interface Option<T extends string> {
  value: T
  label: string
}

const GENRE_OPTIONS: Array<Option<string>> = [
  { value: '', label: 'All genres' },
  ...GENRES.map((genre) => ({ value: genre, label: genre })),
]

const COMPAT_OPTIONS: Array<Option<string>> = [
  { value: '', label: 'Any' },
  { value: 'verified', label: 'Verified' },
  { value: 'playable', label: 'Playable' },
  { value: 'unsupported', label: 'Unsupported' },
  { value: 'unknown', label: 'Unknown' },
]

const SORT_OPTIONS: Array<Option<SortKey>> = [
  { value: 'alpha', label: 'Alphabetical' },
  { value: 'recent', label: 'Recently played' },
  { value: 'played', label: 'Most played' },
  { value: 'size', label: 'Largest' },
]

function CycleRow<T extends string>({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string
  name: string
  value: T
  options: Array<Option<T>>
  onChange: (value: T) => void
}) {
  const index = options.findIndex((option) => option.value === value)
  const current = index < 0 ? 0 : index
  const next = options[(current + 1) % options.length]
  return (
    <button
      type="button"
      className="lv-filter"
      data-testid="lib-filter"
      data-filter={name}
      onClick={() => {
        if (next) onChange(next.value)
      }}
    >
      <span className="lv-filter-label">{label}</span>
      <span className="lv-filter-value">{options[current]?.label ?? '—'}</span>
    </button>
  )
}

export function FilterRail({
  filters,
  total,
  onChange,
}: {
  filters: LibraryFilters
  total: number
  onChange: (patch: Partial<LibraryFilters>) => void
}) {
  return (
    <aside
      className="lv-rail"
      aria-label="Filters"
      data-testid="lib-rail"
      // `remember`, not `contain`: the user must be able to leave rightwards
      // into the grid, and coming back should land on the filter they were
      // last editing rather than the search field.
      data-spatial-container="remember"
    >
      <label className="lv-search">
        <span className="lv-search-label">Search</span>
        <input
          type="search"
          className="lv-search-input"
          data-testid="lib-search"
          value={filters.search}
          placeholder="Title…"
          onChange={(event) => onChange({ search: event.target.value })}
        />
      </label>

      <Toggle
        label="Installed only"
        checked={filters.installed}
        onChange={(installed) => onChange({ installed })}
        testId="lib-installed"
      />

      <CycleRow
        label="Genre"
        name="genre"
        value={filters.genre}
        options={GENRE_OPTIONS}
        onChange={(genre) => onChange({ genre })}
      />
      <CycleRow
        label="Compatibility"
        name="compat"
        value={filters.compat}
        options={COMPAT_OPTIONS}
        onChange={(compat) => onChange({ compat })}
      />
      <CycleRow
        label="Sort"
        name="sort"
        value={filters.sort}
        options={SORT_OPTIONS}
        onChange={(sort) => onChange({ sort })}
      />

      <p className="lv-rail-count os-dim" data-testid="lib-count">
        {total} games
      </p>
    </aside>
  )
}
