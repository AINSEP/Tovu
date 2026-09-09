import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/http-kit";

import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRegistrations, type PostToolDeps } from "../tool-registrations.js";

/**
 * @file Regression test for the bug report: `content_post_get` called with `kind` omitted (the
 * model sent `{"id": "..."}`) returned an HTTP 500 `INTERNAL_ERROR` with the reason redacted,
 * through `/api/delegated-tool-calls` — the real transport a spawned agent CLI calls this site's
 * tools through — instead of a 400 `BAD_REQUEST` carrying `requirePostKind`'s own message.
 *
 * Root cause: `requirePostKind`/`requirePostStatus` (`tool-registrations.ts`) threw a bare
 * `Error` instead of `@jini-ai/core`'s `ToolInputError`. `@jini-ai/daemon`'s `ToolExecutor`
 * only tags a rejection `errorKind: 'validation'` (→ 400) when it is `instanceof ToolInputError`;
 * every other throw is `'internal'` and `@jini-ai/http-kit`'s `delegatedToolExecuteRoute`
 * SEC-005-redacts that into a message-stripped `INTERNAL_ERROR`. `requireString` (from
 * `@jini-ai/cms/core`, used elsewhere in this same file) already threw `ToolInputError` — this
 * bug was two ad-hoc validators skipping that shared marker, not a transport defect. Mirrors
 * `theme-list-files-malformed-input-status.integration.test.ts`'s real end-to-end shape (real
 * registrations, a real `ToolRegistry`/`ToolExecutor`, the real `delegatedToolExecuteRoute`) so
 * this proves the fix reaches the actual wire, not just the handler's own throw.
 */

const WORKSPACE_ID = "ws-post-kind-status-validation";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-09T00:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };

async function delegatedHarness() {
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

  await postRepo.save({
    id: "p1",
    workspaceId: WORKSPACE_ID,
    title: "Existing Post",
    slug: "existing-post",
    bodyJson: EMPTY_DOC,
    status: "draft",
    kind: "post",
    updatedAt: NOW,
    version: 1,
  } as never);

  const registry = createToolRegistry();
  for (const registration of buildPostRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore() })) {
    registry.register(registration);
  }
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog() });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });
  return { routeDeps: { lifecycle, toolExecutor, resolvePrincipal: () => ({ id: PRINCIPAL_ID }) }, run };
}

test("content_post_get called with 'kind' omitted is a 400 BAD_REQUEST end to end, not a redacted 500", async () => {
  const { routeDeps, run } = await delegatedHarness();

  const result = await delegatedToolExecuteRoute.handle(
    { runId: run.id, toolUseId: "tu-1", toolId: "content_post_get", input: { id: "p1" } },
    routeDeps as never
  );

  assert.deepEqual(result, {
    ok: false,
    error: { code: "BAD_REQUEST", message: "'kind' must be exactly 'post' or 'page'" },
  });
});

test("content_post_list called with 'kind' omitted is a 400 BAD_REQUEST end to end, not a redacted 500", async () => {
  const { routeDeps, run } = await delegatedHarness();

  const result = await delegatedToolExecuteRoute.handle(
    { runId: run.id, toolUseId: "tu-1", toolId: "content_post_list", input: {} },
    routeDeps as never
  );

  assert.deepEqual(result, {
    ok: false,
    error: { code: "BAD_REQUEST", message: "'kind' must be exactly 'post' or 'page'" },
  });
});

test("content_post_update called with an invalid 'status' is a 400 BAD_REQUEST end to end, not a redacted 500", async () => {
  const { routeDeps, run } = await delegatedHarness();

  const result = await delegatedToolExecuteRoute.handle(
    {
      runId: run.id,
      toolUseId: "tu-1",
      toolId: "content_post_update",
      input: { id: "p1", kind: "post", title: "Existing Post", slug: "existing-post", bodyJson: EMPTY_DOC, status: "archived" },
    },
    routeDeps as never
  );

  assert.deepEqual(result, {
    ok: false,
    error: { code: "BAD_REQUEST", message: "'status' must be exactly 'draft' or 'published'" },
  });
});

test("a well-formed content_post_get call still succeeds end to end (the fix does not break the golden path)", async () => {
  const { routeDeps, run } = await delegatedHarness();

  const result = await delegatedToolExecuteRoute.handle(
    { runId: run.id, toolUseId: "tu-1", toolId: "content_post_get", input: { id: "p1", kind: "post" } },
    routeDeps as never
  );

  assert.equal(result.ok, true, JSON.stringify(result));
});
