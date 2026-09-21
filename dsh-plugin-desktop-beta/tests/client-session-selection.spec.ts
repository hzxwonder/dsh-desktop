/**
 * Behaviour tests for the on-screen Session lookup behind the browser panel.
 *
 * Beta rides dsh 0.1.6-alpha.2, whose Session list snapshot dropped the persisted
 * `current` selection and marks the Session the main view retains instead.
 */

import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { currentSessionId, type SessionListSnapshot } from '../src/client/session-selection.ts'

/** The smallest list snapshot the helper reads. */
const listOf = (shown: SessionId | undefined): SessionListSnapshot => ({
  ids: ['session-a' as SessionId, 'session-b' as SessionId],
  byId: {
    ['session-a' as SessionId]: {
      id: 'session-a' as SessionId, displayTitle: 'A', running: false, blank: false, updatedAt: 1,
      retainedBy: shown === 'session-a' ? { mainView: 1 } : {},
    },
    ['session-b' as SessionId]: {
      id: 'session-b' as SessionId, displayTitle: 'B', running: false, blank: false, updatedAt: 2,
      retainedBy: shown === 'session-b' ? { mainView: 1 } : {},
    },
  },
  phase: 'ready',
  subagentsByParent: {},
  jobsBySession: {},
})

describe('currentSessionId', () => {
  it('reports the Session the main view retains', () => {
    expect(currentSessionId(listOf('session-b' as SessionId))).toBe('session-b')
  })

  it('reports no Session while the no-session view is selected', () => {
    expect(currentSessionId(listOf(undefined))).toBeUndefined()
  })
})
