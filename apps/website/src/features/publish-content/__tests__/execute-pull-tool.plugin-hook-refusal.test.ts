/**
 * @file RED regression suite (2026-10-05): `publish_content_execute_pull` let a plugin save-hook
 * refusal mid-pull reach the model as a redacted `INTERNAL_ERROR`, while the single-save tools say
 * `PLUGIN_HOOK_FAILED` (8a2f75bf8/9982815ea).
 *
 * The pull's apply is NOT all-or-nothing: `apply-loop.ts` writes each row with its own command and
 * only a raw-row/raw-file bundle (never a pull) runs inside a rollback transaction. So a refusal on
 * item 2 leaves item 1 saved, and the fixed message must say so instead of "the content was not
 * saved". Everything below the tool is REAL so the saved state proves the wording: the planner,
 * gateway, `createPublishContentApplyPort`, the `post` publish handler over an `InMemoryPostRepo`,
 * and `createHookRegistry().runBeforeSave` with one filter that refuses only the second post.
 *
 * RED before the fix: the handler rejected with the raw `PluginHookFailedError` (the transport turns
 * any non-`ToolInputError` into `{ code: "INTERNAL_ERROR", message: "an internal error occurred" }`).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError } from "@jini-ai/core";

import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "#src/contracts/core/tool-surface-exchanges";
import { createHookRegistry } from "#src/features/plugin-runtime/hook-registry";
import { InMemoryPostRepo } from "#src/features/post/repo.memory";
import type { BeforeSaveHookPort, PostRecord } from "#src/features/post/post";
import { contributePostPublish, toPublishableState } from "#src/features/post/publish-content";
import { removeVia } from "#src/features/post/__tests__/remove-post-double";
import { contributeMediaPublish } from "#src/features/media/publish-content";
import { contributeTaxonomyPublish, contributeTermPublish } from "#src/features/taxonomy/publish-content";

import { createPublishContentApplyPort } from "../apply-loop.js";
import { CONTENT_HASH_VERSION, contentHash } from "../content-hash.js";
import { getPublishContentRunStatus } from "../run-repo.js";
import { registerPublishContentContributor, type PackedEntity, type PublishContentDeps } from "../type-registry.js";
import type { PublishContentToolDeps } from "../tool-registrations.js";
import { context, fixture, OWNER, tool } from "./pull-tool-fixture.js";

const PLUGIN_ID = "seo-guard";
/** Everything a plugin's own error text could carry that must never reach the model. */
const RAW_PLUGIN_TEXT = "SQLITE_CORRUPT reading /Users/owner/site/.tovu/data.sqlite with token=sk-live-123";
const REFUSAL = `PLUGIN_HOOK_FAILED: a site plugin (${PLUGIN_ID}) refused item post:p-2; items applied before it stay saved, so check the import history before retrying`;

function livePost(id: string): PackedEntity {
  const post: PostRecord = {
    id, workspaceId: "local", title: `Live ${id}`, slug: id, bodyJson: { type: "doc", content: [] }, status: "draft",
    kind: "post", bodyFormat: "doc", bodyHtml: null, updatedAt: "2026-09-01T00:00:00.000Z", version: 1, createdByPrincipalId: null,
  };
  const state = toPublishableState(post);
  return { entityType: "post", id, schemaVersion: 2, hashVersion: CONTENT_HASH_VERSION, contentHash: contentHash("post", state), requiredBlobs: [], state };
}

function refusingSecondPost(): BeforeSaveHookPort {
  const registry = createHookRegistry();
  registry.attach(PLUGIN_ID, "site", async (entry) => {
    if (entry.id === "p-2") throw new Error(RAW_PLUGIN_TEXT);
    return {};
  }, []);
  return registry.runBeforeSave;
}

