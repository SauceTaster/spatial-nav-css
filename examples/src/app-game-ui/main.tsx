import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'spatial-nav-css/css'
import '../shared/examples.css'
import './game-ui.css'
import { AppShell } from '../shared/app'
import { App } from './App'

// No mock API here on purpose: a pause menu, an inventory and a skill tree
// are client state in every real game. What this page exercises is geometry.
createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <AppShell nav={{ autofocus: true }}>
      <App />
    </AppShell>
  </StrictMode>,
)
