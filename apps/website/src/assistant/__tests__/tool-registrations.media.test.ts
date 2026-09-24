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
  InMemoryMediaContentTypeStore,
  InMemoryMediaRepo,
  InMemoryBlobStore,
  InMemoryTransformDefinitionRepo,
  registerTransform,
} from "../../features/media/index.js";
import type { RouteDeps } from "../../server/routes/types.js";
import {
  assertRiskMetadataIsWirable,
  buildAssistantToolRegistrations,
} from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { contributeMediaTools } from "../../features/media/tool-registrations.js";
import { registerToolContributor } from "../tool-contribution-registry.js";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM, type AssistantSurfaceDeps } from "../../contracts/core/tool-surface-exchanges.js";
import { makeRemoveMediaDouble } from "#src/features/media/__tests__/remove-media-double";

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

/**
 * Registers the one core transform `publicUrl` resolution needs before it can resolve any asset's
 * URL — same boot-time registration `features/media/bootstrap.ts`'s `ensureCoreMediaTransform`
 * performs in the real running server. Deliberately NOT called from inside `fakeRouteDeps` itself
 * (which is synchronous, and every `InMemoryTransformDefinitionRepo` method is `Promise`-returning
 * even though it does no real I/O) — a fire-and-forget call there would race the seed against
 * whatever the calling test does next, with no guaranteed happens-before relationship. Callers that
 * need a real (non-`null`) `publicUrl` `await` this explicitly, after `fakeRouteDeps` but before the
 * upload/list call whose result they assert on; every other test in this file is unaffected and
 * keeps calling `fakeRouteDeps` unchanged.
 */
async function seedPublicTransform(deps: RouteDeps): Promise<void> {
  await registerTransform({
    deps: {
      transformRepo: (deps as unknown as { transformDefinitionRepo: InMemoryTransformDefinitionRepo }).transformDefinitionRepo,
      idGen: { newId: () => "transform-public-v1" },
      clock: { nowIso: () => NOW },
    },
    input: { workspaceId: WORKSPACE_ID, name: "public", params: { format: "webp" }, owner: "core" },
  });
}

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const mediaRepo = new InMemoryMediaRepo();
  const assetBlobRepo = new InMemoryAssetBlobRepo();
  const assetRenditionRepo = new InMemoryAssetRenditionRepo();
  const blobStore = new InMemoryBlobStore();
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo();
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
    mediaContentTypeStore,
    transformDefinitionRepo,
    removeMedia: makeRemoveMediaDouble(mediaRepo).removeMedia,
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
  };

  return { deps: deps as unknown as RouteDeps, mediaRepo, mediaContentTypeStore, authorizeCalls };
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = mediaAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

function mediaRegistrations(deps: RouteDeps, surfaces?: AssistantSurfaceDeps): Map<string, ToolRegistration> {
  return new Map(
    buildAssistantToolRegistrations(deps, surfaces)
      .filter((r) => r.descriptor.id.startsWith("media_") || r.descriptor.id === "content_read.media_asset")
      .map((r) => [r.descriptor.id, r]),
  );
}

