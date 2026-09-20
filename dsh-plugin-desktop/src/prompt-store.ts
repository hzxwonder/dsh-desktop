/** Atomic, serialized prompt storage shared by Desktop windows. */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { writeFileAtomic, withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { validatePrompt, type SavedPrompt } from './prompt-contract.ts'

export class PromptStore {
  constructor(readonly path: string) {}

  async list(): Promise<SavedPrompt[]> {
    let text: string
    try { text = await readFile(this.path, 'utf8') } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const data: unknown = JSON.parse(text)
    if (!Array.isArray(data)) throw new Error('提示词数据格式无效。')
    const ids = new Set<string>()
    for (const item of data) {
      if (!item || typeof item.id !== 'string' || ids.has(item.id)
        || !Number.isFinite(item.createdAt)
        || (item.lastUsedAt !== null && !Number.isFinite(item.lastUsedAt))) throw new Error('提示词数据格式无效。')
      validatePrompt(item.name, item.content)
      ids.add(item.id)
    }
    return data as SavedPrompt[]
  }

  async change(operation: unknown): Promise<SavedPrompt[]> {
    if (!operation || typeof operation !== 'object') throw new Error('无效操作。')
    const request = operation as Record<string, unknown>
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
    return withFileLock(this.path, async () => {
      const rows = await this.list()
      if (request.action === 'create') {
        const value = validatePrompt(request.name, request.content)
        if (rows.some(row => row.name.toLocaleLowerCase() === value.name.toLocaleLowerCase())) throw new Error('此名称已存在，请使用其他名称。')
        if (rows.length >= 1000) throw new Error('最多保存 1,000 条提示词。')
        rows.push({ ...value, id: randomUUID(), createdAt: Date.now(), lastUsedAt: null })
      } else if (request.action === 'update') {
        const row = rows.find(row => row.id === request.id)
        if (!row) throw new Error('提示词不存在，请重新加载。')
        const value = validatePrompt(request.name, request.content)
        if (rows.some(other => other.id !== row.id && other.name.toLocaleLowerCase() === value.name.toLocaleLowerCase())) throw new Error('此名称已存在，请使用其他名称。')
        Object.assign(row, value)
      } else if (request.action === 'delete') {
        const index = rows.findIndex(row => row.id === request.id)
        if (index === -1) throw new Error('提示词不存在，请重新加载。')
        rows.splice(index, 1)
      } else if (request.action === 'use') {
        const row = rows.find(row => row.id === request.id)
        if (!row) throw new Error('提示词不存在，请重新打开窗口。')
        row.lastUsedAt = Date.now()
      } else throw new Error('无效操作。')
      await writeFileAtomic(this.path, JSON.stringify(rows, null, 2), { mode: 0o600 })
      return rows
    })
  }
}
