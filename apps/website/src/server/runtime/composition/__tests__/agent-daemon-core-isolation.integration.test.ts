import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createAgentDaemonCoreDeps } from "../agent-daemon-core-deps.js";

test("authenticated bootstrap cannot substitute a different site directory", async () => {
  await assert.rejects(createAgentDaemonCoreDeps({ token: "own-rpc", env: {
    TOVU_WORKSPACE: "site-a", TOVU_SITE_DIR: "/sites/a", TOVU_SITE_LISTENER_ORIGIN: "http://127.0.0.1:4100",
  } }, { fetch: async () => Response.json({ value: { workspaceId: "site-a", ownerPrincipalId: "owner",
    siteBinding: { dir: "/sites/b", name: "b" }, siteStoragePaths: {
      contentDbPath: "/sites/b/content.db", mediaUploadsDir: "/sites/b/uploads", chatAttachmentsDir: "/sites/b/attachments",
    }, traceEnabled: false, traceCapture: "off" } }),
    openClient: async () => assert.fail("a foreign database must never open"),
  }), /directory does not match/);
});

for (const db of ["memory", "sqlite"] as const) {
  test(`two sites times two instances retain separate configuration and sessions (${db})`, async () => {
    const root = await mkdtemp(join(tmpdir(), "daemon-core-isolation-"));
    const clients: Awaited<ReturnType<typeof createAgentDaemonCoreDeps>>[] = [];
    const calls: string[][] = Array.from({ length: 4 }, () => []);
    try {
      for (let index = 0; index < 4; index++) {
        const workspaceId = index % 2 === 0 ? "site-a" : "site-b";
        const dir = join(root, String(index)); await mkdir(dir);
        const contentDbPath = join(dir, "content.db");
        if (db === "sqlite") {
          new Database(contentDbPath).close();
          const chat = new Database(join(dir, "chat.db"));
          chat.exec("CREATE TABLE ai_chats (id TEXT PRIMARY KEY); INSERT INTO ai_chats VALUES ('same')");
          chat.exec(await readFile(new URL("../../../../platform/db/drizzle/0051_assistant_agent_sessions.sql", import.meta.url), "utf8"));
          chat.close();
        }
        const origin = `http://127.0.0.1:${4100 + index}`;
        const client = await createAgentDaemonCoreDeps({ token: `rpc-${index}`, env: {
          TOVU_WORKSPACE: workspaceId, TOVU_SITE_DIR: dir, TOVU_DB: db, TOVU_SITE_LISTENER_ORIGIN: origin,
          HOME: dir, TOVU_SITE_PROCESS_CWD: dir,
        } }, { storage: { kind: "sqlite" }, fetch: async (url, init) => {
          assert.equal(new URL(String(url)).origin, origin);
          assert.equal(new Headers(init?.headers).get("authorization"), `Bearer rpc-${index}`);
          const body = JSON.parse(String(init?.body)) as { operation: string };
          calls[index]!.push(body.operation);
          if (body.operation === "bootstrap") return Response.json({ value: { workspaceId, ownerPrincipalId: "same-principal", siteBinding: { dir, name: workspaceId },
            siteStoragePaths: { contentDbPath, mediaUploadsDir: join(dir, "uploads"), chatAttachmentsDir: join(dir, "attachments") }, traceEnabled: false, traceCapture: "off" } });
          return Response.json({ value: body.operation === "getEffective" ? { value: `instructions-${index}` } : null });
        } });
        clients.push(client);
        await client.agentSessions.setSessionId({ conversationId: "same", agentId: "codex", sessionId: `session-${index}` });
      }
      for (const [index, client] of clients.entries()) {
        assert.equal(await client.agentSessions.getSessionId({ conversationId: "same", agentId: "codex" }), `session-${index}`);
        assert.equal(client.siteBinding.dir, join(root, String(index)));
        assert.equal(client.siteStoragePaths.chatAttachmentsDir, join(root, String(index), "attachments"));
        if (db === "memory") assert.equal((await client.getEffective({ repo: client.settingsRepo }, {
          namespace: "core.instructions", key: "custom", scopeContext: { workspaceId: client.workspaceId },
        }))?.value, `instructions-${index}`);
      }
      await clients[0]!.close();
      assert.equal(await clients[1]!.agentSessions.getSessionId({ conversationId: "same", agentId: "codex" }), "session-1");
      assert.ok(calls.every(operations => operations[0] === "bootstrap"));
    } finally {
      await Promise.all(clients.map(client => client.close()));
      await rm(root, { recursive: true, force: true });
    }
  });
}
