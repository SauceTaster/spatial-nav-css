// Generates llms-full.txt — the complete documentation set in one file for
// LLM consumption (https://llmstxt.org). llms.txt (the curated index) is
// maintained by hand; this file is regenerated so it cannot drift from docs/.
//
//   node scripts/build-llms.mjs           # write llms-full.txt
//   node scripts/build-llms.mjs --check   # exit 1 if llms-full.txt is stale
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Reading order mirrors how a person would learn the library.
const SOURCES = [
  'README.md',
  'docs/guide.md',
  'docs/css-api.md',
  'docs/js-api.md',
  'docs/frameworks.md',
  'docs/input-devices.md',
  'docs/recipes.md',
  'docs/virtualization.md',
  'docs/performance.md',
  'docs/edge-cases.md',
]

const banner = `<!--
  spatial-nav-css — full documentation in a single file, for LLMs and other
  tools that want the whole picture at once. Generated from README.md and
  docs/ by scripts/build-llms.mjs; do not edit by hand. The curated index
  lives in llms.txt.
-->`

const sections = SOURCES.map((path) => {
  const body = readFileSync(join(root, path), 'utf8').trimEnd()
  return `<!-- source: ${path} -->\n\n${body}`
})

const output = `${banner}\n\n${sections.join('\n\n---\n\n')}\n`
const target = join(root, 'llms-full.txt')

if (process.argv.includes('--check')) {
  let existing = null
  try {
    existing = readFileSync(target, 'utf8')
  } catch {
    // Missing counts as stale.
  }
  if (existing !== output) {
    console.error('llms-full.txt is stale. Run `npm run build:llms` and commit the result.')
    process.exit(1)
  }
  console.log('llms-full.txt is up to date.')
} else {
  writeFileSync(target, output)
  console.log(
    `Wrote llms-full.txt (${output.length.toLocaleString()} bytes from ${SOURCES.length} sources).`,
  )
}
