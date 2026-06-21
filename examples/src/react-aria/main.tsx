import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SpatialNavigationProvider } from 'spatial-nav-css/react-aria'
import 'spatial-nav-css/css'
import '../shared/examples.css'
import { ReactAriaExample } from './Example'

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <SpatialNavigationProvider autofocus>
      <ReactAriaExample />
    </SpatialNavigationProvider>
  </StrictMode>,
)
