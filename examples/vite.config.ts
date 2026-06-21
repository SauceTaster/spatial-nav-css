import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'

const src = (p: string) => fileURLToPath(new URL(`../src/${p}`, import.meta.url))

// The examples consume the library *source* directly through these aliases, so
// nothing here needs a build step — `npm test` and `npm run dev` both run
// against ../src. (End users install the published package; the README shows
// the real import lines. Export-map correctness is guarded by the root's
// `check:package`.)
const spatialAliases = {
  'spatial-nav-css/react-aria': src('react-aria/index.ts'),
  'spatial-nav-css/react': src('react/index.ts'),
  'spatial-nav-css/vue': src('vue/index.ts'),
  'spatial-nav-css/svelte': src('svelte/index.ts'),
  'spatial-nav-css/elements': src('elements/index.ts'),
  'spatial-nav-css/virtual': src('virtual/index.ts'),
  'spatial-nav-css/dialogs': src('dialogs/index.ts'),
  'spatial-nav-css/debug': src('debug/index.ts'),
  'spatial-nav-css/css': fileURLToPath(new URL('../css/spatial.css', import.meta.url)),
  'spatial-nav-css': src('index.ts'),
  // ECharts' prebundle imports tslib's default export, but tslib's ESM build
  // (picked by the `module` condition) has only named exports. Pin tslib to its
  // CJS build so esbuild's interop produces a real default. Known Vite quirk.
  tslib: 'tslib/tslib.js',
}

const page = (name: string) => fileURLToPath(new URL(`./${name}.html`, import.meta.url))

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        react: page('react'),
        vue: page('vue'),
        svelte: page('svelte'),
        'react-aria': page('react-aria'),
        'web-components': page('web-components'),
        vanilla: page('vanilla'),
        'tanstack-table': page('tanstack-table'),
        echarts: page('echarts'),
        'react-flow': page('react-flow'),
      },
    },
  },
  plugins: [
    react(),
    vue(),
    // The example deliberately reads `options`/`onReady` props once at init;
    // silence only that advisory, keep every other Svelte warning.
    svelte({
      onwarn(warning, handler) {
        if (warning.code === 'state_referenced_locally') return
        handler?.(warning)
      },
    }),
    svelteTesting(),
  ],
  resolve: {
    alias: spatialAliases,
    // Svelte 5 + @testing-library/svelte need the browser condition in jsdom.
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/shared/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
