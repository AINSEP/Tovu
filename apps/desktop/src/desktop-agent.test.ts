/**
 * @file The desktop agent's own surface (`desktop-agent.ts`): the pure bridge gate, catalog and
 * prompt helpers, then the real loopback listener driven over HTTP with a fake agent executor —
 * no CLI is spawned. The executor fake is handed exactly what Jini's executor would be, so the
 * per-run credential, the prompt augmenter and the failure path are exercised as production wires them.
 */
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createNativeAgentRuntime } from "@jini-ai/agent-runtime";
import type { ToolDescriptor, ToolRegistry } from "@jini-ai/core";
import type { createAgentExecutor } from "@jini-ai/daemon";

import {
  resolveDesktopTurnAccess,
  authorizeBridgeRequest,
  bearerToken,
  createDesktopAgentRuntime,
  DELEGATED_TOOL_CALLS_PATH,
  DESKTOP_SYSTEM_OVERLAY,
  registryCatalog,
  turnPrompt,
  type DesktopAgentRuntimeOptions,
} from "./desktop-agent.ts";

type ExecutorOptions = Parameters<typeof createAgentExecutor>[1];
type RunRequired = { runId: string; agentId: string; prompt: string; cwd: string };

test("bearerToken reads the token from an Authorization header, case-insensitively and trimmed", () => {
  assert.equal(bearerToken(undefined), undefined);
  assert.equal(bearerToken("Bearer abc.def"), "abc.def");
  assert.equal(bearerToken("  bearer   tok  "), "tok");
  assert.equal(bearerToken("Basic dXNlcg=="), undefined);
  assert.equal(bearerToken("Bearer"), undefined);
});

test("the bridge gate denies by default and binds a delegated call to the credential's own run", () => {
  const credentials = { resolveCaller: ({ token }: { token: string }) => (token === "live-token" ? { runId: "run-1", principalId: "desktop-operator" } : undefined) };
  const gate = (pathName: string, authorization: string | undefined, body: unknown = {}) =>
    authorizeBridgeRequest({ path: pathName, authorization, body }, credentials as Parameters<typeof authorizeBridgeRequest>[1]);
  assert.deepEqual(gate("/api/tools/search", undefined), { allowed: false, status: 401, error: "missing bearer credential" });
  assert.deepEqual(gate("/api/tools/search", "Bearer stale"), { allowed: false, status: 401, error: "credential is not valid for any live run" });
  assert.deepEqual(gate("/api/tools/search", "Bearer live-token"), { allowed: true }, "a catalog read needs no run in its body");
  assert.deepEqual(gate(DELEGATED_TOOL_CALLS_PATH, "Bearer live-token", { runId: "run-1" }), { allowed: true });
  for (const body of [{ runId: "run-2" }, {}, null]) {
    assert.deepEqual(gate(DELEGATED_TOOL_CALLS_PATH, "Bearer live-token", body), { allowed: false, status: 403, error: "credential belongs to a different run" });
  }
});

/** A registry stand-in exposing only what the catalog reads. */
function fakeRegistry(descriptors: ToolDescriptor[]): ToolRegistry {
  return { list: () => descriptors } as unknown as ToolRegistry;
}

test("the catalog ranks by matched terms, honours the limit, and lists everything for an empty query", () => {
  const catalog = registryCatalog(fakeRegistry([
    { id: "desktop.list_sites", description: "List the websites" },
    { id: "site.call_tool", description: "Run a website tool" },
    { id: "tool_gaps_list" },
  ]));
  assert.deepEqual(catalog.search({ query: "website tool" }, {}).map((hit) => [hit.id, hit.score]), [["site.call_tool", 2], ["desktop.list_sites", 1], ["tool_gaps_list", 1]]);
  assert.deepEqual(catalog.search({ query: "website" }, { limit: 1 }).map((hit) => hit.id), ["desktop.list_sites"]);
  assert.deepEqual(catalog.search({ query: "  " }, {}).map((hit) => hit.id), ["desktop.list_sites", "site.call_tool", "tool_gaps_list"]);
  assert.deepEqual(catalog.search({ query: "nothing-matches" }, {}), []);
  assert.deepEqual(catalog.search({ query: "gaps" }, {})[0], { id: "tool_gaps_list", description: "", source: "desktop", score: 1 });
});

