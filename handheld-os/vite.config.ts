import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { spatialAliases } from './spatial-aliases'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
  },
  preview: {
    port: 5180,
    strictPort: true,
  },
  resolve: {
    alias: spatialAliases,
    // The library is aliased to source *outside* this package root, so its
    // `import 'react'` resolves against the repository root's node_modules
    // while the app's resolves here — two React copies, and every hook the
    // adapter calls throws "Invalid hook call". Dedupe pins one.
    dedupe: ['react', 'react-dom'],
  },
  // Storybook's browser tests consume these CommonJS builds through Testing
  // Library and its preview state. Pre-bundle them for native ESM.
  optimizeDeps: {
    include: ['aria-query', 'lz-string', 'pretty-format'],
  },
  build: {
    // The app awaits the mock service worker before first paint.
    target: 'esnext',
  },
})
