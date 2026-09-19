/** Cordis client plugin for the Desktop prompt library. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { createRoot } from 'react-dom/client'
import { createPromptApi, PromptLibrary } from './PromptLibrary.tsx'

export const name = 'desktop-prompt'
export const inject = ['commandUi', 'conversation', 'sessions']

export function apply(ctx: Context): void {
  let close: (() => void) | undefined
  const api = createPromptApi()
  ctx.effect(() => ctx.commandUi.register({
    name: 'prompt',
    // Newer command catalogs display localized row copy; older catalogs use the name.
    ...{ label: () => '提示词库', description: () => '最近使用、创建并插入常用 Prompt' },
    available: () => true,
    ui: { kind: 'action', run: ({ sessionId }) => {
      close?.()
      const scope = ctx.sessions.scope(sessionId)
      if (!scope) return
      const input = ctx.conversation.input.for(scope)
      const container = document.createElement('div')
      document.body.append(container)
      const root = createRoot(container)
      const previousFocus = document.activeElement
      let active = true
      const dispose = () => {
        if (!active) return
        active = false
        root.unmount(); container.remove()
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
        if (close === dispose) close = undefined
      }
      close = dispose
      root.render(<PromptLibrary api={api} onClose={dispose} onInsert={prompt => {
        if (!active) throw new Error('提示词窗口已关闭。')
        if (ctx.sessions.scope(sessionId) !== scope) throw new Error('会话已关闭，请重新打开提示词库。')
        const state = input.state.getSnapshot()
        const end = state.draft.length
        const inserted = scope.bail(scope, 'slash/input-insert-text', {
          text: `${end && !state.draft.endsWith('\n') ? '\n' : ''}${prompt.content}`,
          span: { start: end, end, draftRev: state.draftRev },
        })
        if (!inserted) throw new Error('输入框暂不可编辑，请稍后重试。')
      }} />)
    } },
  }), 'desktop-prompt: /prompt command')
  ctx.effect(() => () => { close?.() }, 'desktop-prompt: dialog lifecycle')
}
