import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { createSpatialNavigation, keyboardAdapter, type SpatialNavigation } from 'spatial-nav-css'
import { applyLayout, setRect } from '../test/layout'
import { sectionEdgeFor, useFastScroll, type FastScrollStage } from './useFastScroll'

/** 120 rows in twelve lettered sections of ten. */
const ROWS = Array.from({ length: 120 }, (_, i) => ({
  id: `row-${i}`,
  section: String.fromCharCode(65 + Math.floor(i / 10)),
}))

function List({ onStage }: { onStage?: (stage: FastScrollStage) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [, force] = useState(0)
  useFastScroll({
    containerRef: ref,
    count: () => ROWS.length,
    indexOf: (el) => Number(el.dataset.index ?? -1),
    focusIndex: (index) => {
      const target = ref.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      if (!target) return false
      target.focus()
      force((n) => n + 1)
      return true
    },
    sectionEdge: (index, delta) =>
      sectionEdgeFor(
        ROWS.map((r) => r.section),
        index,
        delta,
      ),
    onStageChange: onStage,
  })
  return (
    <div ref={ref} data-testid="list" data-spatial-container="remember">
      {ROWS.map((row, i) => (
        <button key={row.id} type="button" data-index={i} data-testid="row">
          {row.section}
          {i}
        </button>
      ))}
    </div>
  )
}

/** A list whose jump target can never be focused, to exercise the fallback. */
function UnfocusableList() {
  const ref = useRef<HTMLDivElement>(null)
  useFastScroll({
    containerRef: ref,
    count: () => ROWS.length,
    indexOf: (el) => Number(el.dataset.index ?? -1),
    focusIndex: () => false,
    sectionEdge: (index, delta) =>
      sectionEdgeFor(
        ROWS.map((r) => r.section),
        index,
        delta,
      ),
  })
  return (
    <div ref={ref} data-testid="list" data-spatial-container="remember">
      {ROWS.map((row, i) => (
        <button key={row.id} type="button" data-index={i} data-testid="row">
          {row.section}
          {i}
        </button>
      ))}
    </div>
  )
}

function mount(onStage?: (stage: FastScrollStage) => void) {
  const view = render(<List onStage={onStage} />)
  const nav = createSpatialNavigation({
    adapters: [keyboardAdapter()],
    visibilityFilter: () => true,
    scrollBehavior: false,
  })
  nav.start()
  layout()
  return { nav, view }
}

function layout(): void {
  applyLayout([{ selector: '[data-testid="row"]', flow: 'column', x: 0, y: 0, w: 300, h: 40, gap: 0 }])
  setRect(screen.getByTestId('list'), { x: 0, y: 0, w: 300, h: 2400 })
}

const hold = (times: number, key = 'ArrowDown') => {
  for (let i = 0; i < times; i++) {
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key, repeat: true, bubbles: true, cancelable: true }),
      )
    })
    layout()
  }
}

const tap = (key = 'ArrowDown') => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
  layout()
}

const focusedIndex = (nav: SpatialNavigation) => Number(nav.getFocused()?.dataset.index ?? -1)

