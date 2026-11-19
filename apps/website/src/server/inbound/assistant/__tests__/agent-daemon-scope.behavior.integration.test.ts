import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import express from "express";
import { EventEmitter, once } from "node:events";
import * as http from "@jini-ai/daemon/http";
import * as mounting from "../../../runtime/composition/jini-routes.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as daemon from "@jini-ai/daemon";
import * as runtime from "@jini-ai/agent-runtime";
import * as childEnvironment from "@jini-ai/platform/child-environment";
import * as agents from "#src/assistant/agents";
import * as access from "#src/assistant/daemon-access";
import * as sessions from "#src/assistant/agent-session-preset";
import * as instructions from "#src/assistant/custom-instructions";
import * as core from "../../../runtime/composition/agent-daemon-core-deps.js";
import * as policy from "../assistant-run-tool-policy.js";
import { assistantCliPermissions } from "@tovu/contracts/assistant-native-fallbacks";
import { resolveNativeToolPolicy } from "@jini-ai/agent-runtime/native-tool-policy";
import type { PromptAugmenter } from "@jini-ai/core/contracts/agents";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

const changed = new EventEmitter();
const delegatedRoutes: Parameters<typeof mounting.mountJiniRoutes>[0]["routes"] = [];
const controls = {
  handlers: [] as string[],
  note(event: string) { this.events.push(event); changed.emit("change"); },
  events: [] as string[],
  launches: [] as daemon.AgentExecutorRunInput[],
  failures: [] as Parameters<typeof sessions.failRunBeforeStart>[0][],
  overlays: new Map<string, string>(),
  refresh: undefined as ReturnType<typeof gate> | undefined,
  write: undefined as ReturnType<typeof gate> | undefined,
  execution: undefined as ReturnType<typeof gate> | undefined,
  overlay: undefined as ReturnType<typeof gate> | undefined,
  dispatchError: undefined as Error | undefined,
  credential: undefined as ((token: string) => ReturnType<ReturnType<typeof access.createRunScopedCredentials>["resolveCaller"]>) | undefined,
  memory: true,
  deps: undefined as core.AgentDaemonCoreDeps | undefined,
};

async function until(predicate: () => boolean) {
  const signal = AbortSignal.timeout(2_000);
  while (!predicate()) await once(changed, "change", { signal });
}

