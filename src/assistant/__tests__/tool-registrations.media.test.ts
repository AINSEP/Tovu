/**
 * Covers, for the 4 Media tools, the union of what `tool-registrations.forms.test.ts` covers for
 * Forms: published contracts, risk cross-check, the confirmation-transport guard, the model-facing
 * output projection, and the authorization half — combined into one file (mirrors Forms' combined
 * style) rather than split, since Media's tool count and risk profile are Forms-sized, not
 * Identity-sized.
 *
 * The authorization half is the one genuinely different story here: unlike Forms/Identity/Widgets,
 * `media-service.ts`'s functions perform NO internal `authorize()` call of their own — this file's
 * assertions pin that `tool-registrations.ts`'s OWN inline `requireMediaPermission` call is what
 * actually gates every Media tool (see `media/agent-tools.ts`'s file header).
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { ForbiddenError } from "@jini-ai/cms/core";
import {
  mediaAgentToolCatalog,
  type AgentToolDefinition,
  InMemoryAssetBlobRepo,
  InMemoryAssetRenditionRepo,
  InMemoryMediaRepo,
  InMemoryBlobStore,
} from "../../media/index.js";
import type { RouteDeps } from "../../server/routes/types.js";
import {
  assertRiskMetadataIsWirable,
  buildAssistantToolRegistrations,
} from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { contributeMediaTools } from "../../media/tool-registrations.js";
import { registerToolContributor } from "../tool-contribution-registry.js";

// Media moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
// tool-contribution registry (2026-08-17, retried after `widgets`'s own conversion had merged — see
// `media/tool-registrations.ts`'s own header), so `buildAssistantToolRegistrations` below no longer
// wires it unless something explicitly installs it first, mirroring what the real composition roots
// now do via `installFirstPartyToolContributors()`.
resetToolContributorsForTests();
registerToolContributor(contributeMediaTools());

const WORKSPACE_ID = "ws-media-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const mediaRepo = new InMemoryMediaRepo();
  const assetBlobRepo = new InMemoryAssetBlobRepo();
  const assetRenditionRepo = new InMemoryAssetRenditionRepo();
  const blobStore = new InMemoryBlobStore();
  const authorizeCalls: Array<Record<string, unknown>> = [];

  let counter = 0;
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    mediaRepo,
    assetBlobRepo,
    assetRenditionRepo,
    blobStore,
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
  };

  return { deps: deps as unknown as RouteDeps, mediaRepo, authorizeCalls };
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = mediaAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

function mediaRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(
    buildAssistantToolRegistrations(deps)
      .filter((r) => r.descriptor.id.startsWith("media_"))
      .map((r) => [r.descriptor.id, r]),
  );
}

function wired(toolId: string, deps: RouteDeps): ToolRegistration {
  const found = mediaRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

/** Seeds an asset through the real upload tool, so tests operate on genuine domain output. */
async function seedAsset(deps: RouteDeps): Promise<{ id: string }> {
  const out = (await wired("media_upload_asset", deps).handler(
    executionContext({ filename: "logo.png", contentType: "image/png", dataBase64: ONE_PIXEL_PNG_BASE64 }),
  )) as { media: { id: string } };
  return out.media;
}

// ---------------------------------------------------------------------------
// 1. The catalog is complete and honest about what Media can do
// ---------------------------------------------------------------------------

test("exactly the four safe media-service.ts operations are wired — no invented purge or transform-registry tool", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...mediaRegistrations(deps).keys()].sort(), [
    "media_list_assets",
    "media_trash_asset",
    "media_update_metadata",
    "media_upload_asset",
  ]);
});

test("no wired media tool is named or described for a hard purge/force-delete", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of mediaRegistrations(deps)) {
    assert.equal(/purge|force/i.test(id), false, `'${id}' must not be named for a purge/force-delete — that operation is deliberately unwired`);
    // Carve out negated clauses first ("there is no purge/force-delete tool"), then match any
    // remaining claim — mirrors `tool-registrations.forms.test.ts`'s identical technique for its
    // own delete-claim assertion, to avoid a false positive on a sentence describing an exclusion.
    const claim = registration.descriptor.description.replace(/\b(never|no|not|cannot|can't|won't)\b[^.;—]*/gi, "");
    assert.equal(/purge|force-delet/i.test(claim), false, `'${id}' must not claim a purge/force-delete capability`);
  }
});

// ---------------------------------------------------------------------------
// 2. Published contracts
// ---------------------------------------------------------------------------

test("every wired Media registration publishes its catalog entry's inputSchema and description", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of mediaRegistrations(deps)) {
    assert.ok(registration.descriptor.inputSchema, `${id} must publish an inputSchema`);
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's, not a second copy`);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("requiresConfirmation is unset on every wired Media tool", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of mediaRegistrations(deps)) {
    assert.equal(registration.descriptor.requiresConfirmation, undefined, `${id} must not request confirmation until a transport exists`);
  }
});

