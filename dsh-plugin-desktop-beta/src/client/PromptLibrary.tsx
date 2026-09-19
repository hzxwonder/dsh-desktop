import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PROMPT_PATH, validatePrompt, type SavedPrompt } from '../prompt-contract.ts'

export interface PromptApi {
  list(): Promise<SavedPrompt[]>
  create(name: string, content: string): Promise<SavedPrompt[]>
  use(id: string): Promise<SavedPrompt[]>
}
export function createPromptApi(): PromptApi {
  const request = async (body?: object): Promise<SavedPrompt[]> => {
    const response = await fetch(PROMPT_PATH, body === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    const result = await response.json() as { prompts: SavedPrompt[]; error?: string }
    if (!response.ok) throw new Error(result.error ?? '请求失败，请重试。')
    return result.prompts
  }
  return { list: () => request(), create: (name, content) => request({ action: 'create', name, content }), use: id => request({ action: 'use', id }) }
}

function Modal({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    dialog.querySelector<HTMLInputElement>('input')?.focus()
    return () => { dialog.close() }
  }, [])
  return <dialog className="desktop-prompt-dialog" ref={ref} aria-label={title}
    onCancel={event => { event.preventDefault(); onClose() }}>
    <header><h2>{title}</h2><button type="button" aria-label={`关闭${title}`} onClick={onClose}>×</button></header>
    {children}
  </dialog>
}

