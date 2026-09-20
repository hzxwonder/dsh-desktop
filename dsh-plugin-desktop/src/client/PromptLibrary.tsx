import { useEffect, useRef, useState } from 'react'
import type { SavedPrompt } from '../prompt-contract.ts'
import { promptStyles } from './prompt-styles.ts'
import type { PromptApi } from './prompt-api.ts'
export { createPromptApi, type PromptApi } from './prompt-api.ts'

function Icon({ kind }: { kind: 'search' | 'plus' | 'close' | 'file' | 'back' | 'arrow' | 'alert' }) {
  const paths = { search: 'm21 21-4.5-4.5M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0', plus: 'M12 5v14M5 12h14', close: 'm6 6 12 12M6 18 18 6', file: 'M14 2H5v20h14V7l-5-5v5h5M8 12h8M8 16h6', back: 'm12 5-7 7 7 7M5 12h15', arrow: 'M4 12h16m-6-6 6 6-6 6', alert: 'M12 8v5m0 3v.01M12 3 2 21h20L12 3Z' }
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>
}

export function PromptLibrary({ api, onInsert, onClose, initialCreate = false }: { initialCreate?: boolean; api: PromptApi; onInsert(prompt: SavedPrompt): void; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<SavedPrompt[]>([])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'all' | 'recent'>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(initialCreate)
  const [editing, setEditing] = useState<SavedPrompt | null>(null)
  const [deleting, setDeleting] = useState<SavedPrompt | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [fieldErrors, setFieldErrors] = useState({ name: '', content: '' })
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  const alive = useRef(true)
  const generation = useRef(0)
  const inFlight = useRef(false)
  const [discard, setDiscard] = useState(false)
  const load = async () => {
    const current = ++generation.current
    setLoading(true); setError('')
    try {
      const next = await api.list()
      if (alive.current && current === generation.current) { setRows(next); setLoaded(true) }
    } catch (cause) {
      if (alive.current && current === generation.current) setError(message(cause))
    } finally { if (alive.current && current === generation.current) setLoading(false) }
  }
  useEffect(() => {
    alive.current = true
    dialog.current!.showModal(); search.current?.focus()
    void load()
    return () => { alive.current = false; generation.current++; dialog.current?.close() }
  }, [api])
  useEffect(() => { if (creating) nameInput.current?.focus(); else search.current?.focus() }, [creating])
  const back = () => {
    if (busy) return
    if (name !== (editing?.name ?? '') || content !== (editing?.content ?? '')) { setDiscard(true); return }
    setCreating(false); setSaveError('')
  }
  const close = () => { if (busy) return; if (creating) back(); else onClose() }
  const filtered = rows.filter(row => `${row.name}\n${row.content}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (tab !== 'recent' || row.lastUsedAt !== null))
    .sort((a, b) => tab === 'recent' ? b.lastUsedAt! - a.lastUsedAt! : b.createdAt - a.createdAt)
  const active = filtered.find(row => row.id === selected) ?? filtered[0]
  const insert = async () => {
    if (!active || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try { await api.use(active.id); if (!alive.current) return; onInsert(active); onClose() }
    catch (cause) { if (alive.current) setError(message(cause)) }
    finally { inFlight.current = false; if (alive.current) setBusy(false) }
  }
  const save = async () => {
    if (inFlight.current) return
    const nextErrors = { name: !name.trim() ? '请输入提示词名称' : '', content: !content.trim() ? '请输入提示词正文' : '' }
    setFieldErrors(nextErrors)
    if (nextErrors.name || nextErrors.content) { if (nextErrors.name) nameInput.current?.focus(); else dialog.current?.querySelector('textarea')?.focus(); return }
    inFlight.current = true; setBusy(true); setSaveError('')
    try {
      const next = editing ? await api.update(editing.id, name, content) : await api.create(name, content)
      if (!alive.current) return
      setRows(next); setLoaded(true); setSelected(next.find(row => row.name === name.trim())?.id ?? null)
      setEditing(null); setQuery(''); setTab('all'); setCreating(false); setName(''); setContent(''); setError(''); setNotice('已保存，可预览后插入聊天框')
    } catch (cause) { if (alive.current) setSaveError(message(cause)) }
    finally { inFlight.current = false; if (alive.current) setBusy(false) }
  }
  const actions = (row: SavedPrompt) => <span className="dp-actions"><button type="button" className="dp-button" disabled={busy} onClick={() => { void navigator.clipboard.writeText(row.content).then(() => setNotice(`已复制「${row.name}」正文`)).catch(() => setNotice('复制未完成，请重试。')) }}>复制正文</button><button type="button" className="dp-button" disabled={busy} onClick={() => {
    if (creating && (name !== (editing?.name ?? '') || content !== (editing?.content ?? ''))) { setSaveError('请先保存当前填写内容，或返回后放弃本次填写。'); return }
    setEditing(row); setName(row.name); setContent(row.content); setCreating(true); setSaveError(''); setFieldErrors({name:'',content:''})
  }}>修改</button><button type="button" className="dp-button" disabled={busy} onClick={() => setDeleting(row)}>删除</button></span>
  const remove = async () => {
    if (!deleting || inFlight.current) return
    inFlight.current = true; setBusy(true)
    try { const next = await api.delete(deleting.id); if (!alive.current) return; setRows(next); if (editing?.id === deleting.id) { setEditing(null); setName(''); setContent('') }; setDeleting(null); setNotice('模板已删除') }
    catch (cause) { setNotice(message(cause)); setDeleting(null) }
    finally { inFlight.current = false; if (alive.current) setBusy(false) }
  }
  return <><style>{promptStyles}</style><dialog ref={dialog} className="dp-dialog" aria-labelledby="dp-title" onCancel={event => { event.preventDefault(); if (deleting) setDeleting(null); else if (discard) setDiscard(false); else close() }} onKeyDown={event => {
    if (event.nativeEvent.isComposing || discard || deleting) return
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); if (creating) void save(); else void insert() }
  }}>
    <header className="dp-header"><div className="dp-heading">{creating ? <button className="dp-icon" aria-label="返回提示词库" disabled={busy} onClick={back}><Icon kind="back" /></button> : <span className="dp-mark"><Icon kind="file" /></span>}<div><h2 id="dp-title">{creating ? editing ? '修改 Prompt 模板' : '新建 Prompt 模板' : 'Prompt 模板管理'}</h2><p>{creating ? '保存常用指令，随时调用' : '让常用表达，触手可及'}</p></div></div><button className="dp-icon" aria-label={creating ? '关闭新建提示词' : '关闭提示词库'} disabled={busy} onClick={close}><Icon kind="close" /></button></header>
    {creating ? <form onSubmit={event => { event.preventDefault(); void save() }} className="dp-form" noValidate>
      <div className="dp-form-body">{error && <div className="dp-alert" role="alert"><p>{error}</p><button type="button" className="dp-button" onClick={() => void load()}>重新加载</button></div>}{notice && <p className="dp-notice" role="status">{notice}</p>}<details className="dp-manage-list"><summary>已保存模板（{rows.length}） · 复制、修改、删除</summary>{rows.map(row => <div className="dp-manage-row" key={row.id}><strong>{row.name}</strong>{actions(row)}</div>)}</details><label htmlFor="dp-name">名称 <span>便于下次查找</span></label><input id="dp-name" ref={nameInput} maxLength={100} value={name} disabled={busy} aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? 'dp-name-error' : undefined} onChange={event => { setName(event.target.value); setFieldErrors(previous => ({ ...previous, name: '' })) }} placeholder="例如：代码审查、润色文章" />
      {fieldErrors.name && <p className="dp-field-error" id="dp-name-error">{fieldErrors.name}</p>}
      <label htmlFor="dp-content">正文 <span>{content.length.toLocaleString()} / 100,000</span></label><textarea id="dp-content" rows={8} maxLength={100000} disabled={busy} value={content} aria-invalid={!!fieldErrors.content} aria-describedby={fieldErrors.content ? 'dp-content-error' : undefined} onChange={event => { setContent(event.target.value); setFieldErrors(previous => ({ ...previous, content: '' })) }} placeholder="写下完整的提示词，支持换行…" />
      {fieldErrors.content && <p className="dp-field-error" id="dp-content-error">{fieldErrors.content}</p>}
      <p className="dp-helper">使用时会以纯文本添加到聊天框，你可以继续编辑。</p>
      {saveError && <div className="dp-alert" role="alert"><Icon kind="alert" /><div><strong>未能保存</strong><p>{saveError}</p><small>填写内容已保留，可再次保存。</small></div></div>}
      </div><footer className="dp-footer"><span className="dp-shortcut">⌘ / Ctrl + Enter 保存</span><div><button className="dp-button" type="button" disabled={busy} onClick={back}>返回</button><button className="dp-primary" disabled={busy} type="submit">{busy ? '正在保存…' : '保存提示词'}</button></div></footer>
    </form> : <>
      <div className="dp-toolbar"><div className="dp-search"><Icon kind="search" /><input ref={search} aria-label="搜索提示词" placeholder="搜索名称或正文" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const index = filtered.findIndex(row => row.id === active?.id); const next = filtered[(index + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length]; if (next) setSelected(next.id) }
        if (event.key === 'Enter') { event.preventDefault(); void insert() }
      }} />{query && <button className="dp-clear" aria-label="清空搜索" onClick={() => { setQuery(''); search.current?.focus() }}><Icon kind="close" /></button>}</div><button className="dp-primary" disabled={!loaded || loading || busy} onClick={() => { setEditing(null); setName(''); setContent(''); setFieldErrors({name: '', content: ''}); setCreating(true); setSaveError(''); setNotice('') }}><Icon kind="plus" />新建提示词</button></div>
      <div className="dp-tabs" aria-label="提示词分类"><button aria-pressed={tab === 'all'} onClick={() => setTab('all')}>全部<span>{rows.length}</span></button><button aria-pressed={tab === 'recent'} onClick={() => setTab('recent')}>最近使用</button></div>
      {notice && <p className="dp-notice" role="status">{notice}</p>}
      {error ? <div className="dp-error-state" role="alert"><span className="dp-state-icon"><Icon kind="alert" /></span><h3>{loaded ? '操作未完成' : '暂时无法加载提示词'}</h3><p>{error}</p><button className="dp-button" onClick={() => void load()}>重新加载</button></div>
      : loading ? <div className="dp-empty" role="status"><span className="dp-spinner" />正在加载提示词…</div>
      : !active ? <div className="dp-empty"><span className="dp-state-icon"><Icon kind={query ? 'search' : 'file'} /></span><h3>{query ? '没有找到匹配的提示词' : tab === 'recent' ? '还没有使用记录' : '把常用指令，存成提示词'}</h3><p>{query ? '试试其他名称，或搜索正文中的关键词。' : tab === 'recent' ? '插入过的提示词会显示在这里。' : '为它取个名字，下次通过 /prompt 快速找到。'}</p>{!query && tab === 'all' && <button className="dp-button" onClick={() => setCreating(true)}><Icon kind="plus" />创建第一条提示词</button>}</div>
      : <div className="dp-workspace"><div className="dp-list" aria-label="提示词列表">{filtered.map(row => <button key={row.id} className="dp-row" aria-pressed={active.id === row.id} onClick={() => setSelected(row.id)} disabled={busy}><span className="dp-row-icon"><Icon kind="file" /></span><span><strong>{row.name}</strong><small>{row.content.replace(/\s+/g, ' ')}</small></span></button>)}</div><section className="dp-preview" aria-label="提示词预览"><div className="dp-preview-title"><span>正文预览</span><span>{active.content.length.toLocaleString()} 字符</span></div><h3>{active.name}</h3><pre>{active.content}</pre><div className="dp-manage-actions">{actions(active)}</div></section></div>}
      <footer className="dp-footer"><span className="dp-shortcut">↑ ↓ 选择 <span>↵ 插入</span> <span>Esc 关闭</span></span><button className="dp-primary" disabled={!active || loading || busy || !!error} onClick={() => void insert()}>{busy ? '正在插入…' : '插入聊天框'}<Icon kind="arrow" /></button></footer>
    </>}
    {deleting && <div className="dp-confirm" role="alertdialog" aria-modal="true" aria-label="删除模板" onKeyDown={event => { if(event.key === 'Tab') { event.preventDefault(); const buttons=event.currentTarget.querySelectorAll('button'); (document.activeElement === buttons[0] ? buttons[1] : buttons[0])?.focus() } }}><div><h3>删除「{deleting.name}」？</h3><p>删除后该模板将从候选列表中移除。</p><div><button autoFocus className="dp-button" disabled={busy} onClick={() => setDeleting(null)}>取消</button><button className="dp-primary" disabled={busy} onClick={() => void remove()}>{busy ? '正在删除…' : '确认删除'}</button></div></div></div>}
    {discard && <div className="dp-confirm" role="alertdialog" aria-modal="true" aria-label="保留未保存内容" onKeyDown={event => {
      if (event.key === 'Tab') { event.preventDefault(); const buttons = event.currentTarget.querySelectorAll('button'); const next = document.activeElement === buttons[0] ? buttons[1] : buttons[0]; next?.focus() }
    }}><div><h3>离开前，保留这段内容？</h3><p>返回列表会放弃本次填写的内容。</p><div><button autoFocus className="dp-primary" onClick={() => setDiscard(false)}>继续编辑</button><button className="dp-button" onClick={() => { setName(''); setContent(''); setFieldErrors({ name: '', content: '' }); setDiscard(false); setCreating(false) }}>放弃并返回</button></div></div></div>}
  </dialog></>
}
function message(cause: unknown): string { return cause instanceof Error ? cause.message : '操作未完成，请稍后重试。' }
