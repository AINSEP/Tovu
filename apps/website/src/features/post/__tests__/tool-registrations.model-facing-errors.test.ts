/**
 * @file RED regression suite for the Posts/Pages half of the 2026-09-16 "always say the real
 * reason" sweep, modelled on `features/members/__tests__/tool-registrations.model-facing-errors.
 * test.ts`: it drives the REAL delegated-tool-call transport (`delegatedToolExecuteRoute` over a
 * real `ToolRegistry`/`ToolExecutor`/`RunLifecycle`) so what is asserted is literally the payload a
 * spawned agent CLI receives.
 *
 * That seam is the whole point. The redaction lives in the TRANSPORT, not in the handler: a
 * handler-level `assert.rejects` passes against this bug, because the handler does throw the right
 * class — it is `ToolExecutor` (anything not `instanceof ToolInputError` => `errorKind: 'internal'`)
 * and then `delegatedToolExecuteRoute`'s SEC-005 redaction that turn it into
 * `{ code: "INTERNAL_ERROR", message: "an internal error occurred" }`.
 *
 * RED before the fix, for every case below except the two non-interference guards:
 * `{ ok: false, error: { code: "INTERNAL_ERROR", message: "an internal error occurred", requestId }}`.
 * Posts/Pages had a CORRECT reclassifier (`toModelFacingUpdateError`) wired at exactly ONE of six
 * handlers, so `PostNotFoundError`, `PostConflictError`, `PostValidationError`, the kit's
 * `ForbiddenError` and `content_post_delete`'s own version re-check all reached the model as the
 * same opaque 500 a crash produces.
 *
 * The ordering case is the one that could regress silently: `PostVersionConflictError extends
 * PostConflictError`, so a list that puts the superclass first still answers every conflict — with
 * the WRONG code and without the re-read guidance.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry, ToolInputError } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/http-kit";

import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { postAgentToolCatalog } from "../agent-tools.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRegistrations, type PostToolDeps } from "../tool-registrations.js";

const WORKSPACE_ID = "ws-post-model-facing";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-16T00:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };

function makeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
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
    postSearch: { search: async () => [] },
    authorize: async () =>
      allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" },
  } as unknown as PostToolDeps;
  return { deps, postRepo };
}

async function buildHarness(deps: PostToolDeps) {
  const registry = createToolRegistry();
  for (const registration of buildPostRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore() })) {
    registry.register(registration);
  }
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog() });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });
  return { run, lifecycle, toolExecutor, resolvePrincipal: () => ({ id: PRINCIPAL_ID }) };
}

type Harness = Awaited<ReturnType<typeof buildHarness>>;

let toolUseCounter = 0;

async function call(harness: Harness, toolId: string, input: unknown) {
  return delegatedToolExecuteRoute.handle(
    { runId: harness.run.id, toolUseId: `tu-${++toolUseCounter}`, toolId, input },
    harness as never
  );
}

async function seedPost(postRepo: InMemoryPostRepo, overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  } as never);
}

function updateInput(overrides: Record<string, unknown>): Record<string, unknown> {
  return { id: "p1", kind: "post", title: "Untitled", slug: "shared-post", bodyJson: EMPTY_DOC, status: "draft", ...overrides };
}

/* ------------------------------------------------------------------------------------------------
 * Not-found: the arm that used to be redacted on every read and on delete
 * ---------------------------------------------------------------------------------------------- */

test("content_post_get for an unknown id is BAD_REQUEST with the real not-found reason, not a redacted 500", async () => {
  const { deps } = makeRouteDeps();
  const harness = await buildHarness(deps);

  const result = await call(harness, "content_post_get", { id: "nope", kind: "post" });

  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "CONTENT_POST_NOT_FOUND: post 'nope' was not found",
  });
});

test("content_post_delete for an unknown id says not-found rather than 'an internal error occurred'", async () => {
  const { deps } = makeRouteDeps();
  const harness = await buildHarness(deps);

  const result = await call(harness, "content_post_delete", { id: "ghost", kind: "page" });

  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "CONTENT_POST_NOT_FOUND: page 'ghost' was not found",
  });
});

