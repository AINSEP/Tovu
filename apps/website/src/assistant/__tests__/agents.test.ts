import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AGENT_DEFS, resolveAgentLaunch, runtimeSupportsExternalTools } from "@jini-ai/agent-runtime";

import { listAssistantAgents, rescanAssistantAgents, setAgentModelProberForTesting } from "../agents.js";
import { createLiveModelDiscovery } from "../live-model-cache.js";
import { InMemoryAdminExecutionCredentialRepo } from "../execution-credential-store.memory.js";
import type { SecretSealerPort } from "../../features/webhooks/index.js";

// No test here may spawn a real CLI's model listing: every test runs against a prober that reports
// "nothing live" unless it installs its own.
let fixtureDir: string;
const originalClaudeBin = process.env.CLAUDE_BIN;
before(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), "tovu-agent-probe-"));
  const executable = join(fixtureDir, "claude");
  writeFileSync(executable, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  process.env.CLAUDE_BIN = executable;
  setAgentModelProberForTesting(async ({ def }) => ({ models: def.fallbackModels, source: "fallback" }));
});
after(() => {
  setAgentModelProberForTesting(null);
  if (originalClaudeBin === undefined) delete process.env.CLAUDE_BIN;
  else process.env.CLAUDE_BIN = originalClaudeBin;
  rmSync(fixtureDir, { recursive: true, force: true });
});

/**
 * @file Regression coverage for `listAssistantAgents()` projecting model/reasoning metadata.
 *
 * This DTO used to silently drop `models`/`reasoningOptions` even though the underlying
 * `RuntimeAgentDef` (from `@jini-ai/agent-runtime`) always carried them — Tovu's own hand-written
 * ambient shim for that package (`jini-agent-runtime-shim.d.ts`, needed because the root tsconfig's
 * `moduleResolution: "Node"` can't read the package's `exports` map) declared a narrower
 * `RuntimeAgentDef` that never widened to include those fields, so nothing in `agents.ts` ever
 * read or forwarded them. The frontend's `AgentRuntimePicker` only renders the model/reasoning
 * `<select>`s when `AgentSummary.models`/`.reasoningOptions` are present, so this was invisible at
 * the type layer and the UI layer alike until someone looked for the dropdown. Assert directly on
 * the real, unmocked `AGENT_DEFS` registry (not a fake) so a future shim/DTO regression here fails
 * a test instead of only showing up as a missing dropdown in manual testing.
 */

test("listAssistantAgents projects fallback models and reasoning options for claude", async () => {
  const agents = await listAssistantAgents();
  const claude = agents.find((agent) => agent.id === "claude");
  assert.ok(claude, "expected a 'claude' entry in the agent list");
  assert.ok(claude.models && claude.models.length > 0, "expected claude.models to be non-empty");
  assert.ok(
    claude.reasoningOptions && claude.reasoningOptions.length > 0,
    "expected claude.reasoningOptions to be non-empty",
  );
  assert.equal(claude.modelsSource, "fallback");
  const def = AGENT_DEFS.find((candidate) => candidate.id === "claude");
  assert.ok(def);
  assert.deepEqual(claude.models, def.fallbackModels);
  assert.deepEqual(claude.reasoningOptions, def.reasoningOptions);
  for (const option of claude.reasoningOptions ?? []) {
    assert.equal(typeof option.id, "string");
    assert.equal(typeof option.label, "string");
  }
});

/**
 * @file Regression coverage for the transcript-duplication bug: the admin transport used to resend
 * the full rendered transcript on every turn regardless of the target agent, even for defs whose CLI
 * already resumes its own multi-turn session (`--resume`/`session/load`) — duplicating history the
 * CLI already remembers on top of what it re-derives from `--resume`. `@jini-ai/agent-runtime`'s
 * `resumesSessionViaCli`/`resumesSessionViaAcpLoad` doc (`types.ts`) is explicit that a caller
 * should send just the latest message for these defs; `carriesOwnMemory` is `listAssistantAgents`'s
 * client-safe projection of that pair so the admin transport can gate on it without importing
 * `@jini-ai/agent-runtime` server-only internals into the browser.
 *
 * Asserted against the real `AGENT_DEFS` registry rather than a hand-maintained id list, so a def
 * that later opts into (or out of) resume support is covered automatically instead of silently
 * drifting out of sync with this projection.
 */
