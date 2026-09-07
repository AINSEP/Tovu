import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/http-kit";

import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { postAgentToolCatalog } from "../agent-tools.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRegistrations, type PostToolDeps } from "../tool-registrations.js";

/**
 * @file The AGENT-TOOL arm of the optimistic-concurrency guard `be45461e` added to `updatePost`
 * and `9c7d16bf` wired through the admin HTTP route.
 *
 * The route arm's fix left `content_post_update` untouched, so the exact clobber that fix closed
 * stayed live through a second route: the assistant could overwrite a human operator's save with
 * no version check and no error. These tests drive the real handler (and, for the model-facing
 * half, the real `/api/delegated-tool-calls` transport a spawned agent actually calls through), so
 * they fail if this arm stops forwarding the value even while the domain guard itself stays right.
 */

const WORKSPACE_ID = "ws-post-tool-concurrency";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-06T00:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };
const BODY_A = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] };
const BODY_B = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }] };

function fakeRouteDeps() {
  let counter = 0;
  const postRepo = new InMemoryPostRepo();
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    postRepo,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as PostToolDeps;
  return { deps, postRepo };
}

function registrationsFor(deps: PostToolDeps): Map<string, ToolRegistration> {
  return new Map(
    buildPostRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore() }).map((r) => [r.descriptor.id, r])
  );
}

/** Checked registry lookup — `registrations.get(id)!` would trip the repo's noNonNullAssertion rule. */
function tool(registrations: Map<string, ToolRegistration>, id: string): ToolRegistration {
  const found = registrations.get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

function call(registration: ToolRegistration, input: unknown) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  };
  return registration.handler(ctx);
}

async function seedPost(postRepo: InMemoryPostRepo) {
  await postRepo.save({
    id: "p1",
    workspaceId: WORKSPACE_ID,
    title: "Shared Post",
    slug: "shared-post",
    bodyJson: EMPTY_DOC,
    status: "draft",
    kind: "post",
    updatedAt: NOW,
    version: 1,
  } as never);
}

/** The stored row, read back through the repo — the only way to prove a rejected save left NOTHING
 *  behind rather than merely reporting an error after writing. */
async function storedPost(postRepo: InMemoryPostRepo): Promise<{ title: string; version: number }> {
  const row = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
  assert.ok(row, "expected the seeded post to still exist");
  return { title: row.title, version: row.version };
}

function updateInput(overrides: Record<string, unknown>): Record<string, unknown> {
  return { id: "p1", kind: "post", title: "Untitled", slug: "shared-post", bodyJson: EMPTY_DOC, status: "draft", ...overrides };
}

/* ------------------------------------------------------------------------------------------------
 * The handler itself
 * ---------------------------------------------------------------------------------------------- */

test("content_post_update: a second agent save built on a superseded version is REJECTED and does not land", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const registrations = registrationsFor(deps);
  const loaded = await storedPost(postRepo);

  // Operator A saves first, from the shared basis. Asserted, not assumed: if this save did not
  // actually advance the row's version the conflict assertion below would be meaningless.
  const first = (await call(tool(registrations, "content_post_update"), updateInput({
    title: "Operator A's document",
    bodyJson: BODY_A,
    expectedVersion: loaded.version,
  }))) as { post: { version: number } };
  assert.equal(first.post.version, loaded.version + 1);

  // Operator B saves from the SAME, now-superseded basis. Before this wiring this call SUCCEEDED
  // and erased A's document.
  await assert.rejects(
    () => call(tool(registrations, "content_post_update"), updateInput({
      title: "Operator B's document",
      bodyJson: BODY_B,
      expectedVersion: loaded.version,
    })),
    (err: unknown) =>
      err instanceof Error &&
      err.message.includes("VERSION_CONFLICT") &&
      err.message.includes("post 'p1' was modified by another save (expected version 1, current version 2)")
  );

  // The rejection is a rejection, not a report: A's document is still what is stored.
  const after = await storedPost(postRepo);
  assert.equal(after.title, "Operator A's document");
  assert.equal(after.version, loaded.version + 1);
});

test("content_post_update: a matching expectedVersion succeeds, and replaying it then conflicts — the value went THROUGH the guard, not around it", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const registrations = registrationsFor(deps);

  const ok = (await call(tool(registrations, "content_post_update"), updateInput({ title: "Edited", expectedVersion: 1 }))) as {
    post: { title: string; version: number };
  };
  assert.equal(ok.post.title, "Edited");
  assert.equal(ok.post.version, 2);

  await assert.rejects(
    () => call(tool(registrations, "content_post_update"), updateInput({ title: "Replay", expectedVersion: 1 })),
    (err: unknown) => err instanceof Error && err.message.includes("VERSION_CONFLICT")
  );
});

test("content_post_update: omitting expectedVersion is still last-write-wins — the guard stays opt-in for the agent too", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const registrations = registrationsFor(deps);

  await call(tool(registrations, "content_post_update"), updateInput({ title: "First" }));
  await call(tool(registrations, "content_post_update"), updateInput({ title: "Second" }));

  const after = await storedPost(postRepo);
  assert.equal(after.title, "Second");
  assert.equal(after.version, 3);
});

