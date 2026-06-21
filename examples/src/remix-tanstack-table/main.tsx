import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SpatialNavigationProvider } from 'spatial-nav-css/react'
import 'spatial-nav-css/css'
import '../shared/examples.css'
import './table.css'
import { TanstackTableExample } from './Example'

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <SpatialNavigationProvider autofocus>
      <TanstackTableExample />
    </SpatialNavigationProvider>
  </StrictMode>,
)
