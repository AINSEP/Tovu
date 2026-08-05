import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { AesGcmSecretSealer } from "../../integrations/secret-sealer.aesgcm";
import { InMemoryKeyring } from "../../integrations/keyring.memory";
import { InMemoryAdminExecutionCredentialRepo } from "../execution-credential-store.memory";
import { setExecutionCredential } from "../execution-credential-store";
import { getLiveClaudeModels, resetLiveModelCacheForTesting, unionModels } from "../live-model-cache";

/**
 * @file `live-model-cache.ts` — the two properties the design doc's Local CLI live-discovery
 * decision is built on:
 * 1. **Never a gate.** No stored credential, or a stored credential for any protocol other than
 *    `anthropic`, must make ZERO network calls — proven here by making `globalThis.fetch` throw
 *    and asserting the call still resolves.
 * 2. **Union, never replace.** `unionModels` never drops a fallback entry, including the bare
 *    alias ids a REPLACE strategy would risk losing (design §3.5).
 *
 * The "live call" tests use a real `http.createServer` on `127.0.0.1` rather than mocking
 * `listProviderModels`/`fetch` directly: `validateBaseUrlResolved` (`model-catalog.ts`'s own SSRF
 * guard) short-circuits DNS resolution for loopback/IP-literal hosts, so this needs no DNS
 * injection and no network access — same pattern `Jini/packages/agent-runtime/src/providers/
 * __tests__/model-catalog.test.ts` already uses for its own protocol tests.
 */

const WORKSPACE = "workspace-1";
const ADMIN_A = "principal-admin-a";
const clock = { nowIso: () => "2026-08-05T00:00:00.000Z" };
/** Mirrors `live-model-cache.ts`'s internal `LIVE_MODEL_CACHE_TTL_MS` — not exported (callers
 *  should not need to know the exact number), so this is restated here rather than imported. If
 *  the module's TTL ever changes, the cache-expiry test below is the one place that needs updating
 *  to match. */
const TTL_MS = 5 * 60_000;

function makeDeps() {
  const repo = new InMemoryAdminExecutionCredentialRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  return { repo, keyring, sealer, deps: { repo, keyring, sealer, clock } };
}

/** A stand-in Anthropic-shaped `/v1/models` endpoint. Records how many times it was hit so cache
 *  hit/expiry tests can assert on request count instead of only on the returned value. */
