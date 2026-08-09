/**
 * The seek bar — a continuous value on a device where left/right is also how
 * you leave a control.
 *
 * A native `<input type="range">` is the obvious choice and the wrong one.
 * The keyboard adapter deliberately leaves a range's own axis native, so
 * left/right adjust the value and never navigate out — while `gamepadAdapter`
 * dispatches semantic intents that never reach the input at all, so on the
 * D-pad the exact opposite happens: left/right navigate away and the value can
 * never be changed. One control, two contradictory behaviours split by input
 * device, and on the keyboard half it is a trap.
 *
 * `Stepper` (src/ui/controls.tsx) answers this by blocking left/right with
 * `navLeft`/`navRight: 'none'` and doing the stepping itself. This is the same
 * contract for a continuous value, with one change: Stepper reads `onKeyDown`,
 * which only a keyboard produces. Here the scrub is driven from
 * `spatial:nofocustarget`, which the engine dispatches on the origin whenever
 * a blocked direction is pressed — so keyboard, gamepad and `nav.navigate()`
 * scrub identically, and `detail.repeat` gives a held press a coarser step for
 * free.
 *
 * Owning an axis is only safe when nothing lives on it. The bar is the full
 * width of the player panel, so there is nothing to its left or right to
 * reach; up and down stay with the engine, which is what keeps it escapable.
 * media.test.tsx pins exactly that.
 *
 * `up` is the one direction declared rather than measured, because a
 * full-width control breaks the engine's same-row test. "Aligned" means the
 * orthogonal overlap covers at least 20% of the *origin's* extent, and the
 * origin here is the whole panel width — so no ordinary-sized button above can
 * ever clear that bar, while a wide-ish neighbour parked at the right edge
 * can. Which one wins then flips with the viewport width. Naming the target is
 * both cheaper and honest: up from the scrubber is play/pause, always.
 */
import { useEffect, useRef } from 'react'
import { useFocusable } from 'spatial-nav-css/react'
import type { SpatialEvent } from 'spatial-nav-css'
import { formatDuration } from '../../services/device'

/** A discrete press nudges; a held one covers ground. */
const STEP_SEC = 5
const HELD_STEP_SEC = 15
const EXIT_UP = '.mv-tbtn-play'

export function SeekBar({
  positionSec,
  durationSec,
  onSeek,
}: {
  positionSec: number
  durationSec: number
  onSeek: (positionSec: number) => void
}) {
  const { ref } = useFocusable<HTMLDivElement>({
    navLeft: 'none',
    navRight: 'none',
    navUp: EXIT_UP,
  })
  const latest = useRef({ positionSec, durationSec, onSeek })
  latest.current = { positionSec, durationSec, onSeek }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onBlocked = (event: Event) => {
      const { direction, repeat } = (event as SpatialEvent).detail
      if (direction !== 'left' && direction !== 'right') return
      const { positionSec: at, durationSec: total, onSeek: seek } = latest.current
      if (total <= 0) return
      const step = (repeat ? HELD_STEP_SEC : STEP_SEC) * (direction === 'left' ? -1 : 1)
      seek(Math.min(total, Math.max(0, at + step)))
    }
    el.addEventListener('spatial:nofocustarget', onBlocked)
    return () => el.removeEventListener('spatial:nofocustarget', onBlocked)
  }, [ref])

  const percent = durationSec > 0 ? Math.min(100, (positionSec / durationSec) * 100) : 0

  return (
    <div className="mv-seek-row">
      <span className="mv-time" data-testid="media-position">
        {formatDuration(positionSec)}
      </span>
      <div
        ref={ref}
        className="mv-seek"
        data-testid="media-seek"
        // Tab-reachable like every other control in the shell: the scrub runs
        // off engine intents, so a keyboard user gets the same arrows a
        // gamepad does rather than a focusable element that ignores them.
        tabIndex={0}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationSec)}
        aria-valuenow={Math.round(positionSec)}
        aria-valuetext={`${formatDuration(positionSec)} of ${formatDuration(durationSec)}`}
      >
        <span className="mv-seek-fill" style={{ width: `${percent}%` }} />
        <span className="mv-seek-thumb" style={{ left: `${percent}%` }} />
      </div>
      <span className="mv-time">{formatDuration(durationSec)}</span>
    </div>
  )
}
