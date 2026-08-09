/**
 * Every story runs inside the real shell environment: the mock device
 * services, a fresh query cache, and a live navigation engine. A story that
 * mocked those away would not be testing the thing that is hard.
 */
import type { Decorator, Preview } from '@storybook/react-vite'
import 'spatial-nav-css/css'
import '../src/ui/tokens.css'
import '../src/os/shell.css'
import { startOsServices } from '../src/services/browser'
import { createOsQueryClient, OsProviders } from '../src/os/OsProviders'
import { resetDevice } from '../src/services/device'

const ready = startOsServices()

const withOs: Decorator = (Story, context) => {
  // A story must not inherit the device state a previous story mutated.
  if (context.parameters.resetDevice !== false) resetDevice()
  return (
    <OsProviders client={createOsQueryClient()}>
      <div className="sb-frame">
        <Story />
      </div>
    </OsProviders>
  )
}

const preview: Preview = {
  loaders: [async () => ({ services: await ready })],
  decorators: [withOs],
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disable: true },
    controls: { expanded: true },
    a11y: { test: 'error' },
    docs: {
      description: {
        component:
          'Rendered inside the real OS providers — mock device services, query cache, and a live spatial navigation engine. Use the arrow keys.',
      },
    },
  },
}

export default preview