for (const [label, value] of [
  ["a numeric string", "1"],
  ["a fractional number", 1.5],
  ["a negative integer", -1],
  ["an explicit null", null],
  ["a boolean", true],
] as const) {
  test(`content_post_update: expectedVersion as ${label} is REJECTED — never silently downgraded to an unguarded save`, async () => {
    const { deps, postRepo } = fakeRouteDeps();
    await seedPost(postRepo);
    const registrations = registrationsFor(deps);

    await assert.rejects(
      () => call(tool(registrations, "content_post_update"), updateInput({ title: "Should Not Land", expectedVersion: value })),
      (err: unknown) =>
        err instanceof Error && err.message.startsWith("'expectedVersion' must be a non-negative integer when present")
    );

    // The whole point of rejecting: a malformed basis must not be quietly treated as "no basis
    // sent" and written through anyway.
    const after = await storedPost(postRepo);
    assert.equal(after.title, "Shared Post");
    assert.equal(after.version, 1);
  });
}

/* ------------------------------------------------------------------------------------------------
 * What the MODEL actually sees — through the real `/api/delegated-tool-calls` transport.
 *
 * A rejection that is not `@jini-ai/core`'s `ToolInputError` is tagged `errorKind: 'internal'` by
 * `ToolExecutor` and then SEC-005-redacted by `delegatedToolExecuteRoute` into a generic
 * `INTERNAL_ERROR` with no message at all. A version conflict reaching the model that way would be
 * indistinguishable from a crash — so these tests assert the wire result, not just the throw.
 * ---------------------------------------------------------------------------------------------- */

async function delegatedHarness() {
  const { deps, postRepo } = fakeRouteDeps();
  await seedPost(postRepo);
  const registry = createToolRegistry();
  for (const registration of buildPostRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore() })) {
    registry.register(registration);
  }
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog() });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });
  return { postRepo, routeDeps: { lifecycle, toolExecutor, resolvePrincipal: () => ({ id: PRINCIPAL_ID }) }, run };
}

test("a version conflict reaches the model as an actionable BAD_REQUEST, NOT a redacted INTERNAL_ERROR", async () => {
  const { postRepo, routeDeps, run } = await delegatedHarness();

  const first = await delegatedToolExecuteRoute.handle(
    { runId: run.id, toolUseId: "tu-1", toolId: "content_post_update", input: updateInput({ title: "Operator A's document", bodyJson: BODY_A, expectedVersion: 1 }) },
    routeDeps as never
  );
  assert.equal(first.ok, true, JSON.stringify(first));

  const stale = await delegatedToolExecuteRoute.handle(
    { runId: run.id, toolUseId: "tu-2", toolId: "content_post_update", input: updateInput({ title: "Operator B's document", bodyJson: BODY_B, expectedVersion: 1 }) },
    routeDeps as never
  );

  assert.equal(stale.ok, false, JSON.stringify(stale));
  if (stale.ok) return;
  assert.equal(stale.error.code, "BAD_REQUEST", "a conflict redacted to INTERNAL_ERROR tells the model nothing");
  assert.equal(
    stale.error.message,
    "VERSION_CONFLICT: post 'p1' was modified by another save (expected version 1, current version 2). " +
      "Someone else saved this post after you read it, so your edit was NOT applied and nothing was overwritten. " +
      "Re-read the post with content_post_get, reapply your change on top of the body you get back, and resend with " +
      "that row's `version` as `expectedVersion`. Do not resend this call unchanged."
  );

  assert.equal((await storedPost(postRepo)).title, "Operator A's document");
});

test("a malformed expectedVersion reaches the model as a DIFFERENT, shape-flavoured BAD_REQUEST — the two are tellable apart", async () => {
  const { postRepo, routeDeps, run } = await delegatedHarness();

  const res = await delegatedToolExecuteRoute.handle(
    { runId: run.id, toolUseId: "tu-1", toolId: "content_post_update", input: updateInput({ title: "Should Not Land", expectedVersion: "1" }) },
    routeDeps as never
  );

  assert.equal(res.ok, false, JSON.stringify(res));
  if (res.ok) return;
  assert.equal(res.error.code, "BAD_REQUEST");
  assert.ok(
    res.error.message.startsWith("'expectedVersion' must be a non-negative integer when present"),
    `unexpected message: ${res.error.message}`
  );
  // NOT a bare `!includes("VERSION_CONFLICT")` — the schema this rejection is decorated with quotes
  // the field's own description, which names the code. What must not appear is the CONFLICT's
  // message: its `VERSION_CONFLICT: post '…'` prefix and its "re-read the row" guidance, which
  // would tell the model somebody else saved when in fact nobody did.
  assert.ok(!res.error.message.includes("VERSION_CONFLICT: post"), "a malformed basis must not look like somebody else's save");
  assert.ok(!res.error.message.includes("Someone else saved this post"), "a malformed basis must not be blamed on another operator");
  assert.equal((await storedPost(postRepo)).title, "Shared Post");
});

/* ------------------------------------------------------------------------------------------------
 * The published schema
 * ---------------------------------------------------------------------------------------------- */

test("content_post_update publishes expectedVersion as an OPTIONAL non-negative integer — a model cannot use what the schema never mentions", () => {
  const entry = postAgentToolCatalog.find((e) => e.name === "content_post_update");
  assert.ok(entry, "content_post_update must be in the catalog");
  const schema = entry.inputSchema as { required: string[]; properties: Record<string, Record<string, unknown>> };

  assert.ok(!schema.required.includes("expectedVersion"), "requiring it would break every existing caller");
  const property = schema.properties.expectedVersion;
  assert.ok(property, "additionalProperties:false means an unpublished field is one the model must not send");
  assert.equal(property.type, "integer");
  assert.equal(property.minimum, 0);
});
