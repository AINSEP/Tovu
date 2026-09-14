/**
 * The subset of a live chat transcript worth persisting: user turns, and assistant turns whose run
 * has reached a terminal status. An assistant message that is still `queued`/`running` is rewritten
 * on every delta, so saving it every time would turn one reply into dozens of writes for a row about
 * to be replaced anyway. Mirrors Tovu admin's `lib/assistant-chats.ts`'s `persistableMessages` — the
 * same rule, ported here because it has no I/O and nothing host-specific to inject.
 *
 * A standalone module — no local `.js`-relative imports, only the `@jini-ai/chat/core` package —
 * deliberately, so it can be exercised directly under `node --test` with no build step. `App.hooks.ts`
 * itself pulls in enough of the renderer's own module graph (via its usual `./foo.js` imports) that
 * Node's type stripping cannot resolve it standalone; `App.hooks.test.ts` (colocated in this same
 * directory) imports this module directly and exercises it that way, and `folder-drop.test.ts`'s own
 * header describes why a pure renderer function generally gets pulled out this way for testing.
 */
import { isTerminalRunStatus, type ChatMessage } from '@jini-ai/chat/core';

export function persistableMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => message.role === 'user' || isTerminalRunStatus(message.runStatus));
}
