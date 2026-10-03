// Resume-id contracts and adapters: Jini/packages/daemon/src/store/agent-sessions/{ports,index,sql}.ts.
// H1 recovery: clear an unconfirmed failed resume so subsequent turns can start a fresh session.
import {
  createInMemoryAgentSessionStore as createMemorySessions,
  type AgentSessionStore,
} from "@jini-ai/daemon/store/agent-sessions";
import { createSqliteAgentSessionStore as createSqliteSessions } from "@jini-ai/daemon/store/agent-sessions/sqlite";
import { createPgliteAgentSessionStore } from "@jini-ai/daemon/store/agent-sessions/pglite";
import { createPostgresAgentSessionStore } from "@jini-ai/daemon/store/agent-sessions/postgres";
export type { AgentSessionStore } from "@jini-ai/daemon/store/agent-sessions";

import { type ChatKernel, chatKernel } from "#src/platform/db/chat-kernel";
import type { SqliteConnectionSource } from "@jini-ai/db/kernel/sqlite";

/**
 * @file Durable store for `assistant_agent_sessions` (migration `0051`) — the
 * `(conversation, agent) -> underlying agent-CLI session id` mapping that lets a
 * `resumesSessionViaCli` def (`@jini-ai/agent-runtime`'s `types.ts`) continue its own CLI session
 * across chat turns instead of spawning cold every turn. See that migration's own header for why
 * this lives in a table separate from the Jini-mirrored `ai_chats`/`ai_chat_messages`.
 *
 * Read and written from `agent-daemon-server.ts`'s `onStarted`: `getSessionId` before a run starts
 * (feeding `AgentExecutorRunInput.resumeSessionId`), `setSessionId` once a run ends carrying a
 * fresh `RunEndPayload.sessionRef` (`@jini-ai/protocol`'s doc on that field), and `clearSessionId`
 * when a resumed run ends WITHOUT one — see that method's own doc for why leaving a dead id in
 * place there bricks every later turn in the conversation.
 */

/**
 * Compatibility name retained for composition roots. Selects daemon's simple session-id adapter
 * by the borrowed kernel's transport; never calls the rich legacy agent_sessions API.
 * Uses assistant_agent_sessions, with its existing FK cascade and overwrite/clear semantics.
 */
export function createSqliteAgentSessionStore(store: ChatKernel | SqliteConnectionSource): AgentSessionStore {
  const kernel = chatKernel(store);
  switch (kernel.transport) {
    case "better-sqlite3": return createSqliteSessions({ kernel });
    case "pglite":
    case "pglite-socket": return createPgliteAgentSessionStore({ kernel });
    default: return createPostgresAgentSessionStore({ kernel });
  }
}

/** Private lazy-composition/test mapping with daemon's opaque-pair overwrite/clear behavior. */
export function createInMemoryAgentSessionStore(): AgentSessionStore {
  return createMemorySessions({});
}
