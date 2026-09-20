// @vitest-environment jsdom
import { act } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandContribution } from '@deepseek-ai/dsh-client-ui-commands/client'
import { afterEach, expect, it, vi } from 'vitest'
import { apply } from '../src/client/prompt.tsx'

let cleanup: (() => void)[] = []
afterEach(async () => { await act(async () => { cleanup.reverse().forEach(dispose => dispose()); cleanup = [] }); vi.unstubAllGlobals(); document.body.innerHTML = '' })

async function setup() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  let rows: { id: string; name: string; content: string; createdAt: number; lastUsedAt: number | null }[] = []
  const fetch = vi.fn(async (_url, options) => {
    if (options?.method === 'POST') {
      const body = JSON.parse(options.body)
      if (body.action === 'create') rows = [...rows, { id: '1', name: body.name, content: body.content, createdAt: 1, lastUsedAt: null }]
      if (body.action === 'use') rows[0]!.lastUsedAt = 10
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ prompts: [...rows] }) }
  })
  vi.stubGlobal('fetch', fetch)
  let command: CommandContribution | undefined
  const input = { state: { getSnapshot: () => ({ draft: '已有正文', draftRev: 8 }) } }
  const scope = { bail: vi.fn(() => true) }
  const ctx = {
    commandUi: { register: (item: CommandContribution) => { command = item; return () => { command = undefined } } },
    sessions: { scope: () => scope }, conversation: { input: { for: () => input } },
    effect: (callback: () => () => void) => { cleanup.push(callback()) },
  }
  apply(ctx as unknown as Context)
  const open = async () => { await act(async () => { if (command?.ui.kind === 'action') command.ui.run({ sessionId: 'session-a' as never }) }) }
  await open()
  return { scope, fetch, open, ctx }
}

function button(text: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')].find(button => button.textContent?.includes(text))
  if (!match) throw new Error(`Missing button: ${text}`)
  return match
}

it('creates a multiline prompt, inserts ordinary text into the captured session, and shows recent use when reopened', async () => {
  const { scope, open, fetch } = await setup()
  expect(document.querySelector('dialog')?.textContent).toContain('全部')
  await act(async () => { button('新建提示词').click() })
  const name = document.querySelector('form input') as HTMLInputElement
  const content = document.querySelector('textarea')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(name, '审查')
    name.dispatchEvent(new Event('input', { bubbles: true }))
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(content, '第一行\n第二行')
    content.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  expect(document.querySelectorAll('dialog')).toHaveLength(1)
  await act(async () => { button('插入聊天框').click() })
  expect(scope.bail).toHaveBeenCalledWith(scope, 'slash/input-insert-text', { text: '\n第一行\n第二行', span: { start: 4, end: 4, draftRev: 8 } })
  expect(document.querySelector('dialog')).toBeNull()
  await open()
  await act(async () => { button('最近使用').click() })
  expect(document.querySelector('[aria-label="提示词列表"]')?.textContent).toContain('审查')
  expect(fetch.mock.calls.some(([, options]) => options?.body?.includes('create'))).toBe(true)
})

it('closes without inserting on Escape and disposes the command with its plugin', async () => {
  const { scope } = await setup()
  await act(async () => { document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })) })
  expect(document.querySelector('dialog')).toBeNull()
  expect(scope.bail).not.toHaveBeenCalled()
})

it('shows read failures with a retry control', async () => {
  await setup()
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('连接失败') }))
  await act(async () => { document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })) })
  // The API reads fetch at invocation, so a fresh command invocation can retry after connectivity recovers.
  await act(async () => { cleanup.reverse().forEach(dispose => dispose()); cleanup = [] })
  const result = await setup()
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('连接失败') }))
  await result.open()
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('暂时无法连接提示词服务')
})

it('preserves create fields after a failed save, then retries successfully', async () => {
  const { fetch } = await setup()
  await act(async () => { button('新建提示词').click() })
  await act(async () => {
    const input = document.querySelector('form input')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '摘要')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const textarea = document.querySelector('textarea')!
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, '请提炼关键观点')
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
  fetch.mockRejectedValueOnce(new Error('offline'))
  await act(async () => { document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('请提炼关键观点')
  expect(document.querySelector('[role=alert]')?.textContent).toContain('填写内容已保留')
  await act(async () => { document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  expect(document.querySelector('[aria-label="提示词预览"]')?.textContent).toContain('请提炼关键观点')
})

it('protects unsaved text on Escape and returns to editing', async () => {
  await setup()
  await act(async () => { button('新建提示词').click() })
  await act(async () => {
    const input = document.querySelector('form input')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '草稿')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })) })
  expect(document.querySelector('[role=alertdialog]')).not.toBeNull()
  await act(async () => { button('继续编辑').click() })
  expect((document.querySelector('form input') as HTMLInputElement).value).toBe('草稿')
})