/* ------------------------------------------------------------------------------------------------
 * The ORDERING proof — `PostVersionConflictError extends PostConflictError`
 *
 * These two tests only both pass when the subclass rule is listed FIRST. Swap the two entries in
 * `POST_MODEL_FACING_ERRORS` and the version conflict below answers `CONTENT_POST_CONFLICT` with
 * no re-read guidance: still a BAD_REQUEST, still "an error", and materially WORSE for the model
 * than before this sweep, because the one instruction it needs is gone. An "an error came back"
 * assertion would not notice.
 * ---------------------------------------------------------------------------------------------- */

test("a version conflict keeps the VERSION_CONFLICT code and its re-read guidance — the subclass rule is matched FIRST", async () => {
  const { deps, postRepo } = makeRouteDeps();
  await seedPost(postRepo);
  const harness = await buildHarness(deps);

  const first = await call(harness, "content_post_update", updateInput({ title: "Operator A's document", expectedVersion: 1 }));
  assert.equal(first.ok, true, JSON.stringify(first));

  const stale = await call(harness, "content_post_update", updateInput({ title: "Operator B's document", expectedVersion: 1 }));

  assert.equal(stale.ok, false, JSON.stringify(stale));
  if (stale.ok) return;
  assert.equal(stale.error.code, "BAD_REQUEST");
  assert.equal(
    stale.error.message,
    "VERSION_CONFLICT: post 'p1' was modified by another save (expected version 1, current version 2). " +
      "Someone else saved this post after you read it, so your edit was NOT applied and nothing was overwritten. " +
      "Re-read the post with content_post_get, reapply your change on top of the body you get back, and resend with " +
      "that row's `version` as `expectedVersion`. Do not resend this call unchanged."
  );
  // The failure mode a superclass-first list produces, named explicitly so the diagnosis is in the
  // assertion rather than in someone's head.
  assert.ok(
    !stale.error.message.startsWith("CONTENT_POST_CONFLICT"),
    "the generic conflict arm swallowed the version conflict — PostVersionConflictError must be listed before PostConflictError"
  );
});

test("a plain slug conflict still answers on the GENERIC conflict arm, so the subclass rule is not shadowing it", async () => {
  const { deps, postRepo } = makeRouteDeps();
  await seedPost(postRepo, { slug: "taken" });
  const harness = await buildHarness(deps);

  const result = await call(harness, "content_post_create", { kind: "post", title: "Another", slug: "taken" });

  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "CONTENT_POST_CONFLICT: slug 'taken' already exists",
  });
});

/* ------------------------------------------------------------------------------------------------
 * Authorization — the arm `requireToolPermission`/`executeCommand` share with 47 other files
 * ---------------------------------------------------------------------------------------------- */

test("a denied principal gets the real authorization reason, naming the permission", async () => {
  const { deps } = makeRouteDeps({ allow: false });
  const harness = await buildHarness(deps);

  const result = await call(harness, "content_post_list", { kind: "post" });

  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: `CONTENT_POST_FORBIDDEN: principal '${PRINCIPAL_ID}' is not authorized for 'content.read' (insufficient_permission)`,
  });
});

test("EVERY wired Posts/Pages tool surfaces the denial, not just the first one — the sibling-arm check", async () => {
  const inputs: Record<string, Record<string, unknown>> = {
    content_post_search: { query: "anything" },
    content_post_list: { kind: "post" },
    content_post_get: { id: "p1", kind: "post" },
    content_post_create: { kind: "post", title: "Nope" },
    content_post_update: updateInput({}),
    content_post_delete: { id: "p1", kind: "post" },
  };

  // Driven off the CATALOG, not a hand-written list: a seventh tool added without a wrap fails here
  // rather than shipping a silently redacted denial.
  const toolIds = postAgentToolCatalog.map((entry) => entry.name);
  assert.deepEqual([...toolIds].sort(), Object.keys(inputs).sort(), "every catalog tool needs a denial input above");

  for (const toolId of toolIds) {
    const { deps, postRepo } = makeRouteDeps({ allow: false });
    await seedPost(postRepo);
    const harness = await buildHarness(deps);

    const result = await call(harness, toolId, inputs[toolId]);

    assert.equal(result.ok, false, `${toolId}: expected a refusal`);
    if (result.ok) continue;
    assert.equal(result.error.code, "BAD_REQUEST", `${toolId}: still redacted — ${JSON.stringify(result.error)}`);
    assert.match(result.error.message, /^CONTENT_POST_FORBIDDEN: principal /, `${toolId}: ${result.error.message}`);
  }
});

