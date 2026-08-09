/**
 * Entry for the IIFE/CDN bundle (dist/spatial-nav.global.js) exposed as
 * `window.SpatialNav`. Bundles the framework-free surface — core, custom
 * elements, dialogs, virtual-list helper, debug overlay — so a plain
 * <script> tag gets the whole toolkit:
 *
 *   <link rel="stylesheet" href="https://unpkg.com/spatial-nav-css/css/spatial.css">
 *   <script src="https://unpkg.com/spatial-nav-css"></script>
 *   <script>
 *     SpatialNav.createSpatialNavigation({ autofocus: true }).start()
 *   </script>
 *
 * Framework adapters (react/vue/svelte/react-aria) are deliberately not
 * included; module users import subpaths instead.
 */
export * from './index'
export { defineSpatialElements, SpatialNavElement, SpatialContainerElement } from './elements'
export type { DefineSpatialElementsOptions } from './elements'
export { spatialAlert, spatialConfirm } from './dialogs'
export type { SpatialAlertOptions, SpatialConfirmOptions } from './dialogs'
export { attachVirtualEdges } from './virtual'
export type { FocusHost, VirtualEdgeOptions } from './virtual'
export { attachDebugOverlay } from './debug'
export type { DebugOverlayOptions, DebugOverlayHandle } from './debug'
