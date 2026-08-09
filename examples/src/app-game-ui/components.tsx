import { useFocusable } from 'spatial-nav-css/react'
import { ABILITY_SLOTS, SKILLS, type Item, type SkillNode } from './state'

export function PauseMenu({
  tab,
  onTab,
  onResume,
}: {
  tab: string
  onTab: (tab: 'inventory' | 'skills') => void
  onResume: () => void
}) {
  return (
    <nav className="gu-menu" data-spatial-container="remember" data-testid="menu">
      <button type="button" className="gu-menu-item" data-testid="menu-item" onClick={onResume}>
        Resume
      </button>
      <button
        type="button"
        className={`gu-menu-item${tab === 'inventory' ? ' is-active' : ''}`}
        data-testid="menu-item"
        onClick={() => onTab('inventory')}
      >
        Inventory
      </button>
      <button
        type="button"
        className={`gu-menu-item${tab === 'skills' ? ' is-active' : ''}`}
        data-testid="menu-item"
        onClick={() => onTab('skills')}
      >
        Skills
      </button>
      <button type="button" className="gu-menu-item" data-testid="menu-item">
        Options
      </button>
      <button type="button" className="gu-menu-item" data-testid="menu-item">
        Quit
      </button>
    </nav>
  )
}

function ItemCell({
  item,
  carried,
  onPick,
}: {
  item: Item
  carried: boolean
  onPick: (item: Item) => void
}) {
  const { ref, focused } = useFocusable<HTMLButtonElement>({ onActivate: () => onPick(item) })
  return (
    <button
      ref={ref}
      type="button"
      // Style from our own flag; the engine's ring rides on
      // [data-spatial-focused], which React re-renders cannot clobber.
      className={`gu-item gu-item-${item.kind}${focused ? ' is-focused' : ''}${carried ? ' is-carried' : ''}`}
      style={{ gridColumn: `span ${item.w}` }}
      data-testid="item"
      data-item-id={item.id}
      onClick={() => onPick(item)}
    >
      <span className="gu-item-name">{item.name}</span>
      {item.qty > 1 ? <span className="gu-item-qty">×{item.qty}</span> : null}
    </button>
  )
}

export function InventoryGrid({
  items,
  carried,
  onPick,
}: {
  items: Item[]
  carried: Item | null
  onPick: (item: Item) => void
}) {
  return (
    // `remember` so switching tabs and coming back returns to the same cell.
    <div className="gu-inventory" data-spatial-container="remember" data-testid="inventory">
      {items.map((item) => (
        <ItemCell key={item.id} item={item} carried={carried?.id === item.id} onPick={onPick} />
      ))}
    </div>
  )
}

export function SkillTree({
  learned,
  canLearn,
  onLearn,
}: {
  learned: string[]
  canLearn: (skill: SkillNode) => boolean
  onLearn: (skill: SkillNode) => void
}) {
  const tiers = [0, 1, 2]
  return (
    <div className="gu-tree" data-spatial-container="remember" data-testid="tree">
      {tiers.map((tier) => (
        <div className="gu-tier" key={tier}>
          {SKILLS.filter((skill) => skill.tier === tier).map((skill) => {
            const owned = learned.includes(skill.id)
            return (
              <button
                key={skill.id}
                type="button"
                // Staggered horizontally: "up" from a node is usually a
                // diagonal, which is exactly the case the distance function
                // has to get right.
                style={{ marginInlineStart: `${skill.offset * 60}%` }}
                className={`gu-node${owned ? ' is-owned' : ''}${canLearn(skill) ? ' is-available' : ''}`}
                data-testid="skill"
                data-skill-id={skill.id}
                onClick={() => onLearn(skill)}
              >
                <span className="gu-node-name">{skill.name}</span>
                <span className="gu-node-cost">{owned ? 'owned' : `${skill.cost} pt`}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function AbilityBar({
  equipped,
  items,
  onSlot,
}: {
  equipped: Record<string, string | null>
  items: Item[]
  onSlot: (slot: string) => void
}) {
  return (
    <div className="gu-abilities" data-spatial-container="remember" data-testid="abilities">
      {ABILITY_SLOTS.map((slot) => {
        const item = items.find((entry) => entry.id === equipped[slot])
        return (
          <button
            key={slot}
            type="button"
            className="gu-slot"
            data-testid="slot"
            data-slot={slot}
            onClick={() => onSlot(slot)}
          >
            <span className="gu-slot-key">{slot}</span>
            <span className="gu-slot-item">{item ? item.name : 'empty'}</span>
          </button>
        )
      })}
    </div>
  )
}
