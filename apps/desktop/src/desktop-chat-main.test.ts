/**
 * @file The desktop chat's composition root (`desktop-chat-main.ts`): which tracked site a
 * renderer-reported folder resolves to, and what `startDesktopChat` hands the agent runtime. The
 * runtime itself is a fake factory capturing its inputs; IPC is a plain handler map.
 */
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createNativeAgentRuntime } from "@jini-ai/agent-runtime";
import { createInMemoryEventLog, createRunLifecycle } from "@jini-ai/daemon";
import type { ToolExecutionContext } from "@jini-ai/core";

import { resolveTrackedAddressee, startDesktopChat } from "./desktop-chat-main.ts";
import type { createDesktopAgentRuntime, DesktopTurnOptions } from "./desktop-agent.ts";
import { SITE_ORIGIN, trackSite } from "./tracked-sites.ts";
import { WORKSPACE_CHAT_IPC, type ChatIpcMain } from "./workspace-chat-ipc.ts";

test("a renderer-reported folder resolves only to a tracked site, normalized, with its display name", () => {
  const ports = { readTracked: () => [{ siteDir: "/sites/alpha" }], readSiteName: (dir: string) => `name of ${dir}` };
  assert.deepEqual(resolveTrackedAddressee("/sites/alpha", ports), { siteDir: "/sites/alpha", name: "name of /sites/alpha" });
  assert.deepEqual(resolveTrackedAddressee("/sites/beta/../alpha/", ports), { siteDir: "/sites/alpha", name: "name of /sites/alpha" });
  assert.equal(resolveTrackedAddressee("/sites/untracked", ports), null, "an arbitrary folder never becomes the turn's site");
  assert.deepEqual(resolveTrackedAddressee("sites/alpha", ports), { siteDir: "/sites/alpha", name: "name of /sites/alpha" },
    "a relative report is anchored at the filesystem root, never at this process's cwd");
});

type Factory = typeof createDesktopAgentRuntime;

function setup(t: TestContext, extra: { readFullCliAccess?: () => Promise<boolean>; factory?: Factory | null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-chat-main-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const agentRuntime = createNativeAgentRuntime({ env: {} });
  t.after(() => agentRuntime.dispose({}));
  const projectsPath = path.join(dir, "projects.json");
  const handlers = new Map<string, Parameters<ChatIpcMain["handle"]>[1]>();
  const broadcasts: unknown[][] = [];
  const turns: DesktopTurnOptions[] = [];
  let captured: { required: Parameters<Factory>[0]; optional: Parameters<Factory>[1] } | undefined;
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const factory: Factory | undefined = extra.factory === null ? undefined : extra.factory ?? (async (required, optional) => {
    captured = { required, optional };
    return {
      lifecycle, daemonUrl: "http://127.0.0.1:1", addresseeOf: () => null, toolIds: () => [],
      startTurn: async (_input, options = {}) => {
        turns.push(options);
        const { run } = await lifecycle.start({ contextRef: "desktop-chat" }, {});
        return { runId: run.id };
      },
      close: async () => {},
    };
  });
  const runtime = startDesktopChat({
    agentRuntime, userDataDir: dir, projectsPath,
    ipcMain: { handle: (channel, listener) => { handlers.set(channel, listener); } },
    revealPath: async () => {}, pickDirectory: async () => null,
    broadcast: (channel, payload) => broadcasts.push([channel, payload]),
    readSiteName: (siteDir) => `Site ${path.basename(siteDir)}`,
    ...(extra.readFullCliAccess ? { readFullCliAccess: extra.readFullCliAccess } : {}),
  }, factory === undefined ? {} : { createDesktopAgentRuntime: factory });
  return { dir, projectsPath, handlers, broadcasts, turns, runtime, captured: () => captured! };
}

test("the agent runtime gets its work dir under userData, the conversation store for gaps, and the owner setting", async (t) => {
  const readFullCliAccess = async () => true;
  const s = setup(t, { readFullCliAccess });
  await s.runtime;
  const { required, optional } = s.captured();
  assert.equal(required.workDir, path.join(s.dir, "desktop-agent"));
  assert.ok(optional?.toolGapStore, "tool gaps land in the same conversation store");
  assert.equal(optional?.readFullCliAccess, readFullCliAccess);
  for (const channel of Object.values(WORKSPACE_CHAT_IPC).filter((name) => !["workspace:chat:event", "workspace:chat:navigate"].includes(name))) {
    assert.ok(s.handlers.has(channel), `${channel} is registered`);
  }
});

test("without an owner setting the runtime uses the environment default (no reader is passed)", async (t) => {
  const s = setup(t);
  await s.runtime;
  assert.equal("readFullCliAccess" in (s.captured().optional ?? {}), false);
});

test("the built tools navigate the shell by broadcast and reach the unbuilt site gateway by default", async (t) => {
  const s = setup(t);
  await s.runtime;
  const tools = s.captured().required.buildTools({ addresseeOf: () => ({ siteDir: "/sites/a", name: "A" }) });
  const ctx = (input: unknown): ToolExecutionContext => ({ executionId: "e", principal: { id: "p" }, run: { id: "r" }, input, signal: new AbortController().signal });
  await tools.find((tool) => tool.descriptor.id === "desktop.navigate")!.handler(ctx({ section: "projects" }));
  assert.deepEqual(s.broadcasts, [[WORKSPACE_CHAT_IPC.navigate, "projects"]]);
  const listed = await tools.find((tool) => tool.descriptor.id === "site.list_tools")!.handler(ctx({})) as { isError: boolean; text: string };
  assert.equal(listed.isError, true);
  assert.match(listed.text, /^A's tools are unavailable this turn: .*inbound tool route is not built/);
});

test("a start's reported site becomes the turn's addressee only when this app tracks it", async (t) => {
  const s = setup(t);
  const tracked = path.join(s.dir, "tracked-site");
  trackSite(s.projectsPath, tracked, SITE_ORIGIN.adopted);
  const start = s.handlers.get(WORKSPACE_CHAT_IPC.start)!;
  const event = { sender: { send: () => {}, isDestroyed: () => false } };
  await start(event, { prompt: "hi", agentId: "codex", subscriptionId: "s1", activeSiteDir: tracked });
  await start(event, { prompt: "hi", agentId: "codex", subscriptionId: "s2", activeSiteDir: path.join(s.dir, "elsewhere") });
  assert.deepEqual(s.turns.map((turn) => turn.addressee), [{ siteDir: tracked, name: "Site tracked-site" }, null]);
});

test("a runtime that fails to start is reported on the console instead of crashing main", async (t) => {
  const failure = new Error("listener refused");
  const logged = t.mock.method(console, "error", () => {});
  const s = setup(t, { factory: async () => { throw failure; } });
  await assert.rejects(s.runtime, failure);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(logged.mock.calls.map((entry) => entry.arguments), [["tovu-desktop: the desktop chat agent did not start", failure]]);
});

test("by default the real desktop agent runtime starts with every built tool registered", async (t) => {
  const s = setup(t, { factory: null });
  const runtime = await s.runtime;
  t.after(() => runtime.close());
  const ids = runtime.toolIds();
  for (const id of ["desktop.list_sites", "desktop.navigate", "site.list_tools", "site.call_tool", "tool_gaps_list"]) assert.ok(ids.includes(id), id);
  assert.equal(new URL(runtime.daemonUrl).hostname, "127.0.0.1");
});