export function PromptLibrary({ api, onInsert, onClose }: {
  api: PromptApi; onInsert(prompt: SavedPrompt): void; onClose(): void
}) {
  const [rows, setRows] = useState<SavedPrompt[]>([])
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = () => { setLoading(true); setError(''); void api.list().then(setRows).catch(fail).finally(() => setLoading(false)) }
  const fail = (cause: unknown) => setError(cause instanceof Error ? cause.message : '操作失败，请重试。')
  useEffect(load, [api])
  const select = async (prompt: SavedPrompt) => {
    if (busy) return
    setBusy(true); setError('')
    try { await api.use(prompt.id); onInsert(prompt); onClose() } catch (cause) { fail(cause) } finally { setBusy(false) }
  }
  const filtered = rows.filter(row => `${row.name}\n${row.content}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const recent = filtered.filter(row => row.lastUsedAt !== null).sort((a, b) => b.lastUsedAt! - a.lastUsedAt!).slice(0, 5)
  const list = (items: SavedPrompt[]) => items.map(row => <button className="desktop-prompt-row" key={row.id} type="button" disabled={busy} onClick={() => void select(row)}>
    <strong>{row.name}</strong><span>{row.content}</span>
  </button>)
  return <>
    <style>{styles}</style>
    <Modal title="提示词库" onClose={() => { if (!busy) onClose() }}>
      <div className="desktop-prompt-tools"><input autoFocus aria-label="搜索提示词" placeholder="搜索名称或内容…" value={query} onChange={event => setQuery(event.target.value)} />
        <button type="button" className="desktop-prompt-primary" onClick={() => { setError(''); setCreating(true) }}>＋ 创建 Prompt</button></div>
      <p className="desktop-prompt-hint">选择提示词，将正文添加到当前聊天框。</p>
      {error && <p role="alert">{error} <button onClick={load}>重新加载</button></p>}
      <div className="desktop-prompt-list" aria-busy={loading || busy}>
        {loading ? <p>正在加载…</p> : <>
          {recent.length > 0 && <section aria-label="最近使用"><h3>最近使用</h3>{list(recent)}</section>}
          <section aria-label="全部提示词"><h3>全部提示词 <small>{filtered.length}</small></h3>
            {list([...filtered].sort((a, b) => b.createdAt - a.createdAt))}
            {filtered.length === 0 && <p className="desktop-prompt-empty">{rows.length ? '没有匹配的提示词。' : '保存常用指令，下次通过 /prompt 快速使用。'}</p>}
          </section>
        </>}
      </div>
    </Modal>
    {creating && <CreatePrompt api={api} onClose={() => setCreating(false)} onCreated={next => { setRows(next); setQuery(''); setCreating(false) }} />}
  </>
}

function CreatePrompt({ api, onClose, onCreated }: { api: PromptApi; onClose(): void; onCreated(rows: SavedPrompt[]): void }) {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <Modal title="创建 Prompt" onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={event => {
      event.preventDefault()
      if (busy) return
      try { validatePrompt(name, content) } catch (cause) { setError((cause as Error).message); return }
      setBusy(true); setError('')
      void api.create(name, content).then(onCreated).catch(cause => setError(cause instanceof Error ? cause.message : '保存失败，请重试。')).finally(() => setBusy(false))
    }}>
      <label>名称<input autoFocus required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="例如：代码审查" /></label>
      <label>内容<textarea required maxLength={100000} rows={10} value={content} onChange={event => setContent(event.target.value)} placeholder="输入要添加到聊天框的完整提示词…" /></label>
      {error && <p role="alert">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="desktop-prompt-primary" disabled={busy} type="submit">{busy ? '正在保存…' : '保存 Prompt'}</button></footer>
    </form>
  </Modal>
}

const styles = `
.desktop-prompt-dialog{box-sizing:border-box;width:min(680px,calc(100vw - 32px));max-height:82vh;margin:auto;padding:24px;border:1px solid #8884;border-radius:18px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#222);box-shadow:0 24px 80px #0003;font:14px/1.5 system-ui,sans-serif;color-scheme:inherit}
.desktop-prompt-dialog::backdrop{background:#0005;backdrop-filter:blur(3px)}
.desktop-prompt-dialog *{box-sizing:border-box}.desktop-prompt-dialog header,.desktop-prompt-tools,.desktop-prompt-dialog footer{display:flex;align-items:center;gap:12px;justify-content:space-between}.desktop-prompt-dialog h2{font-size:20px;margin:0}.desktop-prompt-dialog h3{font-size:13px;opacity:.65;margin:20px 0 8px}.desktop-prompt-dialog small{margin-left:6px}
.desktop-prompt-dialog button{font:inherit;color:inherit;background:transparent;border:1px solid #8884;border-radius:8px;padding:8px 12px;cursor:pointer}.desktop-prompt-dialog button:hover{background:#8882}.desktop-prompt-dialog button:disabled{opacity:.5;cursor:wait}.desktop-prompt-dialog button:focus-visible,.desktop-prompt-dialog input:focus-visible,.desktop-prompt-dialog textarea:focus-visible{outline:2px solid #4979e8;outline-offset:2px}
.desktop-prompt-dialog input,.desktop-prompt-dialog textarea{font:inherit;color:inherit;background:transparent;border:1px solid #8885;border-radius:8px;padding:10px 12px;width:100%;min-width:0}.desktop-prompt-tools{margin-top:20px}.desktop-prompt-tools input{flex:1}.desktop-prompt-tools button{white-space:nowrap}.desktop-prompt-dialog .desktop-prompt-primary{background:#3869d4;color:white;border-color:transparent}.desktop-prompt-dialog .desktop-prompt-primary:hover{background:#2858bf}
.desktop-prompt-hint{font-size:12px;opacity:.65;margin:10px 0}.desktop-prompt-list{overflow:auto;max-height:48vh}.desktop-prompt-dialog .desktop-prompt-row{display:flex;flex-direction:column;text-align:left;width:100%;gap:5px;border-color:transparent;padding:12px;margin:3px 0}.desktop-prompt-row strong{font-weight:600;overflow-wrap:anywhere}.desktop-prompt-row span{white-space:pre-wrap;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;opacity:.65;font-size:13px;overflow-wrap:anywhere}.desktop-prompt-empty{padding:30px 8px;opacity:.6;text-align:center}.desktop-prompt-dialog label{display:block;margin:20px 0 12px}.desktop-prompt-dialog label input,.desktop-prompt-dialog textarea{display:block;margin-top:8px}.desktop-prompt-dialog textarea{resize:vertical;max-height:40vh}.desktop-prompt-dialog footer{justify-content:flex-end;margin-top:20px}.desktop-prompt-dialog [role=alert]{color:#c34c43}
@media(prefers-color-scheme:dark){.desktop-prompt-dialog{background:var(--dsw-alias-bg-layer-1,#242629);color:var(--dsw-alias-label-primary,#eee)}}
@media(max-width:480px){.desktop-prompt-dialog{padding:16px}.desktop-prompt-tools{flex-wrap:wrap}.desktop-prompt-tools input{flex-basis:100%}}
`
