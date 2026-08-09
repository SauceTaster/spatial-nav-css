/**
 * The A–Z strip down the right edge.
 *
 * It has two jobs. It is a *destination* — activate a letter and the grid
 * jumps there — and it is the **read-out for the accelerated hold**: the only
 * feedback a user has that a held D-pad has escalated from walking to striding
 * to jumping by letter. `stage` comes straight from `useFastScroll`'s
 * `onStageChange`, so the rail widens and brightens in step with the hold.
 */
import type { FastScrollStage } from '../../nav/useFastScroll'

export interface Section {
  letter: string
  /** Index of the first game in the section, within the current filter. */
  index: number
}

export function SectionRail({
  sections,
  activeLetter,
  stage,
  onJump,
}: {
  sections: Section[]
  activeLetter: string | null
  stage: FastScrollStage
  onJump: (index: number) => void
}) {
  return (
    <nav
      className="lv-sections"
      aria-label="Jump to section"
      data-testid="lib-sections"
      data-stage={stage}
      // `remember` so returning from the grid lands on the letter you used
      // last. Never `contain` — this rail is one column wide and containing it
      // would strand the user on the far edge of the screen.
      data-spatial-container="remember"
    >
      {sections.map((section) => (
        <button
          key={section.letter}
          type="button"
          className="lv-letter"
          data-testid="lib-letter"
          data-letter={section.letter}
          // aria-current, not a class: React rewrites className on its next
          // render, and this has to survive the grid re-rendering under it.
          aria-current={section.letter === activeLetter ? 'true' : undefined}
          onClick={() => onJump(section.index)}
        >
          {section.letter}
        </button>
      ))}
    </nav>
  )
}