mock.module("@jini-ai/daemon/http", { namedExports: { ...http,
  delegatedToolRoutes: () => delegatedRoutes,
} });
mock.module("../../../runtime/composition/jini-routes.js", { namedExports: { ...mounting,
  mountJiniRoutes: (required: Parameters<typeof mounting.mountJiniRoutes>[0], optional: Parameters<typeof mounting.mountJiniRoutes>[1]) => {
    if (required.routes !== delegatedRoutes) return mounting.mountJiniRoutes(required, optional);
    const app = required.app as express.Express;
    app.post("/api/delegated-tool-calls", (_req, res) => { controls.handlers.push("delegated"); res.json({ handled: true }); });
  },
} });
mock.module("@jini-ai/platform/child-environment", { namedExports: { ...childEnvironment,
  readLoginShellEnvironment: async () => ({ PATH: "/fixture/bin" }),
} });
mock.module("@jini-ai/agent-runtime", { namedExports: { ...runtime,
  createNativeAgentRuntime: (...args: Parameters<typeof runtime.createNativeAgentRuntime>) => {
    const actual = runtime.createNativeAgentRuntime(...args);
    return { ...actual, resolveAgentLaunch: () => ({ launchPath: process.execPath }),
      getAgentDef: ({ id }: { id: string }) => {
        const def = actual.getAgentDef({ id });
        return def ? { ...def, mcpIsolation: { perRun: "characterization" } } : def;
      },
    };
  },
} });
mock.module("#src/assistant/agents", { namedExports: { ...agents,
  createAssistantAgentInventory: (...args: Parameters<typeof agents.createAssistantAgentInventory>) => {
    const actual = agents.createAssistantAgentInventory(...args);
    return { ...actual, listAssistantAgents: async () => [{ id: "claude", name: "Claude", available: true, authStatus: "unknown" as const }] };
  },
} });
mock.module("#src/assistant/daemon-access", { namedExports: { ...access,
  createRunScopedCredentials: (...args: Parameters<typeof access.createRunScopedCredentials>) => {
    const actual = access.createRunScopedCredentials(...args);
    return { ...actual, resolveCaller: (input: Parameters<typeof actual.resolveCaller>[0]) => controls.credential ? controls.credential(input.token) : actual.resolveCaller(input) };
  },
  createRunOwnerRegistry: (...args: Parameters<typeof access.createRunOwnerRegistry>) => {
    const actual = access.createRunOwnerRegistry(...args);
    return { ...actual, record: (...input: Parameters<typeof actual.record>) => { controls.note("owner"); return actual.record(...input); } };
  },
} });
mock.module("#src/assistant/agent-session-preset", { namedExports: { ...sessions,
  agentCarriesOwnMemory: () => controls.memory,
  createLiveRunTracker: (...args: Parameters<typeof sessions.createLiveRunTracker>) => {
    const actual = sessions.createLiveRunTracker(...args);
    return { ...actual,
      register: (...input: Parameters<typeof actual.register>) => { controls.note("register"); return actual.register(...input); },
      hasConcurrentLiveRun: (...input: Parameters<typeof actual.hasConcurrentLiveRun>) => { controls.note("concurrency"); return actual.hasConcurrentLiveRun(...input); },
    };
  },
  failRunBeforeStart: async (...args: Parameters<typeof sessions.failRunBeforeStart>) => {
    controls.failures.push(args[0]); controls.note("failure");
    return sessions.failRunBeforeStart(...args);
  },
} });
mock.module("#src/assistant/custom-instructions", { namedExports: { ...instructions,
  createCustomInstructionsCache: (...args: Parameters<typeof instructions.createCustomInstructionsCache>) => {
    const actual = instructions.createCustomInstructionsCache(...args);
    return { ...actual, refresh: async () => { controls.note("refresh"); await controls.refresh?.promise; await actual.refresh(); } };
  },
} });
mock.module("../../../runtime/composition/agent-daemon-core-deps.js", { namedExports: { ...core,
  createAgentDaemonCoreDeps: async (...args: Parameters<typeof core.createAgentDaemonCoreDeps>) => {
    const actual = await core.createAgentDaemonCoreDeps(...args);
    const store = actual.agentSessions;
    controls.deps = { ...actual, agentSessions: { ...store,
      getSessionId: async input => { controls.note("read"); return store.getSessionId(input); },
      setSessionId: async input => { controls.note("write"); await controls.write?.promise; return store.setSessionId(input); },
      clearSessionId: async input => { controls.note(`clear:${input.conversationId}:${input.agentId}`); return store.clearSessionId(input); },
    } };
    return controls.deps;
  },
} });
mock.module("../assistant-run-tool-policy.js", { namedExports: { ...policy,
  readAssistantRunToolPolicy: async (required: policy.AssistantRunToolPolicyInput) => {
    const def = required.getDef({ id: required.agentId });
    const settings = assistantCliPermissions({ enabled: true });
    const capabilities = { ...settings.capabilities, subagents: required.principalId === "owner" };
    const effective = { ...settings, capabilities };
    return { isOwner: true, def, settings, effective,
      policy: resolveNativeToolPolicy({ def: def ?? {}, policy: { nativeToolAccess: true, nativeCapabilities: capabilities } }),
      nativeCapabilities: capabilities, lock: undefined, settingsSource: "site" as const };
  },
} });
mock.module("@jini-ai/daemon", { namedExports: { ...daemon,
  createRunLifecycle: (...args: Parameters<typeof daemon.createRunLifecycle>) => {
    const actual = daemon.createRunLifecycle(...args);
    return { ...actual,
      stream: (...input: Parameters<typeof actual.stream>) => { controls.note("subscribe"); return actual.stream(...input); },
      waitForTerminal: (...input: Parameters<typeof actual.waitForTerminal>) => { controls.note(`terminal:${input[0].runId}`); return actual.waitForTerminal(...input); },
    };
  },
  createAgentExecutor: (_required: Parameters<typeof daemon.createAgentExecutor>[0], optional: Parameters<typeof daemon.createAgentExecutor>[1]) => {
    const augmenter: PromptAugmenter | undefined = optional?.promptAugmenter;
    return { run: async (required: daemon.AgentExecutorRunInput, options: Partial<daemon.AgentExecutorRunInput> = {}) => {
      controls.launches.push({ ...required, ...options }); controls.note("dispatch");
      await controls.overlay?.promise;
      const overlay = augmenter?.systemOverlay?.({ agentId: required.agentId, turnIndex: 0 });
      if (typeof overlay === "string") controls.overlays.set(required.runId, overlay);
      controls.note("overlay");
      if (controls.dispatchError) throw controls.dispatchError;
      await controls.execution?.promise;
    }, sendUserMessage: async () => { assert.fail("HTTP guard reached executor"); } };
  },
} });