/* ------------------------------------------------------------------------------------------------
 * The two guards that used to throw a bare `Error` — unreachable by any `instanceof` rule
 * ---------------------------------------------------------------------------------------------- */

test("content_post_delete with no interactive confirmation channel carries the ToolInputError marker, so it cannot be redacted", async () => {
  const { deps, postRepo } = makeRouteDeps();
  await seedPost(postRepo);

  // HANDLER level on purpose, and the exception to this file's transport rule. `@jini-ai/daemon`'s
  // `createDelegatedToolBridge` ALWAYS supplies an `emitSurface`, so the delegated transport cannot
  // express the context this guard exists for; driving it from there parks the handler on a
  // confirmation nobody will ever answer. Other execution contexts do call `ToolExecutor.execute`
  // with no surface channel, which is why the guard is live.
  //
  // What is asserted is therefore the exact marker the transport keys on rather than the transport's
  // own output: `ToolExecutor` tags anything NOT `instanceof ToolInputError` as `errorKind: 'internal'`
  // (`tool-executor.js`), and only that bucket is SEC-005-redacted. Before the fix this threw a bare
  // `Error`, which no `instanceof` rule in any allowlist could ever have rescued.
  const registration = buildPostRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore() }).find(
    (r) => r.descriptor.id === "content_post_delete"
  );
  assert.ok(registration, "expected content_post_delete to be wired");

  const err = await registration
    .handler({
      executionId: "exec-1",
      principal: { id: PRINCIPAL_ID },
      run: { id: "run-1" },
      input: { id: "p1", kind: "post" },
      signal: new AbortController().signal,
    })
    .then(
      () => null,
      (caught: unknown) => caught
    );

  assert.ok(err instanceof ToolInputError, `a bare Error here is redacted to a 500: ${String(err)}`);
  assert.equal(
    err.message,
    "CONTENT_POST_NO_CONFIRMATION_CHANNEL: content_post_delete: this execution context has no " +
      "interactive confirmation channel (no emitSurface), so a destructive delete cannot be " +
      "gated here. Nothing was deleted."
  );
});

/* ------------------------------------------------------------------------------------------------
 * Non-interference with the schema decoration that already shipped
 * ---------------------------------------------------------------------------------------------- */

test("a shape rejection keeps its schema decoration and gains no second code prefix", async () => {
  const { deps, postRepo } = makeRouteDeps();
  await seedPost(postRepo);
  const harness = await buildHarness(deps);

  const result = await call(harness, "content_post_update", updateInput({ expectedVersion: "1" }));

  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.equal(result.error.code, "BAD_REQUEST");
  assert.ok(
    result.error.message.startsWith("'expectedVersion' must be a non-negative integer when present"),
    `the map wrap must pass an existing ToolInputError through untouched: ${result.error.message}`
  );
  assert.ok(
    !result.error.message.startsWith("CONTENT_POST_VALIDATION_FAILED"),
    "listing PostValidationError must not re-prefix a message withSchemaOnRejection already shaped"
  );
});

test("an UNLISTED failure stays redacted — the allowlist is not a blanket unwrap", async () => {
  const { deps } = makeRouteDeps();
  // A repo that fails the way a real outage fails: an internal error with an internal message. It
  // must NOT reach the model, or "say the real reason" would have become "leak the internals".
  (deps as { postRepo: unknown }).postRepo = {
    findById: async () => {
      throw new Error("SQLITE_IOERR: disk I/O error at /var/tovu/sites/tovu-com/content.db");
    },
  };
  const harness = await buildHarness(deps as PostToolDeps);

  const result = await call(harness, "content_post_get", { id: "p1", kind: "post" });

  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.equal(result.error.code, "INTERNAL_ERROR");
  assert.equal(result.error.message, "an internal error occurred");
  assert.ok(!JSON.stringify(result).includes("content.db"), "an unlisted error must not disclose an internal path");
});
