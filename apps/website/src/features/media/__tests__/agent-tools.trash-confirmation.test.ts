import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { ForbiddenError } from "@jini-ai/cms/core";

import {
  createSurfaceExchangeStore,
  SURFACE_EXCHANGE_ID_PARAM,
  type SurfaceExchangeStore,
} from "../../../contracts/core/tool-surface-exchanges.js";
import { InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryBlobStore, InMemoryMediaRepo } from "../index.js";
import { makeRemoveMediaDouble, type RecordedMediaRemoval } from "./remove-media-double.js";
import {
  buildMediaRegistrationsForTovu,
  type MediaPublicUrlDeps,
  type MediaToolDeps,
  type MediaTrashToolDeps,
} from "../tool-registrations.js";

/**
 * @file Certification of `media_trash_asset`'s confirmation gate — the sixth and last tool migrated
 * onto the shared MCP-UI held-open exchange (2026-09-08, ADS-memory/reports/
 * 2026-09-08-delete-confirmation-build.md). Modeled on
 * `features/widgets/__tests__/agent-tools.trash-confirmation.test.ts`, scoped to this domain's own
 * result shape. This file was the missing piece that let `media_trash_asset` ship for one commit
 * while absent from `MCP_UI_REDEEMABLE_TOOL_IDS` (`assistant/mcp-ui-tool-calls.ts`) — every test
 * below calls the handler directly, exactly as the pre-existing `tool-registrations.media.test.ts`
 * always did, and NONE of them would have failed against that broken build: `surfaceExchanges.deliver()`
 * never consults the allowlist, only `registerMcpUiToolCallsRoute` does. The real-HTTP proof that
 * DOES reach the allowlist lives in
 * `assistant/__tests__/mcp-ui-tool-calls-route.media-trash-asset.integration.test.ts`, mirroring
 * `mcp-ui-tool-calls-route.static-publish.integration.test.ts`'s own module doc on exactly this gap.
 *
 * Unlike Posts/Pages/Widgets, `trashMedia`'s own input carries no `expectedVersion`/
 * optimistic-concurrency field (confirmed by reading `media-service.ts` in full — see the handler's
 * own comment in `tool-registrations.ts`), so there is no separate staleness re-check to certify
 * here. And unlike Widgets' read/write permission split, this domain checks the single `media.delete`
 * permission once, before the dialog opens — there is no second, deferred check to certify at
 * confirm time.
 */

const WORKSPACE_ID = "ws-media-trash-confirm";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-08-20T00:00:00.000Z";
const TRASH_TOOL_ID = "media_trash_asset";

const ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function makeDeps(options: { allow?: boolean; mediaRepo?: InMemoryMediaRepo } = {}): MediaToolDeps &
  MediaPublicUrlDeps &
  MediaTrashToolDeps & { removed: RecordedMediaRemoval[] } {
  let counter = 0;
  const authorize =
    options.allow === false
      ? async () => ({ allowed: false, reason: "insufficient_permission" as const })
      : async () => ({ allowed: true, reason: "matched" as const });
  const mediaRepo = options.mediaRepo ?? new InMemoryMediaRepo();
  const { removeMedia, removed } = makeRemoveMediaDouble(mediaRepo);
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    mediaRepo,
    removeMedia,
    removed,
    assetBlobRepo: new InMemoryAssetBlobRepo(),
    assetRenditionRepo: new InMemoryAssetRenditionRepo(),
    blobStore: new InMemoryBlobStore(),
    authorize,
  };
}

