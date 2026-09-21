/**
 * Behaviour tests for the on-screen Session lookup behind the browser panel.
 *
 * Stable rides dsh 0.1.5-rc.2, whose Session list snapshot carries the persisted
 * selection as `current`.
 */

import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { currentSessionId, type SessionListSnapshot } from '../src/client/session-selection.ts'

/** The smallest list snapshot the helper reads. */
const listOf = (current: SessionId | undefined): SessionListSnapshot => ({
  ids: ['session-a' as SessionId, 'session-b' as SessionId],
  byId: {
    ['session-a' as SessionId]: { id: 'session-a' as SessionId, displayTitle: 'A', running: false, blank: false, updatedAt: 1 },
    ['session-b' as SessionId]: { id: 'session-b' as SessionId, displayTitle: 'B', running: false, blank: false, updatedAt: 2 },
  },
  current,
  phase: 'ready',
  subagentsByParent: {},
  jobsBySession: {},
  currentAddress: undefined,
})

describe('currentSessionId', () => {
  it('reports the Session the list holds as current', () => {
    expect(currentSessionId(listOf('session-b' as SessionId))).toBe('session-b')
  })

  it('reports no Session while the no-session view is selected', () => {
    expect(currentSessionId(listOf(undefined))).toBeUndefined()
  })
})
