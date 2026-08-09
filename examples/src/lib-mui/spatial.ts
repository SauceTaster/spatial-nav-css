/**
 * Small pieces every MUI wrapper in this folder needs.
 *
 * Why `slotAttrs` exists: TypeScript only skips checking hyphenated names for
 * *JSX attributes*. `<Tab data-focusable />` is fine, but the same key written
 * inline in a typed `slotProps` object is an excess property and fails to
 * compile. Passing the object through this identity helper turns the check
 * into plain assignability, which every optional-prop slot type accepts.
 */
import { useSpatialEvent } from 'spatial-nav-css/react'

export const slotAttrs = <T extends Record<string, string>>(attrs: T): T => attrs

/**
 * Close an overlay on the back intent.
 *
 * MUI's Modal already closes on a real `Escape` keydown and calls
 * `stopPropagation()`, so the keyboard adapter never sees that key while an
 * overlay is open — no double handling. What it does not cover is a remote's
 * BACK or a gamepad B: those adapters dispatch a semantic intent that never
 * becomes a keydown. Bound at the document because the overlay lives in a
 * portal, outside this component's DOM subtree.
 */
export function useSpatialBack(active: boolean, close: () => void): void {
  useSpatialEvent('spatial:back', (event) => {
    if (!active) return
    event.preventDefault()
    close()
  })
}
