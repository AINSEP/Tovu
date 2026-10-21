import assert from "node:assert/strict";
import test from "node:test";

import { agentDaemonWanted } from "../agent-daemon-wanted.js";

/**
 * @file The one shared "should boot spawn the agent daemon?" decision for `index.ts` and
 * `tovu serve`, over an injected env, log sink and external-MCP repo fake.
 */

function repoReturning(rows: readonly unknown[]) {
  const asked: string[] = [];
  return { asked, repo: { listByWorkspaceId: async (id: string) => { asked.push(id); return rows; } } };
}

test("agentDaemonWanted: assistant on short-circuits without asking the external-MCP repo", async () => {
  const { asked, repo } = repoReturning([]);
  const lines: string[] = [];
  assert.equal(await agentDaemonWanted({ workspaceId: "ws-1", externalMcpServerRepo: repo }, { env: {}, log: (line) => lines.push(line) }), true);
  assert.deepEqual(asked, []);
  assert.deepEqual(lines, []);
});

test("agentDaemonWanted: assistant off but an external MCP server configured still wants the daemon", async () => {
  const { asked, repo } = repoReturning([{ id: "srv" }]);
  const lines: string[] = [];
  assert.equal(await agentDaemonWanted({ workspaceId: "ws-2", externalMcpServerRepo: repo }, { env: { TOVU_ADMIN_ASSISTANT: " OFF " }, log: (line) => lines.push(line) }), true);
  assert.deepEqual(asked, ["ws-2"]);
  assert.deepEqual(lines, []);
});

test("agentDaemonWanted: assistant off and no external MCP declines and says why", async () => {
  const { asked, repo } = repoReturning([]);
  const lines: string[] = [];
  assert.equal(await agentDaemonWanted({ workspaceId: "ws-3", externalMcpServerRepo: repo }, { env: { TOVU_ADMIN_ASSISTANT: "off" }, log: (line) => lines.push(line) }), false);
  assert.deepEqual(asked, ["ws-3"]);
  assert.deepEqual(lines, ["[assistant] TOVU_ADMIN_ASSISTANT=off and no external MCP configured — not starting the agent daemon"]);
});

test("agentDaemonWanted: with no options it reads process.env and logs to console.log", async (t) => {
  const saved = process.env.TOVU_ADMIN_ASSISTANT;
  t.after(() => { if (saved === undefined) delete process.env.TOVU_ADMIN_ASSISTANT; else process.env.TOVU_ADMIN_ASSISTANT = saved; });
  process.env.TOVU_ADMIN_ASSISTANT = "off";
  const logged = t.mock.method(console, "log", () => {});
  assert.equal(await agentDaemonWanted({ workspaceId: "ws-4", externalMcpServerRepo: repoReturning([]).repo }), false);
  assert.equal(logged.mock.callCount(), 1);
  assert.match(String(logged.mock.calls[0]!.arguments[0]), /not starting the agent daemon/);
});
