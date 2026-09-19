/** Loopback-only prompt library API. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isSameOriginLoopbackRequest } from './desktop-settings-route.ts'
import type { PromptStore } from './prompt-store.ts'

export async function handlePromptRequest(req: IncomingMessage, res: ServerResponse, origin: string, store: PromptStore): Promise<void> {
  const reply = (status: number, body: object): void => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
    res.end(JSON.stringify(body))
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('allow', 'GET, POST')
    return reply(405, { error: 'Method not allowed' })
  }
  if (!isSameOriginLoopbackRequest(req, origin, req.method === 'POST')) return reply(403, { error: 'Forbidden' })
  try {
    if (req.method === 'GET') return reply(200, { prompts: await store.list() })
    if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, { error: 'Expected application/json' })
    let size = 0
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk as Uint8Array)
      size += buffer.length
      if (size > 512_000) return reply(413, { error: '内容过长。' })
      chunks.push(buffer)
    }
    let request: unknown
    try { request = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return reply(400, { error: '无效 JSON。' }) }
    try { return reply(200, { prompts: await store.change(request) }) } catch {
      return reply(400, { error: '保存失败：请检查名称是否重复、内容是否为空或过长，以及数据目录是否可写。' })
    }
  } catch { reply(500, { error: '提示词读取失败，请检查数据文件后重试。' }) }
}
