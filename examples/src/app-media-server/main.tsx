import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'spatial-nav-css/css'
import '../shared/examples.css'
import './media-server.css'
import { AppShell, createQueryClient } from '../shared/app'
import { startMockApi } from '../shared/api/browser'
import { App } from './App'

// The page renders only after the service worker is intercepting, so the
// first paint is a real loading state rather than a failed request.
await startMockApi()

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <AppShell client={createQueryClient()}>
      <App />
    </AppShell>
  </StrictMode>,
)
