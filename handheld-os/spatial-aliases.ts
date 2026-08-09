import { fileURLToPath, URL } from 'node:url'

const src = (path: string) => fileURLToPath(new URL(`../src/${path}`, import.meta.url))

// The harness deliberately consumes source instead of a packed build so its
// application-shaped tests exercise each local engine change immediately.
export const spatialAliases = {
  'spatial-nav-css/react': src('react/index.ts'),
  'spatial-nav-css/virtual': src('virtual/index.ts'),
  'spatial-nav-css/dialogs': src('dialogs/index.ts'),
  'spatial-nav-css/debug': src('debug/index.ts'),
  'spatial-nav-css/css': fileURLToPath(new URL('../css/spatial.css', import.meta.url)),
  'spatial-nav-css': src('index.ts'),
}
