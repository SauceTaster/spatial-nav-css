import { lazy, Suspense } from 'react'
import type { ViewEntry } from '../state/shell'

// Code-split per view: an OS shell should boot to Home fast, not parse the
// treemap and the data grid first.
const HomeView = lazy(() => import('../views/home/HomeView'))
const LibraryView = lazy(() => import('../views/library/LibraryView'))
const GameView = lazy(() => import('../views/game/GameView'))
const StorageView = lazy(() => import('../views/storage/StorageView'))
const FilesView = lazy(() => import('../views/files/FilesView'))
const MediaView = lazy(() => import('../views/media/MediaView'))
const DownloadsView = lazy(() => import('../views/downloads/DownloadsView'))
const SettingsView = lazy(() => import('../views/settings/SettingsView'))

export function ViewRouter({ view }: { view: ViewEntry }) {
  return (
    <Suspense fallback={<div className="os-loading" data-testid="view-loading" />}>
      {view.id === 'home' ? <HomeView /> : null}
      {view.id === 'library' ? <LibraryView /> : null}
      {view.id === 'game' ? <GameView gameId={view.gameId} /> : null}
      {view.id === 'storage' ? <StorageView /> : null}
      {view.id === 'files' ? <FilesView driveId={view.driveId} /> : null}
      {view.id === 'media' ? <MediaView /> : null}
      {view.id === 'downloads' ? <DownloadsView /> : null}
      {view.id === 'settings' ? <SettingsView section={view.section} /> : null}
    </Suspense>
  )
}
