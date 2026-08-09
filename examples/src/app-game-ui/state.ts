/**
 * Game state.
 *
 * Unlike the other app examples this one is deliberately NOT fetch-backed:
 * a pause menu, an inventory and a skill tree are client state in every real
 * game, and pretending otherwise would teach the wrong thing. What it does
 * stress is geometry — irregular grids, ability slots arranged around a
 * portrait, and a diagonal skill tree — which is where a spatial engine's
 * scoring actually earns its keep.
 */
import { useCallback, useMemo, useState } from 'react'

export interface Item {
  id: string
  name: string
  kind: 'weapon' | 'armor' | 'consumable' | 'material'
  /** Grid footprint in cells. Weapons are 2 wide; everything else is 1×1. */
  w: number
  h: number
  qty: number
}

export interface SkillNode {
  id: string
  name: string
  tier: number
  /** Horizontal position within its tier, 0..1 — tiers are staggered. */
  offset: number
  cost: number
  requires: string[]
}

const ITEMS: Item[] = [
  { id: 'i1', name: 'Ashwood Bow', kind: 'weapon', w: 2, h: 1, qty: 1 },
  { id: 'i2', name: 'Iron Greaves', kind: 'armor', w: 1, h: 1, qty: 1 },
  { id: 'i3', name: 'Salve', kind: 'consumable', w: 1, h: 1, qty: 7 },
  { id: 'i4', name: 'Ember Blade', kind: 'weapon', w: 2, h: 1, qty: 1 },
  { id: 'i5', name: 'Cinder', kind: 'material', w: 1, h: 1, qty: 24 },
  { id: 'i6', name: 'Warding Charm', kind: 'armor', w: 1, h: 1, qty: 2 },
  { id: 'i7', name: 'Tonic', kind: 'consumable', w: 1, h: 1, qty: 3 },
  { id: 'i8', name: 'Glass Shard', kind: 'material', w: 1, h: 1, qty: 11 },
]

export const SKILLS: SkillNode[] = [
  { id: 's1', name: 'Footwork', tier: 0, offset: 0.5, cost: 1, requires: [] },
  { id: 's2', name: 'Riposte', tier: 1, offset: 0.2, cost: 1, requires: ['s1'] },
  { id: 's3', name: 'Guard Break', tier: 1, offset: 0.8, cost: 2, requires: ['s1'] },
  { id: 's4', name: 'Bleed', tier: 2, offset: 0.1, cost: 2, requires: ['s2'] },
  { id: 's5', name: 'Momentum', tier: 2, offset: 0.5, cost: 3, requires: ['s2', 's3'] },
  { id: 's6', name: 'Execute', tier: 2, offset: 0.9, cost: 3, requires: ['s3'] },
]

export const ABILITY_SLOTS = ['Q', 'W', 'E', 'R'] as const

export function useGameState() {
  const [points, setPoints] = useState(6)
  const [learned, setLearned] = useState<string[]>(['s1'])
  const [equipped, setEquipped] = useState<Record<string, string | null>>({
    Q: 'i1',
    W: null,
    E: 'i3',
    R: null,
  })
  const [log, setLog] = useState<string>('Paused')

  const items = useMemo(() => ITEMS, [])

  const canLearn = useCallback(
    (skill: SkillNode) =>
      !learned.includes(skill.id) &&
      skill.cost <= points &&
      skill.requires.every((id) => learned.includes(id)),
    [learned, points],
  )

  const learn = useCallback(
    (skill: SkillNode) => {
      if (!canLearn(skill)) {
        setLog(`${skill.name} is locked`)
        return
      }
      setPoints((p) => p - skill.cost)
      setLearned((l) => [...l, skill.id])
      setLog(`Learned ${skill.name}`)
    },
    [canLearn],
  )

  const equip = useCallback(
    (slot: string, item: Item) => {
      setEquipped((e) => ({ ...e, [slot]: item.id }))
      setLog(`${item.name} → ${slot}`)
    },
    [],
  )

  return { points, learned, equipped, items, log, canLearn, learn, equip, setLog }
}
