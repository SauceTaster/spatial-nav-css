/**
 * Settings, driven the way the device drives it: through the engine, with the
 * geometry described explicitly because jsdom has none.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { keyboardAdapter, type SpatialNavigation, type SpatialNavigationOptions } from 'spatial-nav-css'
import { useSpatialNavigation } from 'spatial-nav-css/react'
import { createOsQueryClient, OsProviders } from '../../os/OsProviders'
import { applyLayout, setRect, testNavOptions } from '../../test/layout'
import { server } from '../../test/setup'
import { API } from '../../services/handlers'
import { device, type DeviceSettings } from '../../services/device'
import { useShell } from '../../state/shell'
import SettingsView from './SettingsView'

let navigation: SpatialNavigation | null = null

function Probe() {
  navigation = useSpatialNavigation()
  return null
}

function nav(): SpatialNavigation {
  if (!navigation) throw new Error('the navigation provider has not mounted')
  return navigation
}

/** Every spatial stop this screen has, in document order, per pane. */
const RAIL_STOPS = '[data-testid="settings-rail"] button'
const PANEL_STOPS = [
  '[data-testid="settings-panel"] .os-stepper',
  '[data-testid="settings-panel"] button',
  '[data-testid="settings-panel"] input',
].join(', ')

function layout(): void {
  applyLayout([
    { selector: RAIL_STOPS, flow: 'column', x: 0, y: 0, w: 200, h: 44, gap: 6 },
    { selector: PANEL_STOPS, flow: 'column', x: 260, y: 0, w: 520, h: 56, gap: 10 },
  ])
  setRect(screen.getByTestId('settings-rail'), { x: 0, y: 0, w: 200, h: 400 })
  setRect(screen.getByTestId('settings-panel'), { x: 260, y: 0, w: 520, h: 400 })
}

/** The one test that needs real key events runs the real keyboard adapter. */
const KEYBOARD_NAV: SpatialNavigationOptions = {
  adapters: [keyboardAdapter()],
  visibilityFilter: () => true,
  scrollBehavior: false,
}

async function mount(options: { section?: string; nav?: SpatialNavigationOptions } = {}) {
  const view = render(
    <OsProviders client={createOsQueryClient()} nav={options.nav ?? testNavOptions}>
      <Probe />
      <SettingsView section={options.section} />
    </OsProviders>,
  )
  await settled()
  layout()
  return view
}

async function settled(): Promise<void> {
  await waitFor(() => expect(screen.queryByTestId('settings-loading')).not.toBeInTheDocument())
}

function rail(section: string): HTMLElement {
  const match = screen.getAllByTestId('settings-section').find((el) => el.dataset.section === section)
  if (!match) throw new Error(`no rail item for "${section}"`)
  return match
}

const panel = () => screen.getByTestId('settings-panel')

async function openSection(section: string): Promise<void> {
  act(() => void nav().focus(rail(section)))
  await act(async () => void nav().activate())
  await waitFor(() => expect(panel()).toHaveAttribute('data-section', section))
  await settled()
  layout()
}

beforeEach(() => {
  navigation = null
  useShell.setState({
    views: [{ id: 'home' }],
    overlays: [],
    notice: null,
    player: { trackId: null, playing: false, positionSec: 0, queue: [], shuffle: false, repeat: 'off' },
  })
})

