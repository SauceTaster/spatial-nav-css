import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureRoot = join(repoRoot, 'tests/compat/react17')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`)
  }
  return result.stdout ?? ''
}

const packRoot = await mkdtemp(join(tmpdir(), 'spatial-nav-css-react17-'))
const consumerRoot = join(packRoot, 'consumer')

try {
  await mkdir(consumerRoot)
  await Promise.all(
    ['package.json', 'package-lock.json', 'tsconfig.json', 'smoke.tsx'].map((file) =>
      copyFile(join(fixtureRoot, file), join(consumerRoot, file)),
    ),
  )
  const packOutput = run(
    npmCommand,
    ['pack', '--ignore-scripts', '--json', '--pack-destination', packRoot],
    repoRoot,
    true,
  )
  const [packed] = JSON.parse(packOutput)
  if (!packed?.filename) throw new Error('npm pack did not report an output filename')

  run(npmCommand, ['ci'], consumerRoot)
  run(
    npmCommand,
    [
      'install',
      '--no-save',
      '--package-lock=false',
      '--ignore-scripts',
      join(packRoot, packed.filename),
    ],
    consumerRoot,
  )
  run(
    process.execPath,
    [join(consumerRoot, 'node_modules/typescript/bin/tsc'), '-p', consumerRoot, '--pretty', 'false'],
    repoRoot,
  )
} finally {
  await rm(packRoot, { recursive: true, force: true })
}
