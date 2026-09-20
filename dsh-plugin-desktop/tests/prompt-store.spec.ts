import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PromptStore } from '../src/prompt-store.ts'

const directories: string[] = []
async function store() {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-prompts-'))
  directories.push(directory)
  return new PromptStore(join(directory, 'prompts.json'))
}
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('Desktop prompt persistence', () => {
  it('preserves exact multiline text and recent usage across store instances', async () => {
    const source = await store()
    expect(await source.list()).toEqual([])
    const [row] = await source.change({ action: 'create', name: '  审查  ', content: '第一行\n\n  第二行 <script> & /text' })
    expect(row!.name).toBe('审查')
    expect(row!.lastUsedAt).toBeNull()
    const reopened = new PromptStore(source.path)
    expect((await reopened.list())[0]!.content).toBe('第一行\n\n  第二行 <script> & /text')
    await reopened.change({ action: 'use', id: row!.id })
    expect((await source.list())[0]!.lastUsedAt).toBeTypeOf('number')
    if (process.platform !== 'win32') expect((await stat(source.path)).mode & 0o777).toBe(0o600)
  })
  it('serializes concurrent creation without losing prompts', async () => {
    const source = await store()
    await Promise.all(Array.from({ length: 8 }, (_, index) => new PromptStore(source.path).change({ action: 'create', name: `Prompt ${index}`, content: 'text' })))
    expect(await source.list()).toHaveLength(8)
  })
  it('rejects blank fields, duplicate names, excessive content and unknown ids', async () => {
    const source = await store()
    await source.change({ action: 'create', name: 'Review', content: 'text' })
    await expect(source.change({ action: 'create', name: ' review ', content: 'text' })).rejects.toThrow('已存在')
    await expect(source.change({ action: 'create', name: ' ', content: 'text' })).rejects.toThrow()
    await expect(source.change({ action: 'create', name: 'a', content: ' ' })).rejects.toThrow()
    await expect(source.change({ action: 'create', name: 'a', content: 'x'.repeat(100001) })).rejects.toThrow()
    await expect(source.change({ action: 'use', id: 'missing' })).rejects.toThrow()
    expect(await source.list()).toHaveLength(1)
  })
  it('preserves corrupt storage for recovery', async () => {
    const source = await store()
    await writeFile(source.path, '{broken')
    await expect(source.change({ action: 'create', name: 'a', content: 'text' })).rejects.toThrow()
    expect(await readFile(source.path, 'utf8')).toBe('{broken')
  })
})

it('updates and deletes by identity while preserving other templates and recent use', async () => {
  const source = await store()
  const [row] = await source.change({action:'create',name:'One',content:'old'})
  await source.change({action:'create',name:'Two',content:'keep'})
  await source.change({action:'use',id:row!.id})
  const updated = await source.change({action:'update',id:row!.id,name:'Renamed',content:'new\nbody'})
  expect(updated[0]).toMatchObject({id:row!.id,name:'Renamed',content:'new\nbody',createdAt:row!.createdAt})
  expect(updated[0]!.lastUsedAt).not.toBeNull()
  await expect(source.change({action:'update',id:row!.id,name:'two',content:'duplicate'})).rejects.toThrow('已存在')
  const remaining = await source.change({action:'delete',id:row!.id})
  expect(remaining).toHaveLength(1)
  expect(remaining[0]!.name).toBe('Two')
  await expect(source.change({action:'update',id:row!.id,name:'One',content:'lost'})).rejects.toThrow('不存在')
})