describe('SettingsView', () => {
  it('loads the device settings into the panel controls', async () => {
    await mount()
    expect(panel()).toHaveAttribute('data-section', 'display')
    expect(screen.getByTestId('set-brightness-value')).toHaveTextContent('72%')
    expect(screen.getByTestId('set-refresh-value')).toHaveTextContent('90 Hz')
    expect(screen.getByTestId('set-color-value')).toHaveTextContent('Native')
  })

  it('deep-links to the requested section, and falls back for an unknown one', async () => {
    const view = await mount({ section: 'about' })
    expect(panel()).toHaveAttribute('data-section', 'about')
    expect(panel()).toHaveTextContent('handheld-01')
    expect(panel()).toHaveTextContent('HandheldOS 3.7.4')
    // The seeded storage summary, not a placeholder.
    expect(panel()).toHaveTextContent('Internal 1 TB')

    // Unmount before re-mounting: two live screens would make every query
    // ambiguous, and the engine would see both sets of stops.
    view.unmount()
    await mount({ section: 'not-a-section' })
    expect(panel()).toHaveAttribute('data-section', 'display')
  })

  it('the deep-linked section is the rail entry point, not the first item', async () => {
    await mount({ section: 'storage' })
    expect(rail('storage')).toHaveAttribute('data-spatial-autofocus')
    expect(rail('display')).not.toHaveAttribute('data-spatial-autofocus')
  })

  it('crossing the rail and the panel restores focus on both sides', async () => {
    await mount()
    await openSection('network')

    act(() => void nav().navigate('right'))
    expect(panel().contains(nav().getFocused())).toBe(true)

    // Walk to the top of the panel then one row down: a purely navigational
    // way to reach a known control, whatever row the crossing entered on.
    for (let i = 0; i < 4; i++) act(() => void nav().navigate('up'))
    expect(nav().getFocused()).toBe(screen.getByTestId('set-wifi'))
    act(() => void nav().navigate('down'))
    expect(nav().getFocused()).toBe(screen.getByTestId('set-bluetooth'))

    // Left is the door back: the rail remembers which category we were on.
    act(() => void nav().navigate('left'))
    expect(nav().getFocused()).toBe(rail('network'))

    // …and the panel remembers which control we were on.
    act(() => void nav().navigate('right'))
    expect(nav().getFocused()).toBe(screen.getByTestId('set-bluetooth'))
  })

  it('switching category swaps the panel without dropping focus to the body', async () => {
    await mount()
    act(() => void nav().focus(rail('display')))
    act(() => void nav().navigate('down'))
    expect(nav().getFocused()).toBe(rail('performance'))

    await act(async () => void nav().activate())
    await waitFor(() => expect(panel()).toHaveAttribute('data-section', 'performance'))
    await settled()

    expect(document.activeElement).toBe(rail('performance'))
    expect(nav().getFocused()).toBe(rail('performance'))

    // The engine's auto-restore is debounced; wait past it so a silent
    // fall-to-body would have time to show up.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 160))
    })
    expect(document.activeElement).not.toBe(document.body)
    expect(nav().getFocused()).toBe(rail('performance'))
  })

  it('arrow keys inside a focused text field stay in the field, and Escape gets the user out', async () => {
    await mount({ section: 'system', nav: KEYBOARD_NAV })
    const input = screen.getByTestId('set-device-name')
    act(() => void nav().focus(input))
    expect(nav().getFocused()).toBe(input)

    for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) {
      act(() => {
        fireEvent.keyDown(input, { key })
      })
      expect(nav().getFocused()).toBe(input)
    }

    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' })
    })
    expect(document.activeElement).toBe(rail('system'))
    expect(nav().getFocused()).toBe(rail('system'))
  })

  it('a 422 from the device shows against the device-name field and takes focus back to it', async () => {
    await mount({ section: 'system' })
    const input = screen.getByTestId('set-device-name') as HTMLInputElement
    expect(input.value).toBe('handheld-01')

    fireEvent.change(input, { target: { value: '   ' } })
    await act(async () => {
      nav().focus(screen.getByTestId('set-device-name-apply'))
      nav().activate()
    })

    await waitFor(() =>
      expect(screen.getByTestId('set-device-name')).toHaveAttribute('aria-invalid', 'true'),
    )
    expect(panel()).toHaveTextContent('Device name cannot be empty')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('set-device-name')))
    // Nothing was written: the device still answers with its old name.
    expect(device.settings.deviceName).toBe('handheld-01')
  })

  it('an out-of-range TDP is rejected by the device and rolled back on screen', async () => {
    await mount({ section: 'performance' })
    expect(screen.getByTestId('set-tdp-value')).toHaveTextContent('12 W')

    fireEvent.change(screen.getByTestId('set-tdp-exact'), { target: { value: '99' } })
    await act(async () => {
      nav().focus(screen.getByTestId('set-tdp-apply'))
      nav().activate()
    })

    await waitFor(() => expect(panel()).toHaveTextContent('TDP must be 3–30 W'))
    expect(screen.getByTestId('set-tdp-exact')).toHaveAttribute('aria-invalid', 'true')
    // The optimistic write is undone, not left showing a value the device refused.
    await waitFor(() => expect(screen.getByTestId('set-tdp-value')).toHaveTextContent('12 W'))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('set-tdp-exact')))
    // And what the user typed is still there to correct.
    expect((screen.getByTestId('set-tdp-exact') as HTMLInputElement).value).toBe('99')
  })

  it('a non-numeric TDP never reaches the device', async () => {
    await mount({ section: 'performance' })
    fireEvent.change(screen.getByTestId('set-tdp-exact'), { target: { value: 'lots' } })
    await act(async () => {
      nav().focus(screen.getByTestId('set-tdp-apply'))
      nav().activate()
    })
    await waitFor(() => expect(panel()).toHaveTextContent('Enter a whole number of watts.'))
    expect(device.settings.tdpWatts).toBe(12)
  })

  it('a toggle flips optimistically, before the device has answered', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.put(`${API}/settings`, async ({ request }) => {
        const patch = (await request.json()) as Partial<DeviceSettings>
        await gate
        device.settings = { ...device.settings, ...patch }
        return HttpResponse.json(device.settings)
      }),
    )

    await mount({ section: 'network' })
    expect(screen.getByTestId('set-wifi')).toHaveAttribute('aria-checked', 'true')

    await act(async () => {
      nav().focus(screen.getByTestId('set-wifi'))
      nav().activate()
    })
    // The request is still parked on `gate`, so this can only be the
    // optimistic cache write.
    await waitFor(() => expect(screen.getByTestId('set-wifi')).toHaveAttribute('aria-checked', 'false'))
    expect(device.settings.wifi).toBe(true)

    await act(async () => {
      release()
      await waitFor(() => expect(device.settings.wifi).toBe(false))
    })
    expect(screen.getByTestId('set-wifi')).toHaveAttribute('aria-checked', 'false')
  })

  it('airplane mode marks the radios aria-disabled and keeps them navigable', async () => {
    await mount({ section: 'network' })
    await act(async () => {
      nav().focus(screen.getByTestId('set-airplane'))
      nav().activate()
    })
    await waitFor(() => expect(screen.getByTestId('set-wifi')).toHaveAttribute('aria-disabled', 'true'))
    layout()

    const wifi = screen.getByTestId('set-wifi')
    expect(wifi).not.toHaveAttribute('disabled')
    act(() => void nav().focus(wifi))
    expect(nav().getFocused()).toBe(wifi)

    // …and it does nothing while grounded.
    await act(async () => void nav().activate())
    expect(device.settings.wifi).toBe(true)
  })

  it('the danger zone goes through the shell confirm before it acts', async () => {
    await mount({ section: 'system' })
    await act(async () => {
      nav().focus(screen.getByTestId('set-factory-reset'))
      nav().activate()
    })

    const overlay = useShell.getState().overlays.at(-1)
    if (overlay?.kind !== 'confirm') throw new Error('the factory reset did not ask')
    expect(overlay.confirm.destructive).toBe(true)
    expect(useShell.getState().notice).toBeNull()

    await act(async () => {
      overlay.confirm.resolve(true)
    })
    await waitFor(() => expect(useShell.getState().notice).toMatch(/factory reset/i))
  })

  it('declining the danger zone confirm does nothing at all', async () => {
    await mount({ section: 'system' })
    await act(async () => {
      nav().focus(screen.getByTestId('set-factory-reset'))
      nav().activate()
    })
    const overlay = useShell.getState().overlays.at(-1)
    if (overlay?.kind !== 'confirm') throw new Error('the factory reset did not ask')

    await act(async () => {
      overlay.confirm.resolve(false)
    })
    expect(useShell.getState().notice).toBeNull()
  })

  it('a range control steps on left/right and releases the press at its ends', async () => {
    await mount({ section: 'audio', nav: KEYBOARD_NAV })
    const volume = screen.getByTestId('set-volume')
    act(() => void nav().focus(volume))
    expect(screen.getByTestId('set-volume-value')).toHaveTextContent('45%')

    act(() => {
      fireEvent.keyDown(volume, { key: 'ArrowRight' })
    })
    await waitFor(() => expect(screen.getByTestId('set-volume-value')).toHaveTextContent('50%'))
    expect(nav().getFocused()).toBe(volume)

    // Run it to the floor, then one more press: with nothing left to change
    // the key is not consumed and the engine takes the move — which is the
    // panel's leftward door back to the rail.
    //
    // Each press must settle before the next: the optimistic write lands in a
    // microtask, so a synchronous burst would keep reading the stale value,
    // keep consuming the key, and never reach the floor at all.
    while (screen.getByTestId('set-volume-value').textContent !== '0%') {
      await act(async () => {
        fireEvent.keyDown(volume, { key: 'ArrowLeft' })
      })
      layout()
    }
    await waitFor(() => expect(screen.getByTestId('set-volume-value')).toHaveTextContent('0%'))
    expect(nav().getFocused()).toBe(volume)

    act(() => {
      fireEvent.keyDown(volume, { key: 'ArrowLeft' })
    })
    expect(nav().getFocused()).toBe(rail('audio'))
  })

  it('back inside the panel returns to the rail rather than leaving Settings', async () => {
    await mount({ section: 'network' })
    act(() => void nav().focus(screen.getByTestId('set-bluetooth')))

    let escaped = false
    const onBack = () => {
      escaped = true
    }
    document.addEventListener('spatial:back', onBack)
    act(() => void nav().back())
    document.removeEventListener('spatial:back', onBack)

    expect(nav().getFocused()).toBe(rail('network'))
    // The shell's document-level handler must not also see this press, or one
    // B would both return to the rail and pop the whole view.
    expect(escaped).toBe(false)
  })
})