describe('fast scroll', () => {
  it('walks one item at a time while presses are discrete', () => {
    const { nav } = mount()
    act(() => void nav.focus('[data-index="0"]'))
    tap()
    tap()
    tap()
    expect(focusedIndex(nav)).toBe(3)
    nav.destroy()
  })

  it('escalates to a stride once the direction is held', () => {
    const { nav } = mount()
    act(() => void nav.focus('[data-index="0"]'))

    // Repeats 1-3 are still single steps; the 4th crosses `strideAfter` and
    // starts covering ground: 1, 2, 3, then +5.
    hold(3)
    expect(focusedIndex(nav)).toBe(3)
    hold(1)
    expect(focusedIndex(nav)).toBe(8)
    hold(1)
    expect(focusedIndex(nav)).toBe(13)
    nav.destroy()
  })

  it('jumps by section once the direction is held a long time', () => {
    const stages: FastScrollStage[] = []
    const { nav } = mount((stage) => stages.push(stage))
    act(() => void nav.focus('[data-index="0"]'))

    hold(12)
    expect(stages).toEqual(['stride', 'section'])

    // Section boundaries are every ten rows, so the jump lands on a start.
    const landed = focusedIndex(nav)
    expect(landed % 10).toBe(0)

    const before = landed
    hold(1)
    expect(focusedIndex(nav)).toBe(before + 10)

    // At the final section there is nowhere further to jump: it settles on
    // the last item rather than stalling the hold.
    hold(40)
    expect(focusedIndex(nav)).toBe(ROWS.length - 1)
    nav.destroy()
  })

  it('a discrete press resets the escalation — tapping is never accelerated', () => {
    const { nav } = mount()
    act(() => void nav.focus('[data-index="0"]'))
    hold(14) // deep into section jumping
    const afterHold = focusedIndex(nav)
    expect(afterHold).toBeLessThan(ROWS.length - 1) // room left to step

    // Release, then a single deliberate press: exactly one item.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', bubbles: true }))
    })
    tap()
    expect(focusedIndex(nav)).toBe(afterHold + 1)
    nav.destroy()
  })

  it('falls back to the engine when the jump target cannot be focused', () => {
    // The hook vetoes the engine's move to make its own. If its move fails —
    // an unmounted windowed row — vetoing anyway would swallow the press and
    // freeze the list under a held control.
    const view = render(<UnfocusableList />)
    const nav = createSpatialNavigation({
      adapters: [keyboardAdapter()],
      visibilityFilter: () => true,
      scrollBehavior: false,
    })
    nav.start()
    layout()
    act(() => void nav.focus('[data-index="0"]'))
    hold(6) // deep enough to be striding
    // The engine's single steps still happened, so the list moved.
    expect(Number(nav.getFocused()?.dataset.index ?? -1)).toBeGreaterThan(0)
    nav.destroy()
    view.unmount()
  })

  it('does not accelerate the cross axis', () => {
    const { nav } = mount()
    act(() => void nav.focus('[data-index="0"]'))
    hold(8, 'ArrowRight')
    // Nothing to the right, so focus stays; crucially the vertical hold state
    // is not built up by horizontal presses.
    expect(focusedIndex(nav)).toBe(0)
    hold(1)
    expect(focusedIndex(nav)).toBe(1)
    nav.destroy()
  })

  it('clamps at the ends instead of running off', () => {
    const { nav } = mount()
    act(() => void nav.focus(`[data-index="${ROWS.length - 3}"]`))
    hold(20)
    expect(focusedIndex(nav)).toBe(ROWS.length - 1)
    nav.destroy()
  })

  it('reports stage changes so a section indicator can follow', () => {
    const onStage = vi.fn()
    const { nav } = mount(onStage)
    act(() => void nav.focus('[data-index="0"]'))
    hold(13)
    expect(onStage.mock.calls.map((c) => c[0])).toEqual(['stride', 'section'])
    nav.destroy()
  })
})

describe('sectionEdgeFor', () => {
  const sections = ROWS.map((r) => r.section)

  it('moves forward to the start of the next section', () => {
    expect(sectionEdgeFor(sections, 0, 1)).toBe(10)
    expect(sectionEdgeFor(sections, 5, 1)).toBe(10)
    expect(sectionEdgeFor(sections, 10, 1)).toBe(20)
  })

  it('moves backward to the start of this section, then the previous one', () => {
    // Mid-section: go to this section's start.
    expect(sectionEdgeFor(sections, 15, -1)).toBe(10)
    // Already at a start: go to the previous section's start.
    expect(sectionEdgeFor(sections, 10, -1)).toBe(0)
  })

  it('clamps at both ends', () => {
    expect(sectionEdgeFor(sections, 0, -1)).toBe(0)
    expect(sectionEdgeFor(sections, sections.length - 1, 1)).toBe(sections.length - 1)
  })
})
