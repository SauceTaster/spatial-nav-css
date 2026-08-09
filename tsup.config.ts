import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'react/index': 'src/react/index.ts',
      'react-aria/index': 'src/react-aria/index.ts',
      'vue/index': 'src/vue/index.ts',
      'svelte/index': 'src/svelte/index.ts',
      'elements/index': 'src/elements/index.ts',
      'virtual/index': 'src/virtual/index.ts',
      'dialogs/index': 'src/dialogs/index.ts',
      'debug/index': 'src/debug/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2020',
    platform: 'browser',
    external: ['react', 'vue'],
  },
  {
    // CDN/script-tag bundle: window.SpatialNav with the framework-free
    // surface (core + elements + dialogs + virtual + debug). Runs after the
    // main config, so `clean` must stay off here.
    entry: { 'spatial-nav': 'src/global.ts' },
    format: ['iife'],
    globalName: 'SpatialNav',
    minify: true,
    sourcemap: true,
    clean: false,
    target: 'es2020',
    platform: 'browser',
  },
])
