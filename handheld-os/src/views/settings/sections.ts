/** The category rail's contents, and the deep-link mapping onto it. */

export const SECTIONS = [
  { id: 'display', label: 'Display', glyph: '☀' },
  { id: 'performance', label: 'Performance', glyph: '◱' },
  { id: 'audio', label: 'Audio', glyph: '♪' },
  { id: 'network', label: 'Network', glyph: '≋' },
  { id: 'storage', label: 'Storage', glyph: '▤' },
  { id: 'system', label: 'System', glyph: '⚙' },
  { id: 'developer', label: 'Developer', glyph: '⌥' },
  { id: 'about', label: 'About', glyph: 'ⓘ' },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']

export const DEFAULT_SECTION: SectionId = 'display'

/**
 * `ViewEntry` carries the section as a plain string, because a deep link can
 * come from a notification, a search result or a restored session — none of
 * which are type-checked against this list. An unknown value falls back rather
 * than rendering an empty panel.
 */
export function normalizeSection(section: string | undefined): SectionId {
  const match = SECTIONS.find((entry) => entry.id === section)
  return match ? match.id : DEFAULT_SECTION
}

export function sectionLabel(id: SectionId): string {
  return SECTIONS.find((entry) => entry.id === id)?.label ?? 'Settings'
}
