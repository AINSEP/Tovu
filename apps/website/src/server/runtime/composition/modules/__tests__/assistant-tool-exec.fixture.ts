import assert from "node:assert/strict";
import net from "node:net";
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

/** A loopback TCP hop that RSTs the client the moment a `"type":"result"` line arrives from the server. */
export async function startResettingToolProxy(t: import("node:test").TestContext, target: URL): Promise<string> {
  const proxy = net.createServer((client) => {
    const upstream = net.connect(Number(target.port), "127.0.0.1");
    client.pipe(upstream);
    upstream.on("data", (chunk: Buffer) => {
      if (chunk.toString("utf8").includes('"type":"result"')) { client.resetAndDestroy(); upstream.destroy(); return; }
      client.write(chunk);
    });
    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
    upstream.on("end", () => client.end());
    client.on("close", () => upstream.destroy());
  });
  proxy.listen(0, "127.0.0.1");
  await new Promise((resolve) => proxy.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => proxy.close(() => resolve())));
  return `http://127.0.0.1:${(proxy.address() as net.AddressInfo).port}`;
}
