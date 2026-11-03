import assert from "node:assert/strict";
import type { RouteDeps } from "#src/server/routes/types";

/** Records an accepted attempt through the same site-owned store as staff chat. */
export async function acceptToolRun({ deps, runId, principalId }: {
  deps: RouteDeps; runId: string; principalId: string;
}, _options = {}): Promise<void> {
  const conversationId = `chat-${runId}`;
  await deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: principalId }).create({ id: conversationId });
  const accepted = await deps.chatRunLedger.durable!.accept({
    conversationId, messageId: `answer-${runId}`, runId, principalId, workspaceId: deps.workspaceId,
    now: Date.now(), request: { contextRef: "{}" },
  }, {});
  assert.ok(accepted);
}
