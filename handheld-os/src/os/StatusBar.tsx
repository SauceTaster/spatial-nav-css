import { useQuery } from '@tanstack/react-query'
import { osQueries } from '../services/api'
import { useShell } from '../state/shell'

const TITLES: Record<string, string> = {
  home: 'Home',
  library: 'Library',
  game: 'Game',
  storage: 'Storage',
  files: 'Files',
  media: 'Media',
  downloads: 'Downloads',
  settings: 'Settings',
}

export function StatusBar() {
  const views = useShell((s) => s.views)
  const battery = useQuery(osQueries.battery())
  const downloads = useQuery(osQueries.downloads())
  const player = useShell((s) => s.player)

  const active = (downloads.data?.items ?? []).filter((j) => j.state === 'downloading').length
  const crumb = views.map((v) => TITLES[v.id] ?? v.id).join(' › ')

  return (
    <header className="os-status" data-testid="status-bar">
      <span className="os-status-crumb" data-testid="status-crumb">
        {crumb}
      </span>
      <span className="os-status-right">
        {player.playing ? <span data-testid="status-playing">▶ playing</span> : null}
        {active > 0 ? <span data-testid="status-downloads">↓ {active}</span> : null}
        <span data-testid="status-battery">
          {battery.data ? `${battery.data.percent}%` : '—'}
          {battery.data?.charging ? ' ⚡' : ''}
        </span>
      </span>
    </header>
  )
}
