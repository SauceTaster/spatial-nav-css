import type { StorybookConfig } from '@storybook/react-vite'
import { mergeConfig } from 'vite'
import { spatialAliases } from '../spatial-aliases.ts'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: { name: '@storybook/react-vite', options: {} },
  // The MSW service worker is served from here, so stories hit the same
  // device services the app does.
  staticDirs: ['../public'],
  viteFinal: (config) =>
    mergeConfig(config, {
      resolve: {
        alias: spatialAliases,
        dedupe: ['react', 'react-dom'],
      },
    }),
}

export default config
