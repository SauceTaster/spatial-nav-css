import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'spatial-nav-css/css'
import '../shared/examples.css'
import './headless.css'
import { AppShell, createQueryClient } from '../shared/app'
import { startMockApi } from '../shared/api/browser'
import { App } from './App'

await startMockApi()

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <AppShell client={createQueryClient()}>
      <App />
    </AppShell>
  </StrictMode>,
)