test("the catalog describes a known tool with its schema when it has one, and null for an unknown id", () => {
  const schema = { type: "object" };
  const catalog = registryCatalog(fakeRegistry([{ id: "with", description: "has schema", inputSchema: schema }, { id: "without" }]));
  assert.deepEqual(catalog.describe({ id: "with" }), { id: "with", description: "has schema", source: "desktop", inputSchema: schema });
  assert.deepEqual(catalog.describe({ id: "without" }), { id: "without", description: "", source: "desktop" });
  assert.equal(catalog.describe({ id: "missing" }), null);
});

test("the turn prompt names the on-screen site, or says only desktop tools apply", () => {
  assert.equal(turnPrompt("hello", null), "[Desktop context] No website is on screen. Only desktop.* tools apply this turn.\n\nhello");
  assert.equal(
    turnPrompt("hi", { siteDir: "/sites/a", name: "Alpha" }),
    '[Desktop context] On screen: the website "Alpha" (/sites/a). site.list_tools / site.call_tool reach it this turn.\n\nhi',
  );
});

interface Harness {
  chat: Awaited<ReturnType<typeof createDesktopAgentRuntime>>;
  options: () => ExecutorOptions;
  runs: Array<{ required: RunRequired; overlay: string; options: Record<string, unknown> }>;
  gaps: unknown[];
  errors: unknown[][];
}

async function harness(t: TestContext, overrides: DesktopAgentRuntimeOptions & { run?: (required: RunRequired, lifecycle: Harness["chat"]["lifecycle"]) => Promise<void>; env?: Record<string, string> } = {}): Promise<Harness> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-agent-bridge-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const runtime = createNativeAgentRuntime({ env: overrides.env ?? {} });
  t.after(() => runtime.dispose({}));
  let captured: ExecutorOptions | undefined;
  const runs: Harness["runs"] = [];
  const gaps: unknown[] = [];
  const errors: unknown[][] = [];
  const { run, env: _env, ...rest } = overrides;
  const chat = await createDesktopAgentRuntime({
    workDir: path.join(dir, "work"),
    buildTools: ({ addresseeOf }) => [{
      descriptor: { id: "probe.whoami", description: "Who is on screen", inputSchema: { type: "object" } },
      policy: { authorize: () => "allow" },
      handler: async ({ run: ref }) => ({ addressee: addresseeOf(ref.id) }),
    }],
    agentRuntime: runtime,
  }, {
    log: { error: (...args: unknown[]) => errors.push(args), warn: () => {} },
    toolGapStore: { appendToolGap: ({ entry }) => { gaps.push(entry); }, listToolGaps: () => gaps as never },
    createAgentExecutor: ({ lifecycle }, options) => {
      captured = options;
      return { run: async (required: RunRequired, runOptions: Record<string, unknown> = {}) => {
        runs.push({ required, overlay: options.promptAugmenter!.systemOverlay!({} as never) as string, options: runOptions });
        if (run) await run(required, lifecycle as never);
      } } as never;
    },
    ...rest,
  });
  t.after(() => chat.close());
  return { chat, options: () => captured!, runs, gaps, errors };
}