test("listAssistantAgents' carriesOwnMemory exactly matches each def's own resumesSessionViaCli/resumesSessionViaAcpLoad declaration", async () => {
  const agents = await listAssistantAgents();
  assert.ok(AGENT_DEFS.length > 0, "expected at least one real def to assert against");
  for (const def of AGENT_DEFS) {
    const agent = agents.find((candidate) => candidate.id === def.id);
    assert.ok(agent, `expected an agent list entry for def '${def.id}'`);
    const expected = Boolean(def.resumesSessionViaCli) || Boolean(def.resumesSessionViaAcpLoad);
    assert.equal(
      agent.carriesOwnMemory === true,
      expected,
      `agent '${def.id}'.carriesOwnMemory should be ${expected} (resumesSessionViaCli=${def.resumesSessionViaCli}, resumesSessionViaAcpLoad=${def.resumesSessionViaAcpLoad}), got ${agent.carriesOwnMemory}`,
    );
  }
});

/**
 * @file Regression coverage for the "silent zero tools" bug: three defs (aider, antigravity, pi)
 * have no `externalMcpInjection` mechanism (each documents why in its own def file — see
 * `@jini-ai/agent-runtime`'s `runtimeSupportsExternalTools` doc), so a user who picked one of them
 * in the chat runtime picker got an agent with zero Tovu/Jini tools and no indication why. This pins
 * `listAssistantAgents`' `supportsTools` projection to the real `AGENT_DEFS` registry (not a
 * hardcoded id list), matching the `carriesOwnMemory` test above, so the picker's "No tools" badge
 * (`@jini-ai/chat`'s `AgentRuntimePicker`) tracks the def-level fact automatically instead of
 * drifting stale.
 */
test("listAssistantAgents' supportsTools exactly matches each def's own runtimeSupportsExternalTools() result", async () => {
  const agents = await listAssistantAgents();
  assert.ok(AGENT_DEFS.length > 0, "expected at least one real def to assert against");
  for (const def of AGENT_DEFS) {
    const agent = agents.find((candidate) => candidate.id === def.id);
    assert.ok(agent, `expected an agent list entry for def '${def.id}'`);
    const expected = runtimeSupportsExternalTools({ def });
    assert.equal(
      agent.supportsTools,
      expected,
      `agent '${def.id}'.supportsTools should be ${expected} (externalMcpInjection=${def.externalMcpInjection}), got ${agent.supportsTools}`,
    );
  }
});

test("listAssistantAgents never returns an agent with an empty id/name", async () => {
  const agents = await listAssistantAgents();
  assert.ok(agents.length > 0, "expected at least one agent def");
  for (const agent of agents) {
    assert.ok(agent.id, `agent missing id: ${JSON.stringify(agent)}`);
    assert.ok(agent.name, `agent ${agent.id} missing name`);
  }
});

/**
 * @file Regression coverage for the 2026-08-10 caching fix: `listAssistantAgents()` used to re-run
 * the full 24-def PATH probe on every single call, and `POST /api/agents/rescan` had no way to tell
 * apart from a plain read (see `agents.ts`'s module doc for the production cost — `AssistantDock`'s
 * health-check poll re-triggered the full sweep dozens of times a minute). These pin the memoization
 * contract directly: same underlying async work reused across calls, without needing to mock
 * `@jini-ai/agent-runtime` — asserting on PROMISE IDENTITY across back-to-back (unawaited) calls is
 * enough to prove a second probe was never started, and works against the real `AGENT_DEFS`
 * registry like the two tests above.
 */
test("listAssistantAgents memoizes — two back-to-back calls reuse the same in-flight/settled probe", () => {
  const first = listAssistantAgents();
  const second = listAssistantAgents();
  assert.strictEqual(first, second, "expected the second call to reuse the first call's own promise, not start a new probe");
});

