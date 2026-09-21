/**
 * Session the main view is showing, read from the Session list snapshot.
 *
 * The Desktop browser panel is a root-scoped layer, so it resolves the on-screen
 * Session itself instead of receiving a Session-scoped prop. Beta rides
 * dsh 0.1.6-alpha.2, whose list snapshot dropped the persisted `current`
 * selection: the Session the main view retains is the one on screen.
 */

import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'

/** The Session list selector hook, whatever snapshot type this channel feeds it. */
type UseSessions = PropsRuntime<'root'>['useSessions']

/** Session list snapshot the `useSessions` standard share selects over. */
export type SessionListSnapshot = Parameters<Parameters<UseSessions>[0]>[0]

/**
 * Identity of the Session the main view shows.
 * @param list - Session list snapshot.
 * @returns Selected Session identity, or absence in the no-session view.
 */
export function currentSessionId(list: SessionListSnapshot): string | undefined {
  return Object.values(list.byId).find(session => (session.retainedBy.mainView ?? 0) > 0)?.id
}
