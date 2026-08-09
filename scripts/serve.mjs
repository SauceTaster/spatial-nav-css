// Zero-dependency static server for the demo: `npm run demo`
import { createServer } from 'node:http'
import { readFile, realpath } from 'node:fs/promises'
import { extname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const port = Number(process.env.PORT ?? 4173)
const allowedRoots = ['demo', 'dist', 'css'].map((directory) => join(root, directory))

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (path.endsWith('/')) path += 'index.html'
    const file = join(root, path)
    const resolved = await realpath(file)
    const allowed = allowedRoots.some((allowedRoot) => {
      const rel = relative(allowedRoot, resolved)
      return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
    })
    if (!allowed) throw new Error('forbidden')
    const body = await readFile(resolved)
    res.writeHead(200, {
      'content-type': types[extname(resolved)] ?? 'application/octet-stream',
      'cache-control': 'no-store', // dev server: always serve the latest build
      'x-content-type-options': 'nosniff',
    })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`demo: http://localhost:${port}/demo/`)
})