function buildRegistrations(deps: MediaToolDeps & MediaPublicUrlDeps & MediaTrashToolDeps, surfaceExchanges: SurfaceExchangeStore): Map<string, ToolRegistration> {
  return new Map(buildMediaRegistrationsForTovu(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
}

function tool(registrations: Map<string, ToolRegistration>, id: string): ToolRegistration {
  const found = registrations.get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

interface CallOptions {
  input?: unknown;
  emitSurface?: SurfaceEmitter;
  signal?: AbortSignal;
}

function call(registration: ToolRegistration, options: CallOptions = {}) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input: options.input ?? {},
    signal: options.signal ?? new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
  return registration.handler(ctx);
}

function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id");
  return match[1]!;
}

async function raiseDialog(trashTool: ToolRegistration, mediaId: string) {
  const emitted: unknown[] = [];
  const pending = call(trashTool, { input: { mediaId }, emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const ui = (emitted[0] as { payload: { resource: { type: string; resource: { mimeType: string; text: string } } } }).payload.resource;
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  return { pending, ui, exchangeId };
}

/** Seeds a real media asset through the actual upload tool (not a hand-rolled `MediaRecord`), so
 *  these tests exercise genuine domain output — mirrors the pre-existing
 *  `tool-registrations.media.test.ts`'s own `seedAsset` discipline. */
async function seedMediaAsset(
  deps: MediaToolDeps & MediaPublicUrlDeps,
  surfaceExchanges: SurfaceExchangeStore,
  overrides: { filename?: string } = {},
): Promise<{ id: string; title: string; slug: string }> {
  const uploadTool = tool(buildRegistrations(deps, surfaceExchanges), "media_upload_asset");
  const out = (await call(uploadTool, {
    input: { filename: overrides.filename ?? "logo.png", contentType: "image/png", dataBase64: ONE_PIXEL_PNG_BASE64 },
  })) as { media: { id: string; title: string; slug: string } };
  return out.media;
}

// ---------------------------------------------------------------------------
// 1. The call parks, the dialog names the asset, nothing is trashed while pending
// ---------------------------------------------------------------------------

test("the call stays open after the dialog is shown, and nothing is trashed while it is pending", async () => {
  const deps = makeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const asset = await seedMediaAsset(deps, surfaceExchanges);
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { ui, exchangeId, pending } = await raiseDialog(trashTool, asset.id);

  assert.equal(ui.type, "resource");
  assert.equal(surfaceExchanges.size(), 1);
  assert.equal(
    await Promise.race([pending, Promise.resolve("still-waiting" as const)]),
    "still-waiting",
    "the agent's call must not return before the human answers",
  );

  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("the dialog names the title and slug, so consent is informed", async () => {
  const deps = makeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const asset = await seedMediaAsset(deps, surfaceExchanges, { filename: "sidebar-banner.png" });
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { ui, exchangeId, pending } = await raiseDialog(trashTool, asset.id);

  assert.match(ui.resource.text, /sidebar-banner/i);
  assert.match(ui.resource.text, /moved to the trash/i);

  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

// ---------------------------------------------------------------------------
// 2. Confirm / cancel / fail-closed decision
// ---------------------------------------------------------------------------

test("confirm: the human's click trashes the asset and the SAME call reports it to the agent", async () => {
  const deps = makeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const asset = await seedMediaAsset(deps, surfaceExchanges);
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(trashTool, asset.id);
  const delivered = surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  assert.deepEqual(delivered, { ok: true });

  const result = (await pending) as { trashed: boolean; cancelled: boolean; media: { status: string } };
  assert.equal(result.trashed, true);
  assert.equal(result.cancelled, false);
  assert.equal(result.media.status, "trashed");

  const row = await deps.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: asset.id });
  assert.equal(row?.status, "trashed", "the underlying row must actually reflect the trash");
});

/**
 * The agent path reaches `trashMedia` through Jini's own handler, so wiring only the HTTP route
 * leaves this one indexing nothing — an asset an agent deleted would never appear in the Trash.
 * This asserts the confirmation gate calls the removal seam itself, and that the snapshot it passes
 * comes from a read taken AFTER the human confirmed, not from the stale one the dialog was built
 * from.
 */
test("confirm: the trash goes through the injected removeMedia, with a post-confirmation snapshot", async () => {
  const deps = makeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const asset = await seedMediaAsset(deps, surfaceExchanges);
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(trashTool, asset.id);
  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  await pending;

  assert.equal(deps.removed.length, 1, "the agent trash path never reached removeMedia — it is unwired");
  assert.equal(deps.removed[0].id, asset.id);
  assert.equal(deps.removed[0].display.title, asset.title);
  assert.equal(deps.removed[0].display.subtitle, asset.slug);
  const current = await deps.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: asset.id });
  assert.equal(deps.removed[0].expectedVersion, (current?.version ?? 0) - 1, "the CAS must use the version read at confirm time");
});

test("cancel: nothing is trashed, and the SAME call reports the cancellation", async () => {
  const deps = makeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const asset = await seedMediaAsset(deps, surfaceExchanges);
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(trashTool, asset.id);
  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });

  const result = (await pending) as { trashed: boolean; cancelled: boolean };
  assert.equal(result.trashed, false);
  assert.equal(result.cancelled, true);

  const row = await deps.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: asset.id });
  assert.equal(row?.status, "active");
});