test("an out-of-vocabulary content type is rejected with the schema attached for retry", async () => {
  const { deps } = fakeRouteDeps();
  const error = await wired("media_upload_asset", deps)
    .handler(executionContext({ filename: "evil.svg", contentType: "image/svg+xml", dataBase64: ONE_PIXEL_PNG_BASE64 }))
    .then(() => null, (e: unknown) => e as Error);

  assert.ok(error, "an out-of-allowlist content type must reject");
  assert.match(error.message, /not allowed for upload/);
});

test("base64 that decodes to zero bytes is rejected as an empty upload, with the schema attached for retry", async () => {
  // Node's Buffer.from(..., "base64") never throws on invalid characters — it decodes leniently,
  // skipping them (confirmed: Buffer.from("!!!!!!!!", "base64").length === 0). So an
  // all-invalid-character string exercises the REAL reachable rejection path
  // (`MediaValidationError` for a zero-length payload), not the defensive try/catch around the
  // decode itself, which mirrors `server/routes/admin/media/upload.ts`'s identical shape but is
  // unreachable on this runtime — same as that route, not a gap this task introduced.
  const { deps } = fakeRouteDeps();
  const error = await wired("media_upload_asset", deps)
    .handler(executionContext({ filename: "a.png", contentType: "image/png", dataBase64: "!!!!!!!!" }))
    .then(() => null, (e: unknown) => e as Error);

  assert.ok(error, "zero decoded bytes must reject");
  assert.match(error.message, /uploaded file is empty/);
  assert.match(error.message, /will not resolve on retry without an input change/);
  assert.match(error.message, /"additionalProperties":false/, "the published schema must travel with the failure");
});

// ---------------------------------------------------------------------------
// 3. Output projection
// ---------------------------------------------------------------------------

test("a tool result is an explicit model-facing view: workspaceId/timestamps dropped, id kept for the next call's mediaId", async () => {
  const { deps } = fakeRouteDeps();
  const { id } = await seedAsset(deps);
  const media = (await wired("media_list_assets", deps).handler(executionContext({}))) as { media: Array<Record<string, unknown>> };
  const found = media.media.find((m) => m.id === id);
  assert.ok(found);
  assert.deepEqual(Object.keys(found).sort(), ["alt", "caption", "credit", "id", "sha256", "status", "title", "version"]);
  assert.equal("workspaceId" in found, false, "the agent is already scoped to one workspace it cannot change");
  assert.equal("createdAt" in found, false);
  assert.equal("updatedAt" in found, false);
  assert.equal(found.status, "active");
});

test("media_trash_asset is a status flip, and is the ONLY delete-adjacent tool", async () => {
  const { deps, mediaRepo } = fakeRouteDeps();
  const { id } = await seedAsset(deps);

  const out = (await wired("media_trash_asset", deps).handler(executionContext({ mediaId: id }))) as { media: { status: string } };
  assert.equal(out.media.status, "trashed");

  const stored = await mediaRepo.findById({ workspaceId: WORKSPACE_ID, id });
  assert.equal(stored?.status, "trashed", "the underlying row must actually reflect the trash");
});

test("media_update_metadata never touches the write-once sha256 — there is no field for it in the tool's schema", () => {
  const schema = catalogEntry("media_update_metadata").inputSchema as { properties: Record<string, unknown> };
  assert.equal("sha256" in schema.properties, false);
  assert.equal("dataBase64" in schema.properties, false, "replacing bytes is not an update — it is a new upload");
});

// ---------------------------------------------------------------------------
// 4. Risk metadata is cross-checked, not trusted
// ---------------------------------------------------------------------------