const { createSiteScope } = await import("../agent-daemon-scope.js");

async function harness() {
  controls.events = []; controls.handlers = []; controls.launches = []; controls.failures = []; controls.overlays.clear();
  controls.refresh = undefined; controls.write = undefined; controls.execution = undefined; controls.overlay = undefined;
  controls.dispatchError = undefined; controls.credential = undefined; controls.memory = true; controls.deps = undefined;
  const dir = await mkdtemp(join(tmpdir(), "scope-behavior-"));
  const host = express();
  host.get("/internal/tool-catalog", (_req, res) => res.json({ tools: [] }));
  host.post("/internal/agent-plugin-preflight", (_req, res) => res.json({ prefix: "", refusalPrefix: "", pluginIds: [] }));
  const server = host.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const token = "scope-behavior-token";
  const scope = await createSiteScope({ siteId: "behavior", token: "rpc-token", env: {
    PATH: "", HOME: dir, TOVU_SITE_DIR: dir, TOVU_DB: "memory", TOVU_SITE_LISTENER_ORIGIN: url,
    TOVU_AGENT_DAEMON_TOKEN: token, JINI_AGENT_DAEMON_URL: url, TOVU_AGENT_DAEMON_IDLE_MINUTES: "0",
  } }, { probeBridge: async () => {}, coreOptions: { fetch: async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as { operation: string };
    return Response.json({ value: request.operation === "bootstrap" ? {
      workspaceId: "behavior", ownerPrincipalId: "owner", siteBinding: { dir, name: "behavior" },
      siteStoragePaths: { contentDbPath: join(dir, "content.db"), mediaUploadsDir: join(dir, "uploads"), chatAttachmentsDir: join(dir, "attachments") },
      traceCapture: "off", traceEnabled: false,
    } : null });
  } } });
  host.use(scope.app);
  const start = async (conversationId: string, principalId = "owner") => {
    const response = await fetch(`${url}/api/runs`, { method: "POST", headers: {
      authorization: `Bearer ${token}`, "x-tovu-principal-id": principalId, "content-type": "application/json",
    }, body: JSON.stringify({ agentId: "claude", contextRef: JSON.stringify({ prompt: "hello", principalId, conversationId }) }) });
    assert.equal(response.status, 201);
    return ((await response.json()) as { run: { id: string } }).run.id;
  };
  const flush = () => new Promise<void>(resolve => setImmediate(resolve));
  return { scope, url, token, start, flush,
    close: async () => {
      controls.refresh?.release(); controls.write?.release(); controls.overlay?.release(); controls.execution?.release();
      for (const run of await scope.lifecycle.list({})) {
        if (!["succeeded", "failed", "cancelled"].includes(run.state)) await scope.lifecycle.finish({ runId: run.id, status: "cancelled", code: null, signal: null, resumable: false });
      }
      await scope.dispose({}, {}); server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await rm(dir, { recursive: true, force: true });
    },
  };
}

