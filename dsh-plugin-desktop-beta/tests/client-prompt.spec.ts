// @vitest-environment jsdom
import { act } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
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
      if (body.action === 'update') rows = rows.map(row => row.id === body.id ? {...row,name:body.name,content:body.content} : row)
      if (body.action === 'delete') rows = rows.filter(row => row.id !== body.id)
      if (body.action === 'use') rows[0]!.lastUsedAt = 10
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ prompts: [...rows] }) }
  })
  vi.stubGlobal('fetch', fetch)
  let command: InputTriggerSource | undefined
  const input = { state: { getSnapshot: () => ({ draft: '已有正文', draftRev: 8 }) } }
  const scope = { bail: vi.fn(() => true) }
  const ctx = {
    inputTriggers: { registerSource: (item: InputTriggerSource) => { command = item; return () => { command = undefined } } },
    sessions: { scope: () => scope }, conversation: { input: { for: () => input } },
    effect: (callback: () => () => void) => { cleanup.push(callback()) },
  }
  apply(ctx as unknown as Context)
  const open = async () => { await act(async () => { command?.onPick({ candidate: {name: '新建 Prompt 模板', value: 'manage'}, session: {sessionId: 'session-a' as never}, span: {start: 0,end: 7,draftRev: 8}, position:'leading',via:'menu',action:'pick' }) }) }
  await open()
  scope.bail.mockClear()
  return { scope, fetch, open, ctx, source: command! }
}

function button(text: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')].find(button => button.textContent?.includes(text))
  if (!match) throw new Error(`Missing button: ${text}`)
  return match
}

it('saves a multiline template in the editor and loads it from the sidebar', async () => {
  const { open } = await setup()
  await fill('审查', '第一行\n第二行'); await save()
  expect(document.querySelector('[aria-label="提示词列表"]')?.textContent).toContain('审查')
  expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('第一行\n第二行')
  await act(async () => { document.querySelector('dialog')!.dispatchEvent(new Event('cancel', {cancelable:true})) })
  await open()
  expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('')
  await act(async () => { button('审查').click() })
  expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('第一行\n第二行')
})

async function fill(name: string, content: string) {
  await act(async () => {
    const input = document.querySelector('form input')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, name)
    input.dispatchEvent(new Event('input', {bubbles:true}))
    const textarea = document.querySelector('textarea')!
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, content)
    textarea.dispatchEvent(new Event('input', {bubbles:true}))
  })
}
async function save() { await act(async () => { document.querySelector('form')!.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true})) }) }

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
  await act(async () => { button('新建模板').click() })
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
  expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('请提炼关键观点')
})

it('protects unsaved text on Escape and returns to editing', async () => {
  await setup()
  await act(async () => { button('新建模板').click() })
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

it('lists saved templates in the slash menu and inserts directly without opening a dialog', async () => {
  const { source, scope } = await setup()
  await act(async () => { document.querySelector('dialog')!.dispatchEvent(new Event('cancel', {cancelable:true})) })
  const row = {id:'saved', name:'打招呼', content:'hello\nworld',createdAt:1,lastUsedAt:2}
  vi.stubGlobal('fetch', vi.fn(async () => ({ok:true,status:200,text:async()=>JSON.stringify({prompts:[row]})})))
  const session = {sessionId:'session-a' as never}
  const items = await source.candidates(session,{query:'prompt',signal:new AbortController().signal,position:'leading',drilled:false})
  expect(items.map(item=>item.name)).toEqual(['打招呼','新建 Prompt 模板'])
  scope.bail.mockClear()
  source.onPick({candidate:items[0]!,session,span:{start:3,end:10,draftRev:9},position:'inline',via:'menu',action:'pick'})
  expect(scope.bail).toHaveBeenCalledWith(scope,'slash/input-insert-text',{text:'hello\nworld',span:{start:3,end:10,draftRev:9}})
  expect(document.querySelector('dialog')).toBeNull()
})

it('copies, modifies and deletes a saved template through management controls', async () => {
  await setup()
  await act(async () => { button('新建模板').click() })
  const fill = async (name: string, content: string) => act(async () => {
    const input = document.querySelector('form input')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,name)
    input.dispatchEvent(new Event('input',{bubbles:true}))
    const textarea = document.querySelector('textarea')!
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(textarea,content)
    textarea.dispatchEvent(new Event('input',{bubbles:true}))
  })
  const save = async () => act(async () => { document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})) })
  await fill('模板','原文'); await save()
  const copy = vi.fn(async () => {})
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}})
  await act(async () => { button('复制').click() })
  expect(copy).toHaveBeenCalledWith('原文')
  await fill('新名称','修改后的正文'); await save()
  expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('修改后的正文')
  await act(async () => { button('删除').click() })
  expect(document.querySelector('[role=alertdialog]')?.textContent).toContain('新名称')
  await act(async () => { button('确认删除').click() })
  expect(document.querySelector('[aria-label="提示词列表"]')?.textContent).toContain('暂无模板')
})

it('protects edits when switching to a new template', async () => {
  await setup(); await fill('已保存', '正文'); await save()
  await fill('已保存', '草稿')
  await act(async () => { button('新建模板').click() })
  expect(document.querySelector('[role=alertdialog]')).not.toBeNull()
  await act(async () => { button('继续编辑').click() })
  expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('草稿')
  await act(async () => { button('新建模板').click() })
  await act(async () => { button('放弃修改').click() })
  expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('')
  await act(async () => { button('已保存').click() })
  expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('正文')
})