/** The t09 pull fixture with its fake apply port swapped for the REAL one over real posts. */
async function pullOfThreePosts(beforeSaveHook: BeforeSaveHookPort) {
  const f = await fixture([livePost("p-1"), livePost("p-2"), livePost("p-3")]);
  registerPublishContentContributor(contributeMediaPublish()); // post dependsOn media and term; no ports, so both pack nothing
  registerPublishContentContributor(contributePostPublish());
  registerPublishContentContributor(contributeTaxonomyPublish());
  registerPublishContentContributor(contributeTermPublish());
  const postRepo = new InMemoryPostRepo();
  const outbox = new InMemoryOutbox();
  const ports = { post: { repo: postRepo, forgetRemoved: async () => {}, remove: removeVia(postRepo) } };
  let changeSetCount = 0;
  const publishContentDeps: PublishContentDeps = {
    workspaceId: "local", clock: f.deps.clock, idGen: { newId: () => `cs-${++changeSetCount}` }, outbox,
    changeSets: new InMemoryChangeSetRepo([], [], outbox), authorize: async () => ({ allowed: true, reason: "matched" }),
    beforeSaveHook, ports,
  };
  const deps = {
    ...f.deps, publishContentPorts: ports,
    publishContentApplyPort: createPublishContentApplyPort({
      workspaceId: "local", bundleRepo: f.bundleRepo, baselineRepo: f.baselineRepo, runRepo: f.runRepo,
      publishContentDeps, clock: f.deps.clock, idGen: { newId: () => "apply-run" },
    }),
  } as PublishContentToolDeps;
  const plan = await (await tool(deps, "publish_content_plan_pull")).handler(context({ peerId: "live" })) as { bundleId: string };
  return { deps, postRepo, runRepo: f.runRepo, bundleId: plan.bundleId };
}

/** Starts execute, answers the held-open card with a human confirm, and returns the settled call. */
async function confirmedExecute(deps: PublishContentToolDeps, bundleId: string): Promise<unknown> {
  const surfaceExchanges = createSurfaceExchangeStore();
  let resolveSurface!: (value: any) => void;
  const surface = new Promise<any>(resolve => { resolveSurface = resolve; });
  const r = await tool(deps, "publish_content_execute_pull", { surfaceExchanges });
  const pending = r.handler(context({ bundleId }), { emitSurface: async s => { resolveSurface(s); } });
  const emitted = await Promise.race([surface, pending.then(() => { throw new Error("execute ended before a dialog"); })]);
  const html = emitted.payload.resource.resource.text as string;
  const exchangeId = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`))![1]!;
  assert.deepEqual(surfaceExchanges.deliver({ exchangeId, toolId: "publish_content_execute_pull", principalId: OWNER, params: { decision: "confirm" } }), { ok: true });
  return pending;
}

test("a plugin refusing item 2 of 3 says PLUGIN_HOOK_FAILED with the plugin id and item; item 1 stays saved", async () => {
  const { deps, postRepo, runRepo, bundleId } = await pullOfThreePosts(refusingSecondPost());

  const rejection = await confirmedExecute(deps, bundleId).then(() => assert.fail("the pull must not succeed"), (err: unknown) => err);

  assert.ok(rejection instanceof ToolInputError, `expected ToolInputError, got ${String(rejection)}`);
  assert.equal(rejection.message, REFUSAL);
  for (const fragment of [RAW_PLUGIN_TEXT, "SQLITE_CORRUPT", "/Users/owner", "sk-live-123"]) {
    assert.equal(rejection.message.includes(fragment), false, `leaked ${fragment}`);
  }
  // The wording's claim, observed: the item before the refusal landed; the refused one and every
  // item after it did not.
  assert.deepEqual((await postRepo.list({ workspaceId: "local" })).map(row => row.id), ["p-1"]);
  const run = await getPublishContentRunStatus(runRepo, { workspaceId: "local", runId: "apply-run" });
  assert.equal(run?.phase, "failed");
  assert.deepEqual(run?.items.map(item => [item.entityId, item.phase]), [["p-1", "completed"], ["p-2", "failed"], ["p-3", "pending"]]);
});

test("a save hook failing with anything other than a plugin refusal stays a redacted internal error", async () => {
  const { deps, postRepo, bundleId } = await pullOfThreePosts(async (entry) => {
    if (entry.id === "p-2") throw new Error(RAW_PLUGIN_TEXT);
    return {};
  });

  const rejection = await confirmedExecute(deps, bundleId).then(() => assert.fail("the pull must not succeed"), (err: unknown) => err);

  // Not a ToolInputError, so the transport sends only its generic INTERNAL_ERROR text.
  assert.equal(rejection instanceof ToolInputError, false);
  assert.equal((rejection as Error).message, RAW_PLUGIN_TEXT);
  assert.deepEqual((await postRepo.list({ workspaceId: "local" })).map(row => row.id), ["p-1"]);
});
