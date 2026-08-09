/**
 * Move focus to content once it arrives.
 *
 * Provider `autofocus` is a one-shot that runs at `start()`, when a
 * data-driven screen is still skeletons — focus lands on page chrome and
 * never reaches the content. `nav.claimFocus(selector)` fills the gap: it
 * focuses the target only while focus is still unclaimed, so it never yanks
 * focus away from a user who already started navigating.
 *
 * See docs/recipes.md, "Focusing content that loads asynchronously".
 */
import { useEffect } from 'react'
import { useSpatialNavigation } from 'spatial-nav-css/react'

export function useContentFocus(ready: boolean, selector: string): void {
  const nav = useSpatialNavigation()
  useEffect(() => {
    if (ready) nav.claimFocus(selector)
  }, [ready, selector, nav])
}
