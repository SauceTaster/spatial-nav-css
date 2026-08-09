import { SpatialContainer, SpatialNavigationProvider, useFocusable } from 'spatial-nav-css/react'
import { useSpatialFocused } from 'spatial-nav-css/react-aria'

function Card() {
  const { ref } = useFocusable<HTMLButtonElement>()
  const spatialFocus = useSpatialFocused<HTMLButtonElement>()

  return (
    <>
      <button type="button" ref={ref}>
        Core binding
      </button>
      <button type="button" ref={spatialFocus.ref}>
        React Aria helper
      </button>
    </>
  )
}

export const App = () => (
  <SpatialNavigationProvider>
    <SpatialContainer contain>
      <Card />
    </SpatialContainer>
  </SpatialNavigationProvider>
)