async function call(url: string, token: string | undefined, init: { method?: string; body?: unknown } = {}) {
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: { ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }), ...(init.body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

test("the runtime registers the built tools plus the owner gap list, and wires the bridge into the executor", async (t) => {
  const h = await harness(t);
  assert.deepEqual(h.chat.toolIds(), ["probe.whoami", "tool_gaps_list"]);
  const options = h.options();
  assert.equal(options.mcpJsonInjection!.daemonUrl, h.chat.daemonUrl);
  assert.deepEqual(options.mcpJsonInjection!.env, { ELECTRON_RUN_AS_NODE: "1" });
  assert.match(String(options.mcpJsonInjection!.args![0]), /bin[\\/]serve\.js$/, "the default bridge is @jini-ai/mcp's own serve script");
  const augmenter = options.promptAugmenter!;
  assert.deepEqual(augmenter.contextKinds!({} as never), []);
  assert.equal(augmenter.augmentUserRequest!({ basePrompt: "as typed" } as never), "as typed");
});

test("every listener request needs a credential for a live run; a turn's credential reaches its own catalog and tools", async (t) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const h = await harness(t, {
    readFullCliAccess: async () => false,
    run: async (required, lifecycle) => {
      await held;
      await lifecycle.finish({ runId: required.runId, status: "succeeded", code: 0, signal: null, resumable: false });
    },
  });
  const search = `${h.chat.daemonUrl}/api/tools/search?q=whoami`;
  assert.deepEqual(await call(search, undefined), { status: 401, body: { error: "missing bearer credential" } });
  assert.deepEqual(await call(search, "made-up"), { status: 401, body: { error: "credential is not valid for any live run" } });

  const { runId } = await h.chat.startTurn({ prompt: "who?", agentId: "codex" }, { addressee: { siteDir: "/sites/a", name: "Alpha" } });
  const token = h.options().mcpJsonInjection!.credential!({ runId }) as string;
  assert.equal(h.chat.addresseeOf(runId)?.name, "Alpha");
  const found = await call(search, token);
  assert.equal(found.status, 200);
  assert.deepEqual((found.body.hits as Array<{ id: string }>).map((hit) => hit.id), ["probe.whoami"]);

  const delegated = await call(`${h.chat.daemonUrl}${DELEGATED_TOOL_CALLS_PATH}`, token, { method: "POST", body: { runId, toolUseId: "use-1", toolId: "probe.whoami", input: {} } });
  assert.equal(delegated.status, 200);
  assert.match(JSON.stringify(delegated.body), /"name":"Alpha"/, "the tool ran for this run's own addressee");
  const gapList = await call(`${h.chat.daemonUrl}${DELEGATED_TOOL_CALLS_PATH}`, token, { method: "POST", body: { runId, toolUseId: "use-2", toolId: "tool_gaps_list", input: {} } });
  assert.equal(gapList.status, 200, "the operator's own run may read the gap list");
  assert.deepEqual(await call(`${h.chat.daemonUrl}${DELEGATED_TOOL_CALLS_PATH}`, token, { method: "POST", body: { runId: "another-run", toolUseId: "u", toolId: "probe.whoami" } }),
    { status: 403, body: { error: "credential belongs to a different run" } });

  // The executor ran with the restricted overlay (full CLI access is off) and the site-scoped prompt.
  assert.equal(h.runs.length, 1);
  assert.notEqual(h.runs[0]!.overlay, DESKTOP_SYSTEM_OVERLAY);
  assert.match(h.runs[0]!.overlay, /Native shell\/file tools, agents and workflows are unavailable for this chat/);
  assert.match(h.runs[0]!.required.prompt, /^\[Desktop context\] On screen: the website "Alpha"/);

  release();
  await h.chat.lifecycle.waitForTerminal({ runId });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.chat.addresseeOf(runId), null, "a finished run has no addressee");
  assert.deepEqual(await call(search, token), { status: 401, body: { error: "credential is not valid for any live run" } }, "and its credential is revoked");
});

test("a turn with full CLI access gets the full overlay, and attachments, model and reasoning reach the executor", async (t) => {
  const h = await harness(t, {
    readFullCliAccess: async () => true,
    readLoginShellEnvironment: async () => ({ PATH: "/operator/bin" }),
    run: async (required, lifecycle) => { await lifecycle.finish({ runId: required.runId, status: "succeeded", code: 0, signal: null, resumable: false }); },
  });
  const { runId } = await h.chat.startTurn({ prompt: "look", agentId: "claude" }, {
    model: "opus", reasoning: "high", chatId: "chat-7", attachmentPaths: ["/tmp/a/one.png", "/tmp/a/two.png", "/tmp/b/three.png"],
  });
  await h.chat.lifecycle.waitForTerminal({ runId });
  assert.equal(h.runs[0]!.overlay, DESKTOP_SYSTEM_OVERLAY);
  assert.equal(h.runs[0]!.options.model, "opus");
  assert.equal(h.runs[0]!.options.reasoning, "high");
  assert.deepEqual(h.runs[0]!.options.imagePaths, ["/tmp/a/one.png", "/tmp/a/two.png", "/tmp/b/three.png"]);
  assert.deepEqual(h.runs[0]!.options.extraAllowedDirs, ["/tmp/a", "/tmp/b"], "each attachment folder once");
});

test("native tool use during a turn is recorded in the owner's gap store, redacted, and listed back", async (t) => {
  const h = await harness(t, {
    readFullCliAccess: async () => true,
    readLoginShellEnvironment: async () => ({}),
    run: async (required, lifecycle) => {
      await lifecycle.emit({ runId: required.runId, input: { event: "agent", data: { type: "tool_use", id: "tool-1", name: "Bash", input: { command: "ls" } } } });
      await lifecycle.finish({ runId: required.runId, status: "succeeded", code: 0, signal: null, resumable: false });
    },
  });
  const { runId } = await h.chat.startTurn({ prompt: "go", agentId: "claude" }, { addressee: { siteDir: "/sites/a", name: "Alpha" } });
  await h.chat.lifecycle.waitForTerminal({ runId });
  await h.chat.close();
  assert.equal(h.gaps.length, 1);
  assert.match(JSON.stringify(h.gaps[0]), /"site":"\/sites\/a"/);
  assert.match(JSON.stringify(h.gaps[0]), /"toolUsed":"Bash"/);
  assert.match(JSON.stringify(h.gaps[0]), new RegExp(`"chatId":"${runId}"`), "with no chat id the run id identifies the chat");
});

