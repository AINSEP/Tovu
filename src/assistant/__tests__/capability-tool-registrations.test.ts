import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext } from "@jini-ai/core";

import {
  registerCapabilitySource,
  resetCapabilitySourcesForTests,
  type CapabilityCard,
} from "../capability-source-registry.js";
import { buildCapabilityToolRegistrations, resetCapabilityCatalogForTests } from "../capability-tool-registrations.js";

/**
 * @file The tool-handler layer `capability-catalog-query.test.ts`/`capability-source.unit.test.ts`
 * deliberately do not cover — Codex's first-round review found a real gap here (see the fix this
 * file's own regression test proves): `capability_get`'s ERROR path, unlike its success path, did
 * not strip a source's `read()` rejection before it reached the model, and Node's own filesystem
 * errors (ENOENT, EACCES, ...) embed absolute host paths in `error.message`. `ToolExecutor`
 * (`@jini-ai/daemon`) turns a thrown error into `{status:'failed', error: err.message}` — `.message`
 * is the entire leak surface, which is what the regression test below asserts against directly.
 *
 * Every test here builds `ToolRegistration`s directly via `buildCapabilityToolRegistrations`, not
 * through `contributeCapabilityTools()`/`tool-contribution-registry.ts` — this file is about the
 * handlers' own behavior, not the registry seam (already covered elsewhere).
 */

const WORKSPACE_ID = "workspace-under-test";

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return {
    executionId: "exec-1",
    principal: { id: "principal-1" },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  };
}

function fakeCard(id: string, overrides: Partial<CapabilityCard> = {}): CapabilityCard {
  return {
    id,
    kind: "test-kind",
    pluginId: "test-plugin",
    skillName: "test-skill",
    revision: "test-revision",
    name: "Test Card",
    description: "A fake card for exercising the tool wiring layer.",
    keywords: ["test"],
    source: "test-source",
    handle: { note: "opaque" },
    ...overrides,
  };
}

function registrationsFor(workspaceId: string) {
  const registrations = buildCapabilityToolRegistrations({ workspaceId });
  const search = registrations.find((r) => r.descriptor.id === "capability_search");
  const get = registrations.find((r) => r.descriptor.id === "capability_get");
  assert.ok(search, "capability_search must be wired");
  assert.ok(get, "capability_get must be wired");
  return { search, get };
}

async function settle<T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}

test.beforeEach(() => {
  resetCapabilitySourcesForTests();
  resetCapabilityCatalogForTests();
});

// ---------------------------------------------------------------------------
// BLOCKER regression: an absolute host path must never escape through the ERROR path
// ---------------------------------------------------------------------------

test("capability_get never leaks an absolute host path through its ERROR path when a source's read() rejects", async () => {
  const SENTINEL_PATH = "/Users/la/Programming/Tovu/infra/agent-plugins/SECRET-PATH-PROOF/SKILL.md";
  registerCapabilitySource({
    id: "leaky-source",
    list: async () => [fakeCard("leaky:one", { source: "leaky-source" })],
    read: async () => {
      // The exact shape a real ENOENT from `readInstalledSkillMarkdown`/`assertContainedOnDisk`
      // takes — Node's own fs errors embed the absolute path in `.message`, not a separate field.
      throw new Error(`ENOENT: no such file or directory, open '${SENTINEL_PATH}'`);
    },
  });

  const { get } = registrationsFor(WORKSPACE_ID);
  const outcome = await settle(get.handler(executionContext({ id: "leaky:one" })));

  assert.equal(outcome.ok, false, "capability_get must fail (throw) when read() rejects, not silently succeed");
  assert.ok(!outcome.ok);
  const error = outcome.error as Error;

  // Asserted on a serialized representation of everything that could carry the leak forward —
  // message (the actual channel `ToolExecutor` turns into the model-facing `error` string),
  // `cause` (in case a future edit re-attaches the original error), and `stack` (defense in depth) —
  // not just a loose read of `.message` alone.
  const serialized = JSON.stringify({ message: error.message, cause: (error as { cause?: unknown }).cause, stack: error.stack });
  assert.ok(!serialized.includes(SENTINEL_PATH), `capability_get's failure must not leak the absolute path; got: ${serialized}`);
  assert.ok(!serialized.includes("SECRET-PATH-PROOF"), `must not leak even a substring of the sentinel; got: ${serialized}`);
});

