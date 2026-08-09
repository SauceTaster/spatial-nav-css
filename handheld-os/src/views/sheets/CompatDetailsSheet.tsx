/**
 * What a compatibility rating actually means, per rating — the panel a store
 * badge links to when the user asks "playable how?".
 */
import { useQuery } from '@tanstack/react-query'
import { osQueries } from '../../services/api'
import type { Game } from '../../services/device'
import type { SheetSpec } from '../../state/shell'
import './sheets.css'

/** Payload values are `unknown`; a missing or wrong-typed id renders empty. */
const idFrom = (payload: Record<string, unknown> | undefined, key: string): string | null => {
  const value = payload?.[key]
  return typeof value === 'string' && value !== '' ? value : null
}

const RATINGS: Record<Game['compat'], { title: string; summary: string; notes: string[] }> = {
  verified: {
    title: 'Verified',
    summary: 'Works out of the box on this handheld.',
    notes: [
      'Runs at the default TDP with no per-game tweaks.',
      'All in-game text is legible at this screen size.',
      'The controller works without touching the desktop.',
    ],
  },
  playable: {
    title: 'Playable',
    summary: 'Works, but expect to change something first.',
    notes: [
      'May need a controller layout or a compatibility layer.',
      'Some launchers and cutscenes want the on-screen keyboard.',
      'Small text is likely in menus.',
    ],
  },
  unsupported: {
    title: 'Unsupported',
    summary: 'Does not currently run on this device.',
    notes: [
      'Usually an anti-cheat that refuses to load under Proton.',
      'Nothing you can configure will change this today.',
      'It can be reinstalled if the publisher ships support later.',
    ],
  },
  unknown: {
    title: 'Not yet reviewed',
    summary: 'Nobody has checked this one on this hardware.',
    notes: [
      'It may work perfectly; nothing has been verified.',
      'Cloud saves and controller layouts are untested.',
    ],
  },
}

export function CompatDetailsSheet({ spec }: { spec: SheetSpec }) {
  const gameId = idFrom(spec.payload, 'gameId')
  const game = useQuery({ ...osQueries.game(gameId ?? ''), enabled: gameId !== null })

  if (!gameId) {
    return (
      <p className="os-dim" data-testid="sheet-empty">
        No game was passed to this sheet.
      </p>
    )
  }
  if (game.isPending) return <p className="os-dim">Loading…</p>
  if (!game.data) {
    return (
      <p className="os-dim" data-testid="sheet-empty">
        That game is no longer on this device.
      </p>
    )
  }

  const rating = RATINGS[game.data.compat]

  return (
    <div className="sh-body" data-testid="sheet-compat-details">
      <p className="sh-lede">
        <strong data-testid="sheet-compat-rating">{rating.title}</strong>
        <small className="os-dim" data-testid="sheet-compat-summary">
          {game.data.title} · {rating.summary}
        </small>
      </p>
      <ul className="sh-notes" data-testid="sheet-compat-notes">
        {rating.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      {/*
        No focusable content: this sheet is reading, and the sheet wrapper's
        Close button is the only stop. Adding a decorative focus stop here
        would give the D-pad somewhere pointless to go.
      */}
    </div>
  )
}
