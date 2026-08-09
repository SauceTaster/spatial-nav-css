# Input devices

The adapter contract has five intent variants: four user actions—`direction`,
`activate`, `release`, and `back`—plus `activationcancel`, which abandons a
stored activate press when release becomes unobservable. In the composed
navigation path, an `activationcancel` intent removes a live pairing and
produces `spatial:activatecancel` on its original target when that target is
still connected and inside the engine root. Otherwise the pairing is removed
without a target event. Keyboard and Gamepad API adapters ship in the box;
every host still determines which hardware and events a web page can observe.

## Coverage matrix

| Device | Path into the library | Notes |
| --- | --- | --- |
| Xbox, DualShock/DualSense, Switch Pro, and other controllers | Gamepad API → `gamepadAdapter()` | Supported when the browser exposes the device with [`pad.mapping === 'standard'`](https://w3c.github.io/gamepad/#remapping). Exposure and mapping vary by browser, OS, permissions, host, and controller. |
| Steam Input | Gamepad API → `gamepadAdapter()` | Works when [Steam Input gamepad emulation](https://partner.steamgames.com/doc/features/steam_controller/steam_input_gamepad_emulation_bestpractices) is configured and the host browser exposes that virtual device as a standard mapping. Keyboard/mouse emulation is a different input path. |
| IR / TV remotes | Keyboard events → `keyboardAdapter()` | When the TV platform exposes remote buttons as keyboard events, defaults cover arrows/OK, [LG webOS Back](https://webostv.developer.lge.com/develop/guides/magic-remote) (`461`), and [Samsung Tizen Return](https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html) (`10009`). Test target devices and extend `keyCodeMap`; codes and browser behavior vary by model and OS version. |
| Keyboard | `keyboardAdapter()` | arrows / Enter / Escape / `BrowserBack` by default, plus documented legacy remote/back codes; `keymap` replaces the `KeyboardEvent.key` table and `keyCodeMap` merges legacy-code overrides |
| Mouse / touch | no adapter for native focus | in light DOM, if the interaction focuses an element matching the engine selector, its `focusin` is adopted; arbitrary clicks and taps do not necessarily move focus |
| Anything else | implement `InputAdapter` | see below |

Support is capability-based, not a certification of every controller or TV
sold under these names. The automated suite uses simulated events and Gamepad
objects; it does not drive physical devices. Maintain an application-specific
matrix of browser/webview versions, controller mappings, remote codes, and
permission behavior, and run it on the slowest supported hardware.

Browsers commonly gate Gamepad API exposure until the user interacts with a
controller, and a document's permissions policy may disable it. Applications
should show a neutral “press any button” state and treat controller discovery
as asynchronous rather than assuming every connected device is immediately
enumerable. The built-in adapter uses standard-map d-pad indices, axes 0/1,
and face buttons; `buttonMap` does not remap axes or a nonstandard d-pad.

Keyboard action lookup checks the configured `keymap` first, then the merged
legacy `keyCodeMap`. Consequently, replacing `keymap` alone does not disable a
default whose numeric key code is still present. Remap that code through
`keyCodeMap`, or use a custom adapter when it should be left unmapped.

## Steam Input integration paths

There are two distinct integration paths:

1. **Gamepad emulation.** When a user or host configures Steam Input to emulate
   a gamepad/XInput device and the browser exposes that virtual device through
   Gamepad API with `mapping === 'standard'`, `gamepadAdapter()` can consume it
   without Steam-specific code. Do not assume this for every Steam webview or
   configuration: Steam Input can instead emulate keyboard/mouse input, and
   browser exposure is host-dependent.

2. **Native integration via Steamworks** (an Electron/CEF app shipping on
   Steam that wants named action sets — "menu_up", "menu_select" — plus
   per-action glyphs and haptics): use the Steamworks SDK through a binding
   such as `steamworks.js` and feed actions in through a custom adapter:

```ts
import type { InputAdapter } from 'spatial-nav-css'

export function steamworksAdapter(steamInput: SteamworksInputClient): InputAdapter {
  let stopPolling: (() => void) | undefined
  return {
    id: 'steamworks',
    start(ctx) {
      let prev = { up: false, down: false, left: false, right: false, select: false, back: false }
      let selectDownAt: number | null = null
      const timer = ctx.window.setInterval(() => {
        const cur = steamInput.readMenuActions() // your action-set read
        for (const dir of ['up', 'down', 'left', 'right'] as const) {
          if (cur[dir] && !prev[dir])
            ctx.dispatch({ type: 'direction', direction: dir, repeat: false, source: 'steamworks' })
        }
        if (cur.select && !prev.select) {
          selectDownAt = ctx.window.performance.now()
          ctx.dispatch({ type: 'activate', source: 'steamworks' })
        }
        if (!cur.select && prev.select && selectDownAt !== null) {
          ctx.dispatch({
            type: 'release',
            durationMs: ctx.window.performance.now() - selectDownAt,
            source: 'steamworks',
          })
          selectDownAt = null
        }
        if (cur.back && !prev.back) ctx.dispatch({ type: 'back', source: 'steamworks' })
        prev = cur
      }, 16)
      stopPolling = () => {
        ctx.window.clearInterval(timer)
        if (selectDownAt !== null) {
          ctx.dispatch({ type: 'activationcancel', source: 'steamworks' })
        }
        selectDownAt = null
      }
    },
    stop() { stopPolling?.(); stopPolling = undefined },
  }
}
```

`SteamworksInputClient` and `readMenuActions()` above are application-level
pseudotypes, not exports from this library or a claimed `steamworks.js` method.
Follow the selected binding's current initialization, frame-pump, action-set,
handle, and shutdown APIs. This abbreviated adapter edge-detects actions but
does not implement held-direction repeat; add the host-specific repeat behavior
your UI needs. If the same physical input is also exposed through a virtual
Gamepad API device, avoid registering both paths or one press may dispatch
twice:

```ts
const nav = createSpatialNavigation({
  adapters: isSteamNative ? [keyboardAdapter(), steamworksAdapter(client)]
                          : [keyboardAdapter(), gamepadAdapter()],
})
```

## Dedicated IR receivers (WebHID / Web Serial)

Many TV browsers expose their bundled remote through keyboard events, which
`keyboardAdapter()` can consume after device-specific verification. For a
*raw* IR receiver (USB dongle or custom hardware) on desktop, WebHID is one
possible adapter path:

```ts
import type { AdapterContext, InputAdapter } from 'spatial-nav-css'

export function webHidIrAdapter(device: HIDDevice, decode: (data: DataView) => string | null): InputAdapter {
  let ctx: AdapterContext | null = null
  const onReport = (e: HIDInputReportEvent) => {
    const button = decode(e.data) // your protocol: NEC, RC-5, …
    const context = ctx
    if (!context || !button) return
    if (button === 'ok') {
      context.dispatch({ type: 'activate', source: 'ir' })
      if (ctx === context) {
        context.dispatch({ type: 'activationcancel', source: 'ir' }) // momentary tap: no hold
      }
    } else if (button === 'back') context.dispatch({ type: 'back', source: 'ir' })
    else if (button === 'up' || button === 'down' || button === 'left' || button === 'right') {
      context.dispatch({ type: 'direction', direction: button, repeat: false, source: 'ir' })
    }
  }
  return {
    id: 'ir',
    start(c) { ctx = c; device.addEventListener('inputreport', onReport) },
    stop() { device.removeEventListener('inputreport', onReport); ctx = null },
  }
}
```

The [WebHID API](https://wicg.github.io/webhid/) is limited-availability and
secure-context only. `requestDevice()` must be initiated by a user gesture,
and `device.open()` is asynchronous and may be rejected. Request, open, and
error-handle the device before registering the adapter; decide separately
whether stopping the adapter should close a device shared with other code.
TypeScript projects may also need ambient WebHID declarations because these
interfaces are not present in every compiler DOM library. Web Serial has
different permission and lifecycle APIs but can feed the same intent contract.
This sample treats OK as a momentary tap and cancels its release pairing
immediately. A decoder that exposes button-down/up can instead emit `release`
with a duration, or `activationcancel` if ownership is lost. The sample also
assumes `decode()` has already handled protocol
repeats/debouncing; raw IR reports often need edge/repeat policy before
activate or back intents are safe to dispatch.

The same pattern fits MIDI pads, Kinect-style gesture input, voice commands
("move left"), or a WebSocket from a phone-as-remote.

## Repeat & feel tuning

- Gamepad: `initialRepeatDelayMs` (400) then `repeatIntervalMs` (130) while
  held. Console UIs commonly accelerate long holds — implement by lowering
  the interval over time in a custom adapter. The `repeat` flag is visible to
  a direct `InputManager` handler, but the composed navigation engine does not
  copy it into `SpatialEventDetail`; keep repeat-sensitive policy at the
  adapter/manager boundary unless the application adds its own signal.
- Keyboard: repeats use the OS key-repeat rate; `intent.repeat` mirrors
  `KeyboardEvent.repeat`.
- The deadzone (0.5) is deliberately high — menu navigation wants flicks,
  not analog drift. Lower it for cursor-like feels.

## Multiple devices at once

All adapters run concurrently and their intents interleave in one engine; the
library does not lock the UI to one active device. The built-in adapters use
their ids in `detail.source`; custom adapters should likewise dispatch their
own stable id as `source` when applications use it to swap button glyphs. Also
handle lifecycle sources such as `api`, `autofocus`, and `restore` rather than
treating the value as a closed device enum.

**One input source per surface.** Don't run `keyboardAdapter()` alongside a
custom host adapter that *also* delivers the same DOM key events — e.g. a CEF
or webview bridge that forwards the host's key presses into the page. Both
would fire and a single press would navigate twice. When embedding, pick one:
use only your host adapter inside the embed, and the keyboard/gamepad adapters
only in a real browser (detect the environment once at startup). See the
[InputAdapter contract](js-api.md#input-adapters) for the complete intent
shape.
