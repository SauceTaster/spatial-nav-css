/**
 * Game pause screen — inventory, ability slots, and a skill tree.
 *
 * Every region here is deliberately *not* a tidy grid, because tidy grids are
 * the easy case:
 *  - the inventory mixes 1×1 and 2×1 items, so rows do not line up;
 *  - ability slots sit around a portrait rather than in a line;
 *  - the skill tree is staggered by tier, so "up" from a node is a diagonal.
 *
 * That makes it the best exercise in the suite for the distance function.
 */
import { useState } from 'react'
import { useSpatialEvent } from 'spatial-nav-css/react'
import { AbilityBar, InventoryGrid, PauseMenu, SkillTree } from './components'
import { useGameState } from './state'
import type { Item } from './state'

type Tab = 'inventory' | 'skills'

export function App() {
  const game = useGameState()
  const [tab, setTab] = useState<Tab>('inventory')
  const [carried, setCarried] = useState<Item | null>(null)

  useSpatialEvent('spatial:nofocustarget', (event) => {
    // In a real game this is where a rail would bounce or a sound would play.
    game.setLog(`Edge: ${event.detail.direction}`)
  })

  return (
    <div className="gu-root">
      <div className="gu-hud">
        {/*
          The pause menu is a `remember` column: coming back from the
          inventory should land on the entry you left, not the top.
          Not `contain` — the player must be able to cross into the panels.
        */}
        <PauseMenu tab={tab} onTab={setTab} onResume={() => game.setLog('Resuming…')} />

        <main className="gu-panel">
          <header className="gu-panel-head">
            <h2>{tab === 'inventory' ? 'Inventory' : 'Skills'}</h2>
            <p className="gu-points" data-testid="points">
              {tab === 'skills' ? `${game.points} points` : `${game.items.length} items`}
            </p>
          </header>

          {tab === 'inventory' ? (
            <InventoryGrid
              items={game.items}
              carried={carried}
              onPick={(item) => {
                setCarried(item)
                game.setLog(`Carrying ${item.name}`)
              }}
            />
          ) : (
            <SkillTree
              learned={game.learned}
              canLearn={game.canLearn}
              onLearn={game.learn}
            />
          )}
        </main>

        <AbilityBar
          equipped={game.equipped}
          items={game.items}
          onSlot={(slot) => {
            if (carried) {
              game.equip(slot, carried)
              setCarried(null)
            } else {
              game.setLog(`${slot} slot`)
            }
          }}
        />
      </div>

      <footer className="gu-log" data-testid="log">
        {game.log}
      </footer>
    </div>
  )
}