test("a gap-store write failure is logged, not thrown into the turn", async (t) => {
  const h = await harness(t, {
    readFullCliAccess: async () => true,
    readLoginShellEnvironment: async () => ({}),
    toolGapStore: { appendToolGap: () => { throw new Error("disk full"); }, listToolGaps: () => [] },
    run: async (required, lifecycle) => {
      await lifecycle.emit({ runId: required.runId, input: { event: "agent", data: { type: "tool_use", id: "tool-1", name: "Bash", input: { command: "ls" } } } });
      await lifecycle.finish({ runId: required.runId, status: "succeeded", code: 0, signal: null, resumable: false });
    },
  });
  const { runId } = await h.chat.startTurn({ prompt: "go", agentId: "claude" });
  await h.chat.lifecycle.waitForTerminal({ runId });
  await h.chat.close();
  assert.deepEqual(h.errors, [["[tool-gaps] desktop audit write failed"]]);
});

test("an executor that rejects before terminalizing the run fails the run with a readable error, never leaving it live", async (t) => {
  const failure = new Error("spawn EACCES");
  const h = await harness(t, { readFullCliAccess: async () => false, run: async () => { throw failure; } });
  const { runId } = await h.chat.startTurn({ prompt: "go", agentId: "codex" });
  const terminal = await h.chat.lifecycle.waitForTerminal({ runId });
  assert.equal(terminal.state, "failed");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.errors[0], [`[desktop-agent] run ${runId} failed to start`, failure]);
  assert.equal(h.chat.addresseeOf(runId), null);
});

test("an executor that rejects after the run already finished leaves the finished run alone", async (t) => {
  const h = await harness(t, {
    readFullCliAccess: async () => false,
    run: async (required, lifecycle) => {
      await lifecycle.finish({ runId: required.runId, status: "succeeded", code: 0, signal: null, resumable: false });
      throw new Error("late teardown failure");
    },
  });
  const { runId } = await h.chat.startTurn({ prompt: "go", agentId: "codex" });
  const terminal = await h.chat.lifecycle.waitForTerminal({ runId });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(terminal.state, "succeeded");
  assert.equal((await h.chat.lifecycle.get({ runId }))?.state, "succeeded");
  assert.equal(h.errors.length, 1);
});

test("a hosted runtime runs every turn restricted, with no native tool access", async (t) => {
  const h = await harness(t, {
    env: { TOVU_HOSTED: "1" },
    readFullCliAccess: async () => assert.fail("a hosted runtime never reads the owner's full-CLI setting"),
    run: async (required, lifecycle) => { await lifecycle.finish({ runId: required.runId, status: "succeeded", code: 0, signal: null, resumable: false }); },
  });
  const { runId } = await h.chat.startTurn({ prompt: "go", agentId: "codex" });
  await h.chat.lifecycle.waitForTerminal({ runId });
  assert.equal(h.runs[0]!.options.permissionMode, "restricted");
  assert.equal(h.runs[0]!.options.nativeToolAccess, false);
});

test("a bridge credential can only be minted for a run that is live", async (t) => {
  const h = await harness(t);
  assert.throws(() => h.options().mcpJsonInjection!.credential!({ runId: "never-started" }), /not live/);
});

test("without an injected executor the turn runs on Jini's own executor, which fails an unknown agent cleanly", async (t) => {
  const h = await harness(t, { readFullCliAccess: async () => false, createAgentExecutor: undefined });
  const { runId } = await h.chat.startTurn({ prompt: "go", agentId: "no-such-agent-cli" });
  const terminal = await h.chat.lifecycle.waitForTerminal({ runId });
  assert.equal(terminal.state, "failed");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.chat.addresseeOf(runId), null);
});

test("with no injected reader, an enabled login environment is read from the real login shell", async () => {
  const access = await resolveDesktopTurnAccess(
    { addressee: null, hostEnv: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: os.homedir(), SHELL: "/bin/sh" } },
    { readFullCliAccess: async () => true },
  );
  assert.equal(access.nativeToolAccess, true);
  assert.equal(typeof access.parityEnv, "object");
  assert.ok(access.parityEnv && Object.keys(access.parityEnv).every((key) => !key.startsWith("TOVU_") && !key.startsWith("JINI_")));
});