// ---------------------------------------------------------------------------
// File-inventory field — capability_get's `files`, sourced from a CapabilitySource's listFiles()
// ---------------------------------------------------------------------------

test("capability_get never leaks an absolute host path through its ERROR path when a source's listFiles() rejects", async () => {
  const SENTINEL_PATH = "/Users/la/Programming/Tovu/infra/agent-plugins/SECRET-INVENTORY-PROOF/notes.md";
  registerCapabilitySource({
    id: "leaky-inventory-source",
    list: async () => [fakeCard("leaky:inventory", { source: "leaky-inventory-source" })],
    read: async () => "real content — read() itself succeeds",
    listFiles: async () => {
      // The exact shape a real ENOENT from a filesystem-backed listFiles() takes — same leak surface
      // as read()'s own rejection above, just from the other optional member.
      throw new Error(`ENOENT: no such file or directory, open '${SENTINEL_PATH}'`);
    },
  });

  const { get } = registrationsFor(WORKSPACE_ID);
  const outcome = await settle(get.handler(executionContext({ id: "leaky:inventory" })));

  assert.equal(outcome.ok, false, "capability_get must fail (throw) when listFiles() rejects, not silently succeed");
  assert.ok(!outcome.ok);
  const error = outcome.error as Error;

  // Exact text: the failure must name only the capability id, never the source's own error text —
  // the same generic message read()'s own rejection produces, since both share one catch block.
  assert.equal(
    error.message,
    "capability_get: capability 'leaky:inventory' could not be read; its installed files may have changed since it was indexed",
  );

  const serialized = JSON.stringify({ message: error.message, cause: (error as { cause?: unknown }).cause, stack: error.stack });
  assert.ok(!serialized.includes(SENTINEL_PATH), `capability_get's failure must not leak the absolute path; got: ${serialized}`);
  assert.ok(!serialized.includes("SECRET-INVENTORY-PROOF"), `must not leak even a substring of the sentinel; got: ${serialized}`);
});

test("capability_get includes a source's listFiles() output verbatim as the response's 'files' array", async () => {
  const files = ["/pkg/root/references/a.md", "/pkg/root/references/b.md"];
  registerCapabilitySource({
    id: "s3",
    list: async () => [fakeCard("s3:one", { source: "s3" })],
    read: async () => "content",
    listFiles: async () => files,
  });

  const { get } = registrationsFor(WORKSPACE_ID);
  const result = (await get.handler(executionContext({ id: "s3:one" }))) as Record<string, unknown>;

  assert.deepEqual(result.files, files);
});

test("capability_get response has no 'files' key at all when the source declares no listFiles — omitted, not an empty array", async () => {
  registerCapabilitySource({
    id: "s4",
    list: async () => [fakeCard("s4:one", { source: "s4" })],
    read: async () => "content, no listFiles declared",
  });

  const { get } = registrationsFor(WORKSPACE_ID);
  const result = (await get.handler(executionContext({ id: "s4:one" }))) as Record<string, unknown>;

  assert.ok(
    !("files" in result),
    "a source with no listFiles must produce a response with no 'files' key — an omitted method and an empty array mean different things",
  );
  assert.equal(result.content, "content, no listFiles declared", "the rest of the response must keep working exactly as before");
});

// ---------------------------------------------------------------------------
// Success-path serialization — the counterpart to the blocker, for both tools
// ---------------------------------------------------------------------------

test("capability_search output never contains handle or an absolute path — serialized payload", async () => {
  const ABSOLUTE_PATH = "/Users/la/Programming/Tovu/infra/agent-plugins/ws/workspace-local/packages/sha256/abc123";
  registerCapabilitySource({
    id: "s1",
    list: async () => [fakeCard("s1:findable", { name: "Findable Thing", handle: { packageRoot: ABSOLUTE_PATH, skillPath: "skills/x/SKILL.md" } })],
  });

  const { search } = registrationsFor(WORKSPACE_ID);
  const result = await search.handler(executionContext({ query: "findable" }));

  const serialized = JSON.stringify(result);
  // Prove the hit is actually PRESENT before asserting what it must not contain. Without this, an
  // empty result set satisfies every negative assertion below and the test passes by finding
  // nothing — a privacy test that can succeed vacuously is worse than no test, because it reads as
  // coverage. (Codex re-verification, 2026-08-22, the one finding left open at score 9.)
  assert.ok(
    serialized.includes("s1:findable"),
    `the fixture card must actually be returned before this test can assert anything about leakage; got: ${serialized}`,
  );
  assert.ok(!serialized.includes(ABSOLUTE_PATH), "capability_search output must not contain the handle's absolute path");
  assert.ok(!serialized.includes("handle"), "capability_search output must not contain a 'handle' key at all");
});