// Mutation: mounting the JSON parser before authentication returns 400 instead of 401.
test("HTTP rejects malformed anonymous JSON before parsing", async () => {
  const h = await harness();
  try {
    const response = await fetch(`${h.url}/api/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    assert.equal(response.status, 401); await response.body?.cancel();
    assert.deepEqual(controls.launches, []);
  } finally { await h.close(); }
});

// Mutations: cache the first credential resolution; remove the delegated body/run binding.
for (const disappearing of [true, false]) {
  test(`HTTP rechecks ${disappearing ? "an expired credential" : "a mismatched delegated run"} without executing`, async () => {
    const h = await harness();
    let lookups = 0;
    try {
      controls.execution = gate();
      const liveRun = disappearing ? "A" : await h.start("credential");
      if (!disappearing) await until(() => controls.launches.length === 1);
      controls.credential = token => token === "run-token" && (!disappearing || ++lookups === 1)
        ? { runId: liveRun, principalId: "owner" } : undefined;
      const response = await fetch(`${h.url}/api/delegated-tool-calls`, {
        method: "POST", headers: { authorization: "Bearer run-token", "content-type": "application/json" },
        body: JSON.stringify({ runId: disappearing ? "A" : "B", toolId: "guard-sentinel", input: {} }),
      });
      assert.equal(response.status, disappearing ? 404 : 403); await response.body?.cancel();
      if (disappearing) assert.ok(lookups >= 2);
      assert.deepEqual(controls.handlers, []);
    } finally { await h.close(); }
  });
}

// Mutation: defer owner/tracker registration or session subscription until after refresh.
test("run admission registers ownership and subscribes while refresh is blocked", async () => {
  const h = await harness();
  try {
    controls.refresh = gate();
    const runId = await h.start("registration");
    assert.ok(controls.events.includes("refresh"));
    assert.ok(controls.events.includes("owner"));
    assert.ok(controls.events.includes("register"));
    assert.ok(controls.events.indexOf("owner") < controls.events.indexOf("refresh"));
    assert.ok(controls.events.indexOf("register") < controls.events.indexOf("refresh"));
    assert.equal(controls.events.filter(event => event === "subscribe").length, 2);
    const owned = await fetch(`${h.url}/api/runs/${runId}`, { headers: { authorization: `Bearer ${h.token}`, "x-tovu-principal-id": "owner" } });
    assert.equal(owned.status, 200); await owned.body?.cancel();
    assert.deepEqual(controls.launches, []);
  } finally { await h.close(); }
});

// Mutation: omit clearing a failed effective resume's matching conversation/agent binding.
test("a failed resumed run clears its matching stored session", async () => {
  const h = await harness();
  try {
    await controls.deps!.agentSessions.setSessionId({ conversationId: "resume", agentId: "claude", sessionId: "stored" });
    controls.execution = gate();
    const runId = await h.start("resume"); await until(() => controls.launches.length === 1);
    assert.equal(controls.launches[0]?.resumeSessionId, "stored");
    await h.scope.lifecycle.finish({ runId, status: "failed", code: 1, signal: null, resumable: false });
    await until(() => controls.events.includes("clear:resume:claude"));
    assert.ok(controls.events.includes("clear:resume:claude"));
    assert.equal(await controls.deps!.agentSessions.getSessionId({ conversationId: "resume", agentId: "claude" }), null);
  } finally { await h.close(); }
});

// Mutations: bypass the memory refusal; pass storedSessionId instead of effectiveResumeSessionId.
for (const memory of [true, false]) {
  test(`a concurrent ${memory ? "memory agent refuses" : "non-memory agent omits resume"} with a stored session`, async () => {
    const h = await harness();
    try {
      controls.memory = memory; controls.execution = gate();
      await controls.deps!.agentSessions.setSessionId({ conversationId: "concurrent", agentId: "claude", sessionId: "stored" });
      await h.start("concurrent"); await until(() => controls.launches.length === 1);
      const second = await h.start("concurrent"); await h.flush();
      if (memory) {
        const terminal = await h.scope.lifecycle.waitForTerminal({ runId: second }, { signal: AbortSignal.timeout(2_000) });
        assert.equal(terminal.state, "failed"); assert.equal(controls.launches.length, 1);
        assert.equal(controls.failures.at(-1)?.message, sessions.CONCURRENT_RUN_REFUSAL_MESSAGE);
      } else {
        await until(() => controls.launches.length === 2);
        assert.equal(controls.launches[1]?.resumeSessionId, undefined);
      }
    } finally { await h.close(); }
  });
}

// Mutations: remove the write await; hold the lock through dispatch settlement.
test("the pending session write fences dispatch while a held executor permits the next binding", async () => {
  const h = await harness();
  try {
    controls.memory = false; controls.write = gate(); controls.execution = gate();
    await h.start("write-lock");
    await until(() => controls.events.includes("write"));
    await h.flush();
    assert.deepEqual(controls.launches, []);
    controls.write.release();
    await until(() => controls.launches.length === 1);
    await h.start("write-lock");
    await until(() => controls.launches.length === 2);
    assert.equal(controls.events.filter(event => event === "read").length, 2);
  } finally { await h.close(); }
});

// Mutation: check concurrency before awaiting terminalization of a stopping run.
test("a stopping run's terminal wait precedes the next concurrency decision", async () => {
  const h = await harness();
  try {
    controls.execution = gate();
    const first = await h.start("stopping");
    await until(() => controls.launches.length === 1);
    await h.scope.lifecycle.cancel({ runId: first });
    controls.events = [];
    const next = await h.start("stopping");
    await until(() => controls.events.includes(`terminal:${first}`));
    assert.equal(controls.events.includes("concurrency"), false);
    assert.equal(controls.launches.length, 1);
    await h.scope.lifecycle.finish({ runId: first, status: "cancelled", code: null, signal: null, resumable: false });
    await until(() => controls.launches.length === 2);
    assert.equal(controls.launches[1]?.runId, next);
    assert.ok(controls.events.indexOf(`terminal:${first}`) < controls.events.indexOf("concurrency"));
  } finally { await h.close(); }
});

// Mutation: share one grant slot across concurrent launches instead of using async contexts.
test("the augmenter reads each principal's grant after an await with both runs in flight", async () => {
  const h = await harness();
  try {
    controls.overlay = gate(); controls.execution = gate();
    const owner = await h.start("owner-chat", "owner");
    const other = await h.start("other-chat", "other");
    await until(() => controls.launches.length === 2);
    assert.equal(controls.launches.length, 2);
    controls.overlay.release(); await until(() => controls.overlays.size === 2);
    assert.notEqual(controls.overlays.get(owner), controls.overlays.get(other));
    assert.equal(controls.launches.find(run => run.runId === owner)?.nativeCapabilities?.subagents, true);
    assert.equal(controls.launches.find(run => run.runId === other)?.nativeCapabilities?.subagents, false);
  } finally { await h.close(); }
});

// Mutations: wrap the executor error; change the startup stage at the failure boundary.
test("dispatch failure retains its error object and CLI execution stage", async () => {
  const h = await harness();
  try {
    const sentinel = new Error("dispatch sentinel"); controls.dispatchError = sentinel;
    const runId = await h.start("dispatch-error");
    await h.scope.lifecycle.waitForTerminal({ runId }, { signal: AbortSignal.timeout(2_000) });
    assert.strictEqual(controls.failures.at(-1)?.startup?.error, sentinel);
    assert.equal(controls.failures.at(-1)?.startup?.stage, "CLI execution");
  } finally { await h.close(); }
});
