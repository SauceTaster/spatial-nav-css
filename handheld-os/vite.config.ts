import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const src = (p: string) => fileURLToPath(new URL(`../src/${p}`, import.meta.url))

// Consumes the library source directly, so there is no build step between a
// library change and this app. Published consumers use the package name; the
// export map itself is guarded by the root package's `check:package`.
const spatialAliases = {
  'spatial-nav-css/react': src('react/index.ts'),
  'spatial-nav-css/virtual': src('virtual/index.ts'),
  'spatial-nav-css/dialogs': src('dialogs/index.ts'),
  'spatial-nav-css/debug': src('debug/index.ts'),
  'spatial-nav-css/css': fileURLToPath(new URL('../css/spatial.css', import.meta.url)),
  'spatial-nav-css': src('index.ts'),
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: spatialAliases,
    // The library is aliased to source *outside* this package root, so its
    // `import 'react'` resolves against the repository root's node_modules
    // while the app's resolves here — two React copies, and every hook the
    // adapter calls throws "Invalid hook call". Dedupe pins one.
    dedupe: ['react', 'react-dom'],
  },
  build: {
    // The app awaits the mock service worker before first paint.
    target: 'esnext',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // These suites mount whole screens — hundreds of nodes, a query cache and
    // a live navigation engine each — and run in parallel. The 5s default is
    // headroom for a `waitFor`, not a statement about how long the work takes;
    // on a loaded machine it starts failing tests that pass in isolation.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
