/**
 * The shell in Storybook. These are the stories that are genuinely hard to
 * cover in jsdom: layering, containment, and what the focus ring looks like at
 * arm's length.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { OsShell } from './OsShell'
import { useShell } from '../state/shell'

function ShellWith({ setup }: { setup?: () => void }) {
  useEffect(() => {
    // Each story starts from a known shell state.
    useShell.setState({ views: [{ id: 'home' }], overlays: [], notice: null })
    setup?.()
  }, [setup])
  return <OsShell />
}

const meta: Meta<typeof ShellWith> = {
  title: 'OS/Shell',
  component: ShellWith,
}
export default meta

type Story = StoryObj<typeof ShellWith>

export const Home: Story = {}

export const QuickAccessOpen: Story = {
  args: {
    setup: () => useShell.getState().openQuickAccess('performance'),
  },
  parameters: {
    docs: {
      description: {
        story:
          'The screen behind is `inert`, which the engine honours unconditionally — arrow keys cannot reach it, and neither can Tab or a pointer. Try it.',
      },
    },
  },
}

export const QuickAccessPower: Story = {
  args: { setup: () => useShell.getState().openQuickAccess('power') },
}

export const DeepStack: Story = {
  args: {
    setup: () => {
      const { push } = useShell.getState()
      push({ id: 'library' })
      push({ id: 'game', gameId: 'game-3' })
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Back (Escape) pops one view at a time; the status bar shows the stack.',
      },
    },
  },
}

export const ConfirmDestructive: Story = {
  args: {
    setup: () => {
      void useShell.getState().confirm({
        title: 'Uninstall',
        message: 'Remove this game and its local files?',
        confirmLabel: 'Uninstall',
        destructive: true,
      })
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Cancel holds focus on open. On a handheld the activate button is often still held from whatever opened the dialog, and a destructive default would fire on the carry-through.',
      },
    },
  },
}