test("rescanAssistantAgents forces a fresh probe, and a later listAssistantAgents call picks up that fresh result", async () => {
  let models = [{ id: "before-rescan", label: "Before rescan" }];
  setAgentModelProberForTesting(async ({ def }) => def.id === "claude"
    ? { models, source: "live" }
    : { models: def.fallbackModels, source: "fallback" });
  try {
    const before = listAssistantAgents();
    assert.deepEqual((await before).find((agent) => agent.id === "claude")?.models, models);
    models = [{ id: "after-rescan", label: "After rescan" }];
    const rescanned = rescanAssistantAgents();
    assert.notStrictEqual(rescanned, before, "expected rescan to start a NEW probe rather than reuse the cached one");
    const after = listAssistantAgents();
    assert.strictEqual(after, rescanned, "expected the cache to now hold the rescanned probe, not the stale pre-rescan one");
    assert.deepEqual((await rescanned).find((agent) => agent.id === "claude")?.models, models);
    assert.deepEqual((await after).find((agent) => agent.id === "claude")?.models, models);
  } finally {
    setAgentModelProberForTesting(async ({ def }) => ({ models: def.fallbackModels, source: "fallback" }));
  }
});

/**
 * @file Regression coverage for the "Local CLI picker never shows a live model" bug: the probe used to
 * hardcode every entry to `fallbackModels`/`"fallback"` and never called the def's model listing at
 * all, so `claude`'s credential-free live catalog (e.g. a new `claude-opus-*` id) could never reach
 * `GET /api/agents`/`POST /api/agents/rescan`, however the runtime-side probe behaved.
 */
test("rescanAssistantAgents surfaces the live model list the prober returns for an available def", async () => {
  const liveOnly = { id: "claude-live-only-test-id", label: "claude-live-only-test-id" };
  const probed: string[] = [];
  setAgentModelProberForTesting(async ({ def }) => {
    probed.push(def.id);
    return def.id === "claude"
      ? { models: [...def.fallbackModels, liveOnly], source: "live" }
      : { models: def.fallbackModels, source: "fallback" };
  });
  try {
    const agents = await rescanAssistantAgents();
    const claude = agents.find((agent) => agent.id === "claude");
    assert.ok(claude, "expected a 'claude' entry in the agent list");
    assert.equal(claude.available, true, "the fixture must make Claude available");
    assert.equal(claude.modelsSource, "live");
    assert.ok(claude.models?.some((model) => model.id === liveOnly.id), "expected the live-only id in claude.models");
    for (const def of AGENT_DEFS) {
      const installed = Boolean(resolveAgentLaunch({ def }).launchPath);
      assert.equal(probed.includes(def.id), installed, `def '${def.id}' probed=${probed.includes(def.id)} but installed=${installed}`);
    }
  } finally {
    setAgentModelProberForTesting(async ({ def }) => ({ models: def.fallbackModels, source: "fallback" }));
  }
});

test("known runtime capabilities retain their memory and tool semantics", async () => {
  const agents = await listAssistantAgents();
  for (const [id, carriesOwnMemory, supportsTools] of [
    ["claude", true, true],
    ["aider", false, false],
  ] as const) {
    const agent = agents.find((candidate) => candidate.id === id);
    assert.ok(agent, `expected ${id}`);
    assert.equal(agent.carriesOwnMemory, carriesOwnMemory);
    assert.equal(agent.supportsTools, supportsTools);
  }
});

test("assistant inventory preserves dynamic catalog and resolved default for the chat picker", async () => {
  const models = [{ id: "claude-opus-5-5[1m]", label: "claude-opus-5-5[1m]", identityKind: "concrete" as const }];
  const catalog = {
    models, source: "rpc" as const, freshness: "fresh" as const, coverage: "account" as const,
    fetchedAt: "2026-10-08T00:00:00.000Z", expiresAt: "2026-10-08T00:15:00.000Z",
    launchFingerprint: "fixture", diagnostics: [], defaultSelectionId: models[0].id,
  };
  const defaultModelResolution = { status: "resolved" as const, id: models[0].id, source: "rpc" as const, resolvedAt: catalog.fetchedAt, launchFingerprint: "fixture" };
  setAgentModelProberForTesting(async ({ def }) => def.id === "claude"
    ? { models, source: "live", catalog, defaultModelResolution }
    : { models: def.fallbackModels, source: "fallback" });
  try {
    const claude = (await rescanAssistantAgents()).find(agent => agent.id === "claude");
    assert.ok(claude);
    assert.deepEqual(claude.models, models);
    assert.deepEqual(claude.modelCatalog, catalog);
    assert.deepEqual(claude.defaultModelResolution, defaultModelResolution);
    assert.equal(claude.supportsConcreteModelSelection, AGENT_DEFS.find(def => def.id === "claude")?.supportsConcreteModelSelection);
  } finally {
    setAgentModelProberForTesting(async ({ def }) => ({ models: def.fallbackModels, source: "fallback" }));
  }
});