function wired(toolId: string, deps: RouteDeps): ToolRegistration {
  const found = mediaRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

/**
 * `media_trash_asset` now raises a confirmation dialog (2026-09-08, ADS-memory/reports/
 * 2026-09-08-delete-confirmation-build.md) rather than trashing synchronously — this helper raises
 * it and immediately confirms, standing in for the human's click, for tests (like most of this file's
 * own) that only need a trashed asset to exist and are not themselves certifying the confirmation
 * gate (that is `media/__tests__/agent-tools.trash-confirmation.test.ts`'s job). Mirrors
 * `widgets/__tests__/integration/tool-registrations.shape-rejection.test.ts`'s identical
 * `trashInstance` helper.
 */
async function trashAsset(deps: RouteDeps, mediaId: string): Promise<unknown> {
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = mediaRegistrations(deps, { surfaceExchanges }).get("media_trash_asset");
  assert.ok(trashTool, "expected 'media_trash_asset' to be wired");
  const emitted: unknown[] = [];
  const pending = trashTool.handler({
    ...executionContext({ mediaId }),
    emitSurface: async (s) => void emitted.push(s),
  });
  await new Promise((resolve) => setImmediate(resolve));
  const html = (emitted[0] as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id");
  surfaceExchanges.deliver({ exchangeId: match[1]!, toolId: "media_trash_asset", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  return pending;
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
    "content_read.media_asset",
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
    // A `content_read.*` card's catalog entry lives in assistant/content-read-tool.ts, not this
    // domain's own static catalog, so `catalogEntry(id)` has nothing to cross-check it against.
    // Not a coverage gap: `deriveContentReadRegistrations` runs the IDENTICAL
    // `buildDomainRegistrations` gate against its OWN catalog at construction time, and this
    // file could not have built its registrations at all had that thrown.
    if (id === "content_read.media_asset") continue;
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
  const media = (await wired("content_read.media_asset", deps).handler(executionContext({}))) as { media: Array<Record<string, unknown>> };
  const found = media.media.find((m) => m.id === id);
  assert.ok(found);
  assert.deepEqual(Object.keys(found).sort(), [
    "alt",
    "caption",
    "credit",
    "cssClass",
    "htmlAttributes",
    "id",
    "publicUrl",
    "sha256",
    "slug",
    "status",
    "title",
    "version",
  ]);
  assert.equal("workspaceId" in found, false, "the agent is already scoped to one workspace it cannot change");
  assert.equal("createdAt" in found, false);
  assert.equal("updatedAt" in found, false);
  assert.equal(found.status, "active");
  // No "public" transform was registered for this fixture (see `seedPublicTransform`'s own doc) —
  // `publicUrl` must degrade to `null`, never throw or silently omit the field.
  assert.equal(found.publicUrl, null);
});

// ---------------------------------------------------------------------------
// 3a. publicUrl — the real /m/... resolution, on both media_list_assets and media_upload_asset
// ---------------------------------------------------------------------------

test("media_upload_asset's publicUrl is the ADR-027 §4 public-transform URL for an image asset, keyed by its slug (readable-slugs S4)", async () => {
  const { deps } = fakeRouteDeps();
  await seedPublicTransform(deps);
  const out = (await wired("media_upload_asset", deps).handler(
    executionContext({ filename: "logo.png", contentType: "image/png", dataBase64: ONE_PIXEL_PNG_BASE64 }),
  )) as { media: { id: string; slug: string; publicUrl: string | null } };
  assert.equal(out.media.publicUrl, `/m/${out.media.slug}/public.v1/image.webp`);
});

test("media_list_assets' publicUrl matches media_upload_asset's for the same asset, resolved in one batch", async () => {
  const { deps } = fakeRouteDeps();
  await seedPublicTransform(deps);
  const uploaded = (await wired("media_upload_asset", deps).handler(
    executionContext({ filename: "logo.png", contentType: "image/png", dataBase64: ONE_PIXEL_PNG_BASE64 }),
  )) as { media: { id: string; publicUrl: string | null } };

  const listed = (await wired("content_read.media_asset", deps).handler(executionContext({}))) as {
    media: Array<{ id: string; publicUrl: string | null }>;
  };
  const found = listed.media.find((m) => m.id === uploaded.media.id);
  assert.ok(found);
  assert.equal(found.publicUrl, uploaded.media.publicUrl);
});

test("media_list_assets' publicUrl is the byte-passthrough /original URL for a video asset, keyed by its slug, resolved from the content-type store", async () => {
  const { deps, mediaContentTypeStore } = fakeRouteDeps();
  await seedPublicTransform(deps);
  const uploaded = (await wired("media_upload_asset", deps).handler(
    executionContext({ filename: "clip.mp4", contentType: "video/mp4", dataBase64: ONE_PIXEL_PNG_BASE64 }),
  )) as { media: { id: string; slug: string; sha256: string } };

  // The content-type store records the SNIFFED type, not the client's declared upload string — this
  // upload's actual bytes are a PNG (`ONE_PIXEL_PNG_BASE64`), so the fixture records the type
  // directly rather than relying on a real video-byte sniff, mirroring `routes/admin/media/upload.ts`'s
  // own "record what the bytes actually are" write, just supplied by the test instead of a sniffer.
  await mediaContentTypeStore.set({ workspaceId: WORKSPACE_ID, sha256: uploaded.media.sha256, contentType: "video/mp4" });

  const listed = (await wired("content_read.media_asset", deps).handler(executionContext({}))) as {
    media: Array<{ id: string; publicUrl: string | null }>;
  };
  const found = listed.media.find((m) => m.id === uploaded.media.id);
  assert.ok(found);
  assert.equal(found.publicUrl, `/m/${uploaded.media.slug}/original`);
});

test("a trashed asset's publicUrl is null, never a link a visitor would 404 on", async () => {
  const { deps } = fakeRouteDeps();
  await seedPublicTransform(deps);
  const { id } = await seedAsset(deps);
  await trashAsset(deps, id);

  const listed = (await wired("content_read.media_asset", deps).handler(executionContext({}))) as {
    media: Array<{ id: string; publicUrl: string | null; status: string }>;
  };
  const found = listed.media.find((m) => m.id === id);
  assert.ok(found);
  assert.equal(found.status, "trashed");
  assert.equal(found.publicUrl, null);
});

test("media_trash_asset is a status flip, and is the ONLY delete-adjacent tool", async () => {
  const { deps, mediaRepo } = fakeRouteDeps();
  const { id } = await seedAsset(deps);

  const out = (await trashAsset(deps, id)) as { media: { status: string } };
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
    // A `content_read.*` card's catalog entry lives in assistant/content-read-tool.ts, not this
    // domain's own static catalog, so `catalogEntry(id)` has nothing to cross-check it against.
    // Not a coverage gap: `deriveContentReadRegistrations` runs the IDENTICAL
    // `buildDomainRegistrations` gate against its OWN catalog at construction time, and this
    // file could not have built its registrations at all had that thrown.
    if (id === "content_read.media_asset") continue;
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
    // A `content_read.*` card's catalog entry lives in assistant/content-read-tool.ts, not this
    // domain's own static catalog, so `catalogEntry(id)` has nothing to cross-check it against.
    // Not a coverage gap: `deriveContentReadRegistrations` runs the IDENTICAL
    // `buildDomainRegistrations` gate against its OWN catalog at construction time, and this
    // file could not have built its registrations at all had that thrown.
    if (id === "content_read.media_asset") continue;
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
  const trashed = (await trashAsset(deps, uploaded.media.id)) as {
    media: { status: string; version: number };
  };
  assert.equal(trashed.media.status, "trashed");
  assert.equal(trashed.media.version, 3, "version must have advanced again from the update's version 2");

  // Step 4: list must show a SINGLE asset whose state reflects every step of the chain, not just the last.
  const listed = (await wired("content_read.media_asset", deps).handler(executionContext({}))) as {
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
  "content_read.media_asset": () => ({}),
  media_upload_asset: () => ({ filename: "b.png", contentType: "image/png", dataBase64: ONE_PIXEL_PNG_BASE64 }),
  media_update_metadata: (id) => ({ mediaId: id, title: "Renamed" }),
  media_trash_asset: (id) => ({ mediaId: id }),
};

const EXPECTED_PERMISSIONS: Record<string, string> = {
  "content_read.media_asset": "media.read",
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
  test(`${toolId}: calls authorize() with the catalog's declared permission and the run's principal`, async (t) => {
    // `media_trash_asset` now raises a confirmation dialog before writing (2026-09-08,
    // ADS-memory/reports/2026-09-08-delete-confirmation-build.md) — its shim checks `media.delete`
    // BEFORE opening the dialog (unlike widgets' read/write split), so `authorize()` genuinely would
    // be called once here, but this generic loop calls the handler with no `emitSurface` at all, and
    // the handler throws "no interactive confirmation channel" right after that check succeeds,
    // failing this test for a reason unrelated to what it is pinning. The SAME authorization
    // ordering (permission checked pre-dialog, denied principal never sees one) is certified
    // directly by `media/__tests__/agent-tools.trash-confirmation.test.ts`, mirroring the exclusion
    // `tool-registrations.post.test.ts`/`tool-registrations.widgets-authorization.test.ts` already
    // carry for `content_post_delete`/`widgets_trash_instance`.
    if (toolId === "media_trash_asset") {
      t.skip("confirmation-gated — see media/__tests__/agent-tools.trash-confirmation.test.ts");
      return;
    }

    const { deps, authorizeCalls } = fakeRouteDeps();
    const { id } = await seedAsset(deps);
    authorizeCalls.length = 0;

    await wired(toolId, deps).handler(executionContext(TOOL_INPUTS[toolId](id)));

    assert.equal(authorizeCalls.length, 1, "exactly one authorization evaluation");
    assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
    // A `content_read.*` card is catalogued in assistant/content-read-tool.ts, not this
    // domain's own static catalog, so this cross-check has nothing to resolve for it. The
    // card's own expectation is still asserted independently just below/above.
    if (!toolId.startsWith("content_read.")) {
      assert.equal(authorizeCalls[0].permission, catalogEntry(toolId).authorization.permission);
    }
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
