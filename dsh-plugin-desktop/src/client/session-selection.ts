/**
 * Session the main view is showing, read from the Session list snapshot.
 *
 * The Desktop browser panel is a root-scoped layer, so it resolves the on-screen
 * Session itself instead of receiving a Session-scoped prop. Stable rides
 * dsh 0.1.5-rc.2, whose list snapshot carries the persisted selection as
 * `current`.
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
  return list.current
}