test("assistant rescan forces model discovery and preserves an unresolved default without guessing", async () => {
  const forces: boolean[] = [];
  const defaultModelResolution = { status: "unresolved" as const, reason: "Native metadata did not resolve a default; pick a concrete model." };
  setAgentModelProberForTesting(async ({ def }, options = {}) => {
    if (def.id === "claude") forces.push(options.force === true);
    return { models: def.fallbackModels, source: "fallback", defaultModelResolution };
  });
  try {
    const first = (await listAssistantAgents()).find(agent => agent.id === "claude");
    assert.deepEqual(first?.defaultModelResolution, defaultModelResolution);
    const rescanned = (await rescanAssistantAgents()).find(agent => agent.id === "claude");
    assert.deepEqual(rescanned?.defaultModelResolution, defaultModelResolution);
    assert.deepEqual(forces, [false, true]);
  } finally {
    setAgentModelProberForTesting(async ({ def }) => ({ models: def.fallbackModels, source: "fallback" }));
  }
});

/** The credential port is deliberately a transparent fake: these cases prove discovery/cache
 * policy, not encryption. The real saved-secret compatibility suite remains a separate gate.
 */
function liveDiscoveryFixture() {
  const repo = new InMemoryAdminExecutionCredentialRepo();
  const sealer: SecretSealerPort = {
    seal: async () => { throw new Error("discovery must not write credentials"); },
    open: async ({ sealed }) => sealed.ciphertext,
  };
  return {
    repo,
    sealer,
    async save({ workspaceId = "workspace", principalId = "principal", apiKey = "key-a", protocol = "anthropic", baseUrl = "https://provider.example" } = {}) {
      await repo.upsert({
        workspaceId, principalId, protocol, baseUrl, providerId: "provider", model: null, maxTokens: null,
        sealed: { keyId: "test", ciphertext: apiKey, nonce: "test", alg: "AES-256-GCM" },
        masked: "test", aadVersion: 0, createdAt: "2026-10-02T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z",
      });
    },
  };
}

// REGRESSION: fails if credentialFingerprint is removed from the cacheKey tuple.
test("live discovery reissues on credential rotation inside the same TTL", async () => {
  const fixture = liveDiscoveryFixture();
  const calledKeys: string[] = [];
  const discovery = createLiveModelDiscovery({ ...fixture, clock: { nowMs: () => 0 }, discover: async ({ apiKey }) => {
    calledKeys.push(apiKey);
    return [{ id: apiKey, label: apiKey }];
  } });
  await fixture.save({ apiKey: "key-a" });
  assert.deepEqual(await discovery.getLiveClaudeModels({ workspaceId: "workspace", principalId: "principal" }), [{ id: "key-a", label: "key-a" }]);
  await fixture.save({ apiKey: "key-b" });
  assert.deepEqual(await discovery.getLiveClaudeModels({ workspaceId: "workspace", principalId: "principal" }), [{ id: "key-b", label: "key-b" }]);
  assert.deepEqual(calledKeys, ["key-a", "key-b"]);
});

// REGRESSION: fails if the discovery outcome wrapper discards a successful empty model list.
test("live discovery contains rejection, keeps the failure TTL, then recovers at expiry", async () => {
  const fixture = liveDiscoveryFixture();
  await fixture.save();
  let now = 0;
  let calls = 0;
  const discovery = createLiveModelDiscovery({ ...fixture, clock: { nowMs: () => now }, discover: async () => {
    if (++calls === 1) throw new Error("offline");
    return [];
  } });
  const key = { workspaceId: "workspace", principalId: "principal" };
  assert.equal(await discovery.getLiveClaudeModels(key), null);
  now = 5 * 60_000 - 1;
  assert.equal(await discovery.getLiveClaudeModels(key), null);
  assert.equal(calls, 1);
  now++;
  assert.deepEqual(await discovery.getLiveClaudeModels(key), []);
  assert.equal(calls, 2);
});

