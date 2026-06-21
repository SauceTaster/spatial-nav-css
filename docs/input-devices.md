# Input devices

The engine consumes semantic intents; adapters own the hardware. Two ship in
the box and cover far more than they appear to.

## Coverage matrix

| Device | Path into the library | Notes |
| --- | --- | --- |
| Xbox controllers (XInput) | Gamepad API → `gamepadAdapter()` | "DirectX input" on modern Windows *is* XInput; every browser exposes it with the standard mapping |
| Steam Input (Deck, Big Picture, overlay browser) | Gamepad API → `gamepadAdapter()` | Steam Input remaps the user's bindings to a *standard gamepad* before the page sees it — rebinding, gyro-to-stick, back paddles all arrive transparently |
| DualShock 4 / DualSense | Gamepad API → `gamepadAdapter()` | standard mapping |
| Switch Pro / generic HID pads | Gamepad API → `gamepadAdapter()` | standard mapping (verify `pad.mapping === 'standard'` for exotic hardware) |
| IR / TV remotes (webOS, Tizen, HbbTV, STBs) | Keyboard events → `keyboardAdapter()` | platform IR stacks deliver remote buttons as key events; default `keyCodeMap` covers 37–40 (d-pad), 13 (OK), 461 (webOS BACK), 10009 (Tizen RETURN) |
| Keyboard | `keyboardAdapter()` | arrows / Enter / Escape, fully remappable |
| Mouse / touch | none needed | clicks produce `focusin`; the engine adopts it as the spatial position |
| Anything else | implement `InputAdapter` | see below |

## Steam Input, precisely

There are two distinct situations:

1. **Web content under Steam** (Steam Deck UI, Big Picture web views, the
   overlay browser, an Electron app launched through Steam): Steam Input
   translates the user's configuration into a virtual XInput/standard
   gamepad. The browser's Gamepad API sees that virtual pad.
   **`gamepadAdapter()` requires zero Steam-specific code**, and user
   rebinding in Steam works automatically.

2. **Native integration via Steamworks** (an Electron/CEF app shipping on
   Steam that wants named action sets — "menu_up", "menu_select" — plus
   per-action glyphs and haptics): use the Steamworks SDK through a binding
   such as `steamworks.js` and feed actions in through a custom adapter:

```ts
import type { InputAdapter } from 'spatial-nav-css'

export function steamworksAdapter(steamInput: SteamworksInputClient): InputAdapter {
  let timer: ReturnType<typeof setInterval> | undefined
  let prev = { up: false, down: false, left: false, right: false, select: false, back: false }
  return {
    id: 'steamworks',
    start(ctx) {
      timer = setInterval(() => {
        const cur = steamInput.readMenuActions() // your action-set read
        for (const dir of ['up', 'down', 'left', 'right'] as const) {
          if (cur[dir] && !prev[dir])
            ctx.dispatch({ type: 'direction', direction: dir, repeat: false, source: 'steamworks' })
        }
        if (cur.select && !prev.select) ctx.dispatch({ type: 'activate', source: 'steamworks' })
        if (cur.back && !prev.back) ctx.dispatch({ type: 'back', source: 'steamworks' })
        prev = cur
      }, 16)
    },
    stop() { clearInterval(timer) },
  }
}
```

Run it *instead of* `gamepadAdapter()` in that build, or Steam's virtual pad
will double-fire:

```ts
const nav = createSpatialNavigation({
  adapters: isSteamNative ? [keyboardAdapter(), steamworksAdapter(client)]
                          : [keyboardAdapter(), gamepadAdapter()],
})
```

## Dedicated IR receivers (WebHID / Web Serial)

On TVs, IR arrives as keyboard events and `keyboardAdapter()` already
handles it. For a *raw* IR receiver (USB dongle, custom hardware) on
desktop, wrap WebHID in an adapter:

```ts
export function webHidIrAdapter(device: HIDDevice, decode: (data: DataView) => string | null): InputAdapter {
  let ctx: AdapterContext | null = null
  const onReport = (e: HIDInputReportEvent) => {
    const button = decode(e.data) // your protocol: NEC, RC-5, …
    if (!ctx || !button) return
    if (button === 'ok') ctx.dispatch({ type: 'activate', source: 'ir' })
    else if (button === 'back') ctx.dispatch({ type: 'back', source: 'ir' })
    else ctx.dispatch({ type: 'direction', direction: button as Direction, repeat: false, source: 'ir' })
  }
  return {
    id: 'ir',
    start(c) { ctx = c; device.addEventListener('inputreport', onReport); device.open() },
    stop() { device.removeEventListener('inputreport', onReport); device.close(); ctx = null },
  }
}
```

The same pattern fits MIDI pads, Kinect-style gesture input, voice commands
("move left"), or a WebSocket from a phone-as-remote.

## Repeat & feel tuning

- Gamepad: `initialRepeatDelayMs` (400) then `repeatIntervalMs` (130) while
  held. Console UIs commonly accelerate long holds — implement by lowering
  the interval in a custom adapter, or dispatching with `repeat: true` and
  letting the app skip animations on repeats.
- Keyboard: repeats use the OS key-repeat rate; `intent.repeat` mirrors
  `KeyboardEvent.repeat`.
- The deadzone (0.5) is deliberately high — menu navigation wants flicks,
  not analog drift. Lower it for cursor-like feels.

## Multiple devices at once

All adapters run concurrently and dispatch into one engine; the last device
to speak wins, which is exactly how consoles behave (touch the keyboard,
keyboard drives; pick the pad back up, pad drives). `detail.source` on every
spatial event tells you which device moved focus — use it to swap button
glyphs (Xbox vs PlayStation vs keyboard hints) in the UI.

**One input source per surface.** Don't run `keyboardAdapter()` alongside a
custom host adapter that *also* delivers the same DOM key events — e.g. a CEF
or webview bridge that forwards the host's key presses into the page. Both
would fire and a single press would navigate twice. When embedding, pick one:
use only your host adapter inside the embed, and the keyboard/gamepad adapters
only in a real browser (detect the environment once at startup). A custom
`InputAdapter` is a few lines — see [the adapter contract above](#writing-an-adapter-future-devices-steamworks-dedicated-ir-anything).
