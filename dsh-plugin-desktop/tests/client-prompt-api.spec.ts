import { afterEach, expect, it, vi } from 'vitest'
import { createPromptApi } from '../src/client/prompt-api.ts'
afterEach(() => vi.unstubAllGlobals())
it.each([
  [404, '', '提示词服务尚未就绪'], [200, '', '提示词服务返回异常'], [200, '<html>not json</html>', '提示词服务返回异常'],
  [401, '', '当前连接已失效'], [403, 'forbidden', '当前连接已失效'], [200, '{}', '提示词数据读取异常'],
  [400, '{"error":"此名称已存在"}', '此名称已存在'], [200, '{"prompts":[{}]}', '提示词数据读取异常'],
])('handles status %i and malformed payloads with actionable copy', async (status, body, message) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })))
  await expect(createPromptApi().list()).rejects.toThrow(message)
})
it('uses authenticated same-origin requests with bounded timeouts', async () => {
  const fetch = vi.fn(async () => new Response('{"prompts":[]}', { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  await expect(createPromptApi().create('Name', 'Body')).resolves.toEqual([])
  expect(fetch).toHaveBeenCalledWith('/_desktop/prompts', expect.objectContaining({ credentials: 'same-origin', redirect: 'error', method: 'POST', signal: expect.any(AbortSignal) }))
})