// REGRESSION: fails if the !stored.apiKey.trim() guard is removed before cache/discovery.
test("live discovery never calls the provider for absent, wrong-protocol or blank credentials", async () => {
  const fixture = liveDiscoveryFixture();
  let calls = 0;
  const discovery = createLiveModelDiscovery({ ...fixture, clock: { nowMs: () => 0 }, discover: async () => { calls++; return []; } });
  const key = { workspaceId: "workspace", principalId: "principal" };
  assert.equal(await discovery.getLiveClaudeModels(key), null);
  await fixture.save({ protocol: "openai" });
  assert.equal(await discovery.getLiveClaudeModels(key), null);
  await fixture.save({ apiKey: " " });
  assert.equal(await discovery.getLiveClaudeModels(key), null);
  assert.equal(calls, 0);
  await fixture.save();
  assert.deepEqual(await discovery.getLiveClaudeModels(key), []);
  await fixture.save({ protocol: "openai" });
  assert.equal(await discovery.getLiveClaudeModels(key), null);
  assert.equal(calls, 1);
});

// REGRESSION: fails if the factory cache is hoisted into shared module state.
test("live discovery instances own their state and delimiter-containing tenant IDs cannot collide", async () => {
  const fixture = liveDiscoveryFixture();
  await fixture.save({ workspaceId: "ws:1", principalId: "2", apiKey: "same-key" });
  await fixture.save({ workspaceId: "ws", principalId: "1:2", apiKey: "same-key" });
  let calls = 0;
  const deps = { ...fixture, clock: { nowMs: () => 0 }, discover: async ({ apiKey }: { apiKey: string }) => { calls++; return [{ id: apiKey, label: apiKey }]; } };
  const first = createLiveModelDiscovery(deps);
  const second = createLiveModelDiscovery(deps);
  const key = { workspaceId: "ws:1", principalId: "2" };
  assert.deepEqual(await first.getLiveClaudeModels(key), [{ id: "same-key", label: "same-key" }]);
  assert.deepEqual(await first.getLiveClaudeModels({ workspaceId: "ws", principalId: "1:2" }), [{ id: "same-key", label: "same-key" }]);
  await second.getLiveClaudeModels(key);
  assert.equal(calls, 3);
});

// PARITY: requests share the in-flight discovery even when it outlasts the TTL.
test("live discovery coalesces concurrent calls while the provider is still responding", async () => {
  const fixture = liveDiscoveryFixture();
  await fixture.save();
  let now = 0;
  let calls = 0;
  let complete!: (models: { id: string; label: string }[]) => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => { started = resolve; });
  const discovery = createLiveModelDiscovery({ ...fixture, clock: { nowMs: () => now }, discover: () => {
    calls++;
    started();
    return new Promise<{ id: string; label: string }[]>((resolve) => { complete = resolve; });
  } });
  const key = { workspaceId: "workspace", principalId: "principal" };
  const first = discovery.getLiveClaudeModels(key);
  await waiting;
  now = 10 * 60_000;
  const second = discovery.getLiveClaudeModels(key);
  // Let the second credential resolution reach the cache before settling the provider response.
  await new Promise<void>((resolve) => queueMicrotask(() => queueMicrotask(resolve)));
  complete([{ id: "live", label: "Live" }]);
  assert.deepEqual(await first, [{ id: "live", label: "Live" }]);
  assert.deepEqual(await second, await first);
  assert.equal(calls, 1);
});

// F6.2: an endpoint correction must invalidate even a cached failure inside the TTL.
test("live discovery retries a cached failure when the stored baseUrl changes", async () => {
  const fixture = liveDiscoveryFixture();
  const endpoints: string[] = [];
  const discovery = createLiveModelDiscovery({ ...fixture, clock: { nowMs: () => 0 }, discover: async ({ baseUrl }) => {
    endpoints.push(baseUrl);
    return baseUrl === "https://fixed.example" ? [{ id: "recovered", label: "Recovered" }] : null;
  } });
  const key = { workspaceId: "workspace", principalId: "principal" };
  await fixture.save({ baseUrl: "https://broken.example" });
  assert.equal(await discovery.getLiveClaudeModels(key), null);
  await fixture.save({ baseUrl: "https://fixed.example" });
  assert.deepEqual(await discovery.getLiveClaudeModels(key), [{ id: "recovered", label: "Recovered" }]);
  assert.deepEqual(endpoints, ["https://broken.example", "https://fixed.example"]);
});