async function startProviderServer(
  respond: () => { status: number; body: unknown },
): Promise<{ baseUrl: string; server: Server; requestCount: () => number }> {
  let count = 0;
  const server = createServer((_req, res) => {
    count += 1;
    const { status, body } = respond();
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, server, requestCount: () => count };
}

/**
 * Replaces `globalThis.fetch` with a spy that throws (so a mistaken network attempt fails fast
 * instead of hanging/hitting real DNS) AND records how many times it was invoked. Asserting on
 * `callCount()` — not merely on `getLiveClaudeModels`'s return value — is the part that matters:
 * `listProviderModels` catches every `fetch` failure internally and still resolves to
 * `{ok: false}`, so a thrown-and-caught spy call would otherwise produce the exact same `null`
 * result a correctly-gated zero-network-calls path does. That equivalence was caught directly by
 * this file's own per-file negative verification (removing the wrong-protocol guard originally
 * passed a return-value-only assertion) — see the handoff notes for the reproduction.
 */
function stubFetchSpy(): { callCount: () => number; restore: () => void } {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = (() => {
    count += 1;
    throw new Error("network call must not be attempted on this path");
  }) as typeof fetch;
  return {
    callCount: () => count,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

// ---------------------------------------------------------------------------
// getLiveClaudeModels — the "never a gate" credential branch
// ---------------------------------------------------------------------------

test("no stored credential resolves to null and makes zero network calls", async () => {
  resetLiveModelCacheForTesting();
  const { repo, sealer } = makeDeps();
  const fetchSpy = stubFetchSpy();

  try {
    const result = await getLiveClaudeModels({ repo, sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A });
    assert.equal(result, null);
    assert.equal(fetchSpy.callCount(), 0, "no credential means the network branch must never run");
  } finally {
    fetchSpy.restore();
  }
});

test("a stored credential for a protocol other than anthropic resolves to null and makes zero network calls", async () => {
  resetLiveModelCacheForTesting();
  const { deps, repo, sealer } = makeDeps();
  await setExecutionCredential(deps, {
    workspaceId: WORKSPACE,
    principalId: ADMIN_A,
    apiKey: "sk-openai-test-key",
    protocol: "openai",
  });
  const fetchSpy = stubFetchSpy();

  try {
    const result = await getLiveClaudeModels({ repo, sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A });
    assert.equal(result, null);
    assert.equal(fetchSpy.callCount(), 0, "a non-anthropic credential must never reach the network branch");
  } finally {
    fetchSpy.restore();
  }
});

// ---------------------------------------------------------------------------
// getLiveClaudeModels — the live call, success and failure
// ---------------------------------------------------------------------------

test("an anthropic credential with a reachable provider returns its live models", async () => {
  resetLiveModelCacheForTesting();
  const { deps, repo, sealer } = makeDeps();
  const provider = await startProviderServer(() => ({
    status: 200,
    body: { data: [{ id: "claude-opus-5-20260101", display_name: "Claude Opus 5" }] },
  }));
  try {
    await setExecutionCredential(deps, {
      workspaceId: WORKSPACE,
      principalId: ADMIN_A,
      apiKey: "sk-ant-test-key",
      protocol: "anthropic",
      baseUrl: provider.baseUrl,
    });

    const result = await getLiveClaudeModels({ repo, sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A });

    assert.deepEqual(result, [{ id: "claude-opus-5-20260101", label: "Claude Opus 5" }]);
    assert.equal(provider.requestCount(), 1);
  } finally {
    await new Promise((resolve) => provider.server.close(() => resolve(undefined)));
  }
});

test("a failed live call (provider 500) resolves to null, not a throw", async () => {
  resetLiveModelCacheForTesting();
  const { deps, repo, sealer } = makeDeps();
  const provider = await startProviderServer(() => ({ status: 500, body: { error: "internal error" } }));
  try {
    await setExecutionCredential(deps, {
      workspaceId: WORKSPACE,
      principalId: ADMIN_A,
      apiKey: "sk-ant-test-key",
      protocol: "anthropic",
      baseUrl: provider.baseUrl,
    });

    const result = await getLiveClaudeModels({ repo, sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A });

    assert.equal(result, null);
  } finally {
    await new Promise((resolve) => provider.server.close(() => resolve(undefined)));
  }
});

// ---------------------------------------------------------------------------
// getLiveClaudeModels — TTL cache
// ---------------------------------------------------------------------------

test("a second call within the TTL reuses the cached result instead of re-issuing the live call", async () => {
  resetLiveModelCacheForTesting();
  const { deps, repo, sealer } = makeDeps();
  const provider = await startProviderServer(() => ({
    status: 200,
    body: { data: [{ id: "claude-opus-5-20260101", display_name: "Claude Opus 5" }] },
  }));
  try {
    await setExecutionCredential(deps, {
      workspaceId: WORKSPACE,
      principalId: ADMIN_A,
      apiKey: "sk-ant-test-key",
      protocol: "anthropic",
      baseUrl: provider.baseUrl,
    });
    let fakeNow = 1_000_000;
    const now = () => fakeNow;

    const first = await getLiveClaudeModels({ repo, sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A }, now);
    fakeNow += 1_000; // still well inside the TTL window
    const second = await getLiveClaudeModels({ repo, sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A }, now);

    assert.deepEqual(first, second);
    assert.equal(provider.requestCount(), 1, "the second call must be served from cache, not a fresh request");
  } finally {
    await new Promise((resolve) => provider.server.close(() => resolve(undefined)));
  }
});

test("a call after the TTL has expired re-issues the live call", async () => {
  resetLiveModelCacheForTesting();
  const { deps, repo, sealer } = makeDeps();
  const provider = await startProviderServer(() => ({
    status: 200,
    body: { data: [{ id: "claude-opus-5-20260101", display_name: "Claude Opus 5" }] },
  }));
  try {
    await setExecutionCredential(deps, {
      workspaceId: WORKSPACE,
      principalId: ADMIN_A,
      apiKey: "sk-ant-test-key",
      protocol: "anthropic",
      baseUrl: provider.baseUrl,
    });
    let fakeNow = 1_000_000;
    const now = () => fakeNow;

    await getLiveClaudeModels({ repo, sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A }, now);
    fakeNow += TTL_MS + 1;
    await getLiveClaudeModels({ repo, sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A }, now);

    assert.equal(provider.requestCount(), 2, "an expired cache entry must trigger a fresh live call");
  } finally {
    await new Promise((resolve) => provider.server.close(() => resolve(undefined)));
  }
});

test("cache entries for two tenants never collide, even when their ids would join to the same string under a delimiter-joined key", async () => {
  // A `${workspaceId}:${principalId}` string key would put these two DISTINCT tenants on the SAME
  // slot: "ws:1" + ":" + "2" === "ws" + ":" + "1:2" === "ws:1:2". Tovu is intentionally
  // multi-workspace, so this is a real configuration, not a contrived edge case.
  resetLiveModelCacheForTesting();
  const { deps: depsA, repo: repoA, sealer: sealerA } = makeDeps();
  const { deps: depsB, repo: repoB, sealer: sealerB } = makeDeps();
  const providerA = await startProviderServer(() => ({
    status: 200,
    body: { data: [{ id: "model-a", display_name: "Model A" }] },
  }));
  const providerB = await startProviderServer(() => ({
    status: 200,
    body: { data: [{ id: "model-b", display_name: "Model B" }] },
  }));
  try {
    await setExecutionCredential(depsA, {
      workspaceId: "ws:1",
      principalId: "2",
      apiKey: "key-a",
      protocol: "anthropic",
      baseUrl: providerA.baseUrl,
    });
    await setExecutionCredential(depsB, {
      workspaceId: "ws",
      principalId: "1:2",
      apiKey: "key-b",
      protocol: "anthropic",
      baseUrl: providerB.baseUrl,
    });

    const resultA = await getLiveClaudeModels({ repo: repoA, sealer: sealerA }, { workspaceId: "ws:1", principalId: "2" });
    const resultB = await getLiveClaudeModels({ repo: repoB, sealer: sealerB }, { workspaceId: "ws", principalId: "1:2" });

    assert.deepEqual(resultA, [{ id: "model-a", label: "Model A" }]);
    assert.deepEqual(
      resultB,
      [{ id: "model-b", label: "Model B" }],
      "a colliding string key would have served A's cached result here instead of B's own live call",
    );
    assert.equal(providerB.requestCount(), 1, "B's own provider must have been hit, not skipped via a cache collision with A");
  } finally {
    await new Promise((resolve) => providerA.server.close(() => resolve(undefined)));
    await new Promise((resolve) => providerB.server.close(() => resolve(undefined)));
  }
});

// ---------------------------------------------------------------------------
// getLiveClaudeModels — silent-failure logging
// ---------------------------------------------------------------------------

/** Swaps `console.warn` for a recorder for the duration of `run`, then restores it. */
async function captureWarnings<T>(run: () => Promise<T>): Promise<{ result: T; warnings: unknown[][] }> {
  const original = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    const result = await run();
    return { result, warnings };
  } finally {
    console.warn = original;
  }
}

test("a failed live call logs one warning naming the failure kind — the case an operator needs to see", async () => {
  resetLiveModelCacheForTesting();
  const { deps, repo, sealer } = makeDeps();
  const provider = await startProviderServer(() => ({ status: 500, body: { error: "internal error" } }));
  try {
    await setExecutionCredential(deps, {
      workspaceId: WORKSPACE,
      principalId: ADMIN_A,
      apiKey: "sk-ant-test-key",
      protocol: "anthropic",
      baseUrl: provider.baseUrl,
    });

    const { warnings } = await captureWarnings(() =>
      getLiveClaudeModels({ repo, sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A }),
    );

    assert.equal(warnings.length, 1, "a failed live call must log exactly one warning");
    assert.match(String(warnings[0][0]), /live Claude model discovery failed/);
    assert.match(String(warnings[0][0]), /upstream_unavailable/, "the warning must name the failure kind, not just 'it failed'");
  } finally {
    await new Promise((resolve) => provider.server.close(() => resolve(undefined)));
  }
});

test("the quiet paths (no credential, wrong protocol) log nothing — only an attempted-and-failed live call is worth an operator's attention", async () => {
  resetLiveModelCacheForTesting();
  const { deps, repo, sealer } = makeDeps();
  await setExecutionCredential(deps, {
    workspaceId: WORKSPACE,
    principalId: "principal-openai",
    apiKey: "sk-openai-test-key",
    protocol: "openai",
  });

  const { warnings } = await captureWarnings(async () => {
    await getLiveClaudeModels({ repo, sealer }, { workspaceId: WORKSPACE, principalId: ADMIN_A }); // no credential
    await getLiveClaudeModels({ repo, sealer }, { workspaceId: WORKSPACE, principalId: "principal-openai" }); // wrong protocol
  });

  assert.equal(warnings.length, 0);
});

// ---------------------------------------------------------------------------
// unionModels — design §3.5's union-not-replace merge policy
// ---------------------------------------------------------------------------

const FALLBACK_WITH_ALIASES = [
  { id: "default", label: "Default" },
  { id: "sonnet", label: "Sonnet (alias)" },
  { id: "opus", label: "Opus (alias)" },
  { id: "haiku", label: "Haiku (alias)" },
  { id: "claude-opus-5", label: "claude-opus-5" },
];

test("unionModels keeps every fallback entry unchanged when live discovery returns nothing", () => {
  assert.deepEqual(unionModels(FALLBACK_WITH_ALIASES, []), FALLBACK_WITH_ALIASES);
});

test("unionModels appends a live id not already in fallback, after every fallback entry", () => {
  const live = [{ id: "claude-opus-5-20260101", label: "Claude Opus 5 (2026-01-01)" }];
  assert.deepEqual(unionModels(FALLBACK_WITH_ALIASES, live), [...FALLBACK_WITH_ALIASES, ...live]);
});

test("unionModels dedupes by id — a live entry matching a fallback id is dropped, not duplicated or overwritten", () => {
  const live = [{ id: "claude-opus-5", label: "a different label the live call reported" }];

  const result = unionModels(FALLBACK_WITH_ALIASES, live);

  assert.equal(result.length, FALLBACK_WITH_ALIASES.length, "no duplicate entry for an id already in fallback");
  const opus5 = result.find((model) => model.id === "claude-opus-5");
  assert.equal(opus5?.label, "claude-opus-5", "the fallback entry's label wins — union never overwrites an existing entry");
});

test("unionModels never drops the sonnet/opus/haiku aliases or the default sentinel, even with live entries present", () => {
  const live = [
    { id: "claude-opus-5-20260101", label: "Claude Opus 5" },
    { id: "claude-sonnet-5-20260101", label: "Claude Sonnet 5" },
  ];

  const result = unionModels(FALLBACK_WITH_ALIASES, live);

  for (const alias of ["default", "sonnet", "opus", "haiku"]) {
    assert.ok(result.some((model) => model.id === alias), `expected alias/sentinel '${alias}' to survive the union`);
  }
});
