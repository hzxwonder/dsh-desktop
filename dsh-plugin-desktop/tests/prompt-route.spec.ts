import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { PromptStore } from '../src/prompt-store.ts'
import { handlePromptRequest } from '../src/prompt-route.ts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of cleanup.splice(0)) await dispose() })
it('allows same-origin storage requests and rejects external origins and oversized bodies', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prompt-route-'))
  const store = new PromptStore(join(directory, 'prompts.json'))
  let origin = ''
  const server = createServer((req, res) => { void handlePromptRequest(req, res, origin, store) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }) })
  const post = (body: string, caller = origin) => fetch(origin, { method: 'POST', headers: { origin: caller, 'content-type': 'application/json' }, body })
  expect((await post(JSON.stringify({ action: 'create', name: '示例', content: '正文' })))).toHaveProperty('status', 200)
  const read = await fetch(origin, { headers: { origin } })
  expect((await read.json()).prompts).toHaveLength(1)
  expect((await post('{}', 'https://other.example')).status).toBe(403)
  expect((await fetch(origin)).status).toBe(403)
  expect((await post('not json')).status).toBe(400)
  expect((await post('x'.repeat(512001))).status).toBe(413)
  expect((await fetch(origin, { method: 'DELETE', headers: { origin } })).status).toBe(405)
})
