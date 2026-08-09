import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'spatial-nav-css/css'
import './ui/tokens.css'
import { startOsServices } from './services/browser'
import { OsProviders } from './os/OsProviders'
import { OsShell } from './os/OsShell'

// Boot the device services before first paint, so the shell's first render is
// a real loading state rather than a failed request.
await startOsServices()

createRoot(document.getElementById('os-root')!).render(
  <StrictMode>
    <OsProviders>
      <OsShell />
    </OsProviders>
  </StrictMode>,
)