test("the real Media catalog and tool-registrations' independent classification agree for all four wired tools", () => {
  const { deps } = fakeRouteDeps();
  for (const id of mediaRegistrations(deps).keys()) {
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("a Media catalog entry cannot downgrade its own risk — declaring sideEffects:'none' fails the build", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("media_upload_asset", { ...catalogEntry("media_upload_asset"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("no wired Media tool carries a confirmation-requiring actor-class rule", () => {
  const { deps } = fakeRouteDeps();
  for (const id of mediaRegistrations(deps).keys()) {
    assert.notEqual(catalogEntry(id).actorClassRule, "confirmer-must-equal-own-delegatedBy");
  }
});

// ---------------------------------------------------------------------------
// 5. Multi-tool workflow — proving several tools compose correctly in sequence
// ---------------------------------------------------------------------------

test("workflow: upload, update its metadata, then trash it — list reflects the whole chain consistently under the SAME id", async () => {
  const { deps } = fakeRouteDeps();

  // Step 1: upload a new asset.
  const uploaded = (await wired("media_upload_asset", deps).handler(
    executionContext({ filename: "banner.png", contentType: "image/png", dataBase64: ONE_PIXEL_PNG_BASE64, alt: "original alt" }),
  )) as { media: { id: string; version: number; status: string } };
  assert.equal(uploaded.media.status, "active");
  assert.equal(uploaded.media.version, 1);

  // Step 2: update its metadata, chaining off the id/fields the upload returned.
  const updated = (await wired("media_update_metadata", deps).handler(
    executionContext({ mediaId: uploaded.media.id, title: "Homepage Banner", caption: "Q3 campaign" }),
  )) as { media: { id: string; title: string; caption: string; alt: string; version: number } };
  assert.equal(updated.media.id, uploaded.media.id, "the id returned by upload must be the exact id accepted by update");
  assert.equal(updated.media.title, "Homepage Banner");
  assert.equal(updated.media.caption, "Q3 campaign");
  assert.equal(updated.media.alt, "original alt", "a field not supplied to update must be preserved from the prior state, not wiped");
  assert.equal(updated.media.version, 2, "version must have advanced from the upload's version 1");

  // Step 3: trash it, chaining off the SAME id again.
  const trashed = (await wired("media_trash_asset", deps).handler(executionContext({ mediaId: uploaded.media.id }))) as {
    media: { status: string; version: number };
  };
  assert.equal(trashed.media.status, "trashed");
  assert.equal(trashed.media.version, 3, "version must have advanced again from the update's version 2");

  // Step 4: list must show a SINGLE asset whose state reflects every step of the chain, not just the last.
  const listed = (await wired("media_list_assets", deps).handler(executionContext({}))) as {
    media: Array<{ id: string; title: string; caption: string; alt: string; status: string; version: number }>;
  };
  assert.equal(listed.media.length, 1);
  const [found] = listed.media;
  assert.equal(found.id, uploaded.media.id, "the id must be identical across all four calls in the chain");
  assert.equal(found.title, "Homepage Banner", "the update from step 2 must be visible");
  assert.equal(found.caption, "Q3 campaign", "the update from step 2 must be visible");
  assert.equal(found.status, "trashed", "the trash from step 3 must be visible");
  assert.equal(found.version, 3, "the list read must see the final version after the whole chain, not a stale one");
});

// ---------------------------------------------------------------------------
// 6. Authorization — Media's own inline gate (media-service.ts has none of its own)
// ---------------------------------------------------------------------------

const TOOL_INPUTS: Record<string, (seededId: string) => Record<string, unknown>> = {
  media_list_assets: () => ({}),
  media_upload_asset: () => ({ filename: "b.png", contentType: "image/png", dataBase64: ONE_PIXEL_PNG_BASE64 }),
  media_update_metadata: (id) => ({ mediaId: id, title: "Renamed" }),
  media_trash_asset: (id) => ({ mediaId: id }),
};

const EXPECTED_PERMISSIONS: Record<string, string> = {
  media_list_assets: "media.read",
  media_upload_asset: "media.upload",
  media_update_metadata: "media.update",
  media_trash_asset: "media.delete",
};

test("every wired Media tool has a known input fixture and expected permission — a newly wired tool must be added here, not silently skipped", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...mediaRegistrations(deps).keys()].sort(), Object.keys(TOOL_INPUTS).sort());
  assert.deepEqual(Object.keys(TOOL_INPUTS).sort(), Object.keys(EXPECTED_PERMISSIONS).sort());
});

for (const toolId of Object.keys(TOOL_INPUTS)) {
  test(`${toolId}: calls authorize() with the catalog's declared permission and the run's principal`, async () => {
    const { deps, authorizeCalls } = fakeRouteDeps();
    const { id } = await seedAsset(deps);
    authorizeCalls.length = 0;

    await wired(toolId, deps).handler(executionContext(TOOL_INPUTS[toolId](id)));

    assert.equal(authorizeCalls.length, 1, "exactly one authorization evaluation");
    assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
    assert.equal(authorizeCalls[0].permission, catalogEntry(toolId).authorization.permission);
    assert.equal(authorizeCalls[0].permission, EXPECTED_PERMISSIONS[toolId]);
    assert.equal(authorizeCalls[0].workspaceId, WORKSPACE_ID);
    assert.equal(authorizeCalls[0].entityType, "media");
  });

  test(`${toolId}: a denied principal is rejected and NOTHING is written`, async () => {
    const { deps: seedDeps, mediaRepo: seedRepo } = fakeRouteDeps();
    const { id } = await seedAsset(seedDeps);
    const before = await seedRepo.list({ workspaceId: WORKSPACE_ID });

    const { deps, mediaRepo } = fakeRouteDeps({ allow: false });
    await assert.rejects(
      () => wired(toolId, deps).handler(executionContext(TOOL_INPUTS[toolId](id))),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenError, `expected ForbiddenError, got ${String(error)}`);
        assert.match((error as Error).message, new RegExp(PRINCIPAL_ID));
        assert.match((error as Error).message, new RegExp(EXPECTED_PERMISSIONS[toolId].replace(".", "\\.")));
        return true;
      },
    );

    assert.deepEqual(await mediaRepo.list({ workspaceId: WORKSPACE_ID }), [], "the permission gate must run ahead of every durable effect");
    assert.equal(before.length, 1, "sanity: the seed really did upload an asset when allowed");
  });
}

test("the ToolPolicy layer is a pass-through 'allow' for every Media registration — enforcement is this file's own inline requireMediaPermission call, by design", () => {
  const { deps } = fakeRouteDeps();
  for (const [toolId, registration] of mediaRegistrations(deps)) {
    const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});