test("capability_get success output never contains handle or an absolute path — serialized payload", async () => {
  const ABSOLUTE_PATH = "/Users/la/Programming/Tovu/infra/agent-plugins/ws/workspace-local/packages/sha256/def456";
  registerCapabilitySource({
    id: "s2",
    list: async () => [fakeCard("s2:one", { handle: { packageRoot: ABSOLUTE_PATH, skillPath: "skills/y/SKILL.md" } })],
    read: async () => "real skill content, no filesystem paths in here",
  });

  const { get } = registrationsFor(WORKSPACE_ID);
  const result = await get.handler(executionContext({ id: "s2:one" }));

  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(ABSOLUTE_PATH), "capability_get output must not contain the handle's absolute path");
  assert.ok(!serialized.includes("handle"), "capability_get output must not contain a 'handle' key at all");
});

// ---------------------------------------------------------------------------
// Shared in-flight promise, not a boolean flag
// ---------------------------------------------------------------------------

test("two near-simultaneous first calls build the catalog exactly once", async () => {
  let listCallCount = 0;
  registerCapabilitySource({
    id: "counted",
    list: async () => {
      listCallCount += 1;
      // A real delay, so both calls below are genuinely in flight together rather than the second
      // one arriving after the first has already resolved synchronously.
      await new Promise((resolve) => setTimeout(resolve, 10));
      return [fakeCard("counted:one")];
    },
  });

  const { search } = registrationsFor(WORKSPACE_ID);
  await Promise.all([search.handler(executionContext({ query: "anything" })), search.handler(executionContext({ query: "anything" }))]);

  assert.equal(listCallCount, 1, "the source's list() must be called exactly once across both concurrent first calls");
});

// ---------------------------------------------------------------------------
// Workspace threading — never process.env.TOVU_WORKSPACE
// ---------------------------------------------------------------------------

test("a source's list() receives the workspaceId from routeDeps — process.env.TOVU_WORKSPACE set to a DIFFERENT value has no effect", async () => {
  const previous = process.env.TOVU_WORKSPACE;
  process.env.TOVU_WORKSPACE = "totally-different-workspace-from-env";
  try {
    let receivedWorkspaceId: string | undefined;
    registerCapabilitySource({
      id: "workspace-probe",
      list: async (ctx) => {
        receivedWorkspaceId = ctx.workspaceId;
        return [];
      },
    });

    const { search } = registrationsFor(WORKSPACE_ID);
    await search.handler(executionContext({ query: "anything" }));

    assert.equal(receivedWorkspaceId, WORKSPACE_ID);
    assert.notEqual(receivedWorkspaceId, "totally-different-workspace-from-env");
  } finally {
    if (previous === undefined) delete process.env.TOVU_WORKSPACE;
    else process.env.TOVU_WORKSPACE = previous;
  }
});

// ---------------------------------------------------------------------------
// Workspace-mismatch assertion — exact text
// ---------------------------------------------------------------------------

test("a second build call scoped to a DIFFERENT workspaceId than the cached one throws the exact mismatch text", async () => {
  registerCapabilitySource({ id: "any-source", list: async () => [] });

  const { search: searchA } = registrationsFor("workspace-a");
  await searchA.handler(executionContext({ query: "anything" })); // builds + caches for workspace-a

  const { search: searchB } = registrationsFor("workspace-b");
  const outcome = await settle(searchB.handler(executionContext({ query: "anything" })));

  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok);
  assert.equal(
    (outcome.error as Error).message,
    "capability catalog was already built for workspace 'workspace-a', but this call is scoped to 'workspace-b' — one process must serve exactly one workspace (see capability-tool-registrations.ts's header)",
  );
});