test("an answer with no 'decision' field at all is NOT confirm — nothing is trashed (fail-closed)", async () => {
  const deps = makeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const asset = await seedMediaAsset(deps, surfaceExchanges);
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(trashTool, asset.id);
  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: {} });

  const result = (await pending) as { trashed: boolean; cancelled: boolean };
  assert.equal(result.trashed, false);
  assert.equal(result.cancelled, true);
});

test("an unanswered dialog expires and reports 'expired', not a hang or a throw", async () => {
  const deps = makeDeps();
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const asset = await seedMediaAsset(deps, surfaceExchanges);
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const result = (await call(trashTool, { input: { mediaId: asset.id }, emitSurface: async () => undefined })) as {
    trashed: boolean;
    cancelled: boolean;
    reason: string;
    note: string;
  };

  assert.equal(result.trashed, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.reason, "expired");
  assert.match(result.note, /did not respond/);
});

test("confirming an already-trashed asset is a no-op, not a second error — trashMedia's own idempotency", async () => {
  const deps = makeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const asset = await seedMediaAsset(deps, surfaceExchanges);
  await deps.mediaRepo.save({ ...(await deps.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: asset.id }))!, status: "trashed" });
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(trashTool, asset.id);
  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "confirm" } });

  const result = (await pending) as { trashed: boolean; media: { status: string } };
  assert.equal(result.trashed, true, "the confirmation itself still succeeds — it is the underlying flip that is a no-op");
  assert.equal(result.media.status, "trashed");
});

// ---------------------------------------------------------------------------
// 3. No emit seam, authorization, not-found
// ---------------------------------------------------------------------------

test("with no emitSurface, the trash is refused outright — there is no fallback second call", async () => {
  const deps = makeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const asset = await seedMediaAsset(deps, surfaceExchanges);
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  await assert.rejects(() => call(trashTool, { input: { mediaId: asset.id } }), /no interactive confirmation channel/);
  assert.equal(surfaceExchanges.size(), 0, "no emit seam means no exchange was ever opened");
});

test("media.delete is checked before any dialog is raised, and a denied principal never sees one", async () => {
  const seedDeps = makeDeps();
  const seedSurfaces = createSurfaceExchangeStore();
  const asset = await seedMediaAsset(seedDeps, seedSurfaces);
  const deps = makeDeps({ allow: false, mediaRepo: seedDeps.mediaRepo });
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  await assert.rejects(
    () => call(trashTool, { input: { mediaId: asset.id } }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenError, `expected ForbiddenError, got ${String(error)}`);
      return true;
    },
  );
  assert.equal(surfaceExchanges.size(), 0, "a denied principal must never get a dialog opened for them");

  const row = await deps.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: asset.id });
  assert.equal(row?.status, "active", "nothing may be written ahead of the permission gate");
});

test("a nonexistent media id is refused before any dialog is raised", async () => {
  const deps = makeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  await assert.rejects(() => call(trashTool, { input: { mediaId: "nope" } }), /was not found/);
  assert.equal(surfaceExchanges.size(), 0);
});
