import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import {
  InMemoryAssetBlobRepo,
  InMemoryAssetRenditionRepo,
  InMemoryBlobStore,
  InMemoryMediaRepo,
  uploadMedia,
  type MediaRecord,
} from "@jini-ai/cms/media";

import type { AssistantToolRegistryDeps } from "#src/assistant/tool-registrations";
import { buildContentDuplicationRegistrations } from "#src/features/content-duplication/tool-registrations";
import { contributeMediaDuplicateHandlers } from "../duplicate-asset.js";

/**
 * @file Certifies this domain's `"media"` contribution to `content_duplicate` — the third resource,
 * and the only one whose rows are not the whole story.
 *
 * The load-bearing case is the bytes one. `duplicate-asset.ts`'s whole design decision is that a
 * copy REFERENCES the source's bytes rather than duplicating them, and the assertion that proves it
 * is not "the copy has the right content" — it is that the blob store still holds exactly ONE object
 * and the blob table exactly ONE row after the copy, while the two media rows are genuinely
 * independent. A test that only checked the copy looked right would pass just as happily against an
 * implementation that wrote a second physical copy of every image.
 *
 * The other cases are the ones where "it's just a row" stops being true: a trashed source (a copy
 * would be a live entry for deleted content), and a source whose bytes are gone (a copy would
 * reference content that does not exist, so nothing may be written).
 */

const WORKSPACE_ID = "ws-media-duplicate";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-08T00:00:00.000Z";

/** A 1x1 PNG — real magic bytes, so `sniffContentType` and the upload allowlist both accept it. */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function fakeRouteDeps(allowedPermissions: string[] = ["media.upload"]) {
  const mediaRepo = new InMemoryMediaRepo();
  const assetBlobRepo = new InMemoryAssetBlobRepo();
  const assetRenditionRepo = new InMemoryAssetRenditionRepo();
  const blobStore = new InMemoryBlobStore();
  const contentTypes = new Map<string, string>();

  let counter = 0;
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `media-${++counter}` },
    mediaRepo,
    assetBlobRepo,
    assetRenditionRepo,
    blobStore,
    mediaContentTypeStore: {
      getMany: async ({ sha256s }: { workspaceId: string; sha256s: string[] }) =>
        new Map(sha256s.flatMap((h) => (contentTypes.has(h) ? [[h, contentTypes.get(h)!] as const] : []))),
      set: async ({ sha256, contentType }: { workspaceId: string; sha256: string; contentType: string }) => {
        contentTypes.set(sha256, contentType);
      },
    },
    authorize: async (required: { permission: string }) =>
      allowedPermissions.includes(required.permission)
        ? { allowed: true, reason: "matched" }
        : { allowed: false, reason: "no matching grant" },
  };

  return { deps, mediaRepo, assetBlobRepo, assetRenditionRepo, blobStore, contentTypes };
}

type FakeDeps = ReturnType<typeof fakeRouteDeps>["deps"];

function duplicateTool(deps: FakeDeps): ToolRegistration {
  const registrations = buildContentDuplicationRegistrations(deps as unknown as AssistantToolRegistryDeps, {
    listResourceHandlers: contributeMediaDuplicateHandlers,
  });
  const found = registrations.find((r) => r.descriptor.id === "content_duplicate");
  assert.ok(found, "expected 'content_duplicate' to be wired");
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

/** Seeds one real asset through the same `uploadMedia` path production uses. */
async function seedAsset(deps: FakeDeps, overrides: Partial<MediaRecord> = {}): Promise<MediaRecord> {
  const { media } = await uploadMedia({
    deps: {
      clock: deps.clock,
      idGen: deps.idGen,
      mediaRepo: deps.mediaRepo,
      blobRepo: deps.assetBlobRepo,
      renditionRepo: deps.assetRenditionRepo,
      blobStore: deps.blobStore,
    },
    input: {
      workspaceId: WORKSPACE_ID,
      bytes: PNG_BYTES,
      filename: "hero-banner.png",
      contentType: "image/png",
      alt: "A hero banner",
      caption: "Shot on location",
      credit: "Jane Doe",
      createdByPrincipal: PRINCIPAL_ID,
    },
  });

  const patched: MediaRecord = { ...media, width: 1200, height: 630, cssClass: "rounded shadow", htmlAttributes: 'loading="lazy"', ...overrides };
  await deps.mediaRepo.save(patched);
  return patched;
}

test("'media' is a supported resource of content_duplicate, gated on media.upload", async () => {
  const contributors = contributeMediaDuplicateHandlers();
  assert.deepEqual(contributors.map((c) => c.resource), ["media"]);
  assert.equal(contributors[0]!.build({} as unknown as AssistantToolRegistryDeps).permission, "media.upload");
});

// ---------------------------------------------------------------------------------------------
// The bytes decision — the case this resource exists to get right.
// ---------------------------------------------------------------------------------------------

test("the copy REFERENCES the source's bytes: same sha256, ONE blob row, ONE stored object", async () => {
  const { deps, assetBlobRepo, blobStore } = fakeRouteDeps();
  const source = await seedAsset(deps);
  const blobRowsBefore = (await assetBlobRepo.list({ workspaceId: WORKSPACE_ID })).length;
  const objectsBefore = blobStore.size;

  const { media } = (await call(duplicateTool(deps), { resource: "media", id: source.id })) as { media: MediaRecord };

  assert.notEqual(media.id, source.id, "must be a NEW library entry");
  assert.equal(media.source.sha256, source.source.sha256, "the copy points at the SAME content hash");
  assert.equal(
    (await assetBlobRepo.list({ workspaceId: WORKSPACE_ID })).length,
    blobRowsBefore,
    "duplicating must not add a second asset_blobs row — storage is content-addressed",
  );
  assert.equal(blobStore.size, objectsBefore, "duplicating must not write a second copy of the bytes");
});

test("the copy is nonetheless an independent row: editing its metadata does not touch the source", async () => {
  const { deps, mediaRepo } = fakeRouteDeps();
  const source = await seedAsset(deps);

  const { media } = (await call(duplicateTool(deps), { resource: "media", id: source.id })) as { media: MediaRecord };

  const copyRow = await mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: media.id });
  await mediaRepo.save({ ...copyRow!, alt: "Totally different alt text" });

  const sourceAfter = await mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: source.id });
  assert.equal(sourceAfter?.alt, "A hero banner", "the source's own editorial fields must be untouched");
  assert.notEqual(media.slug, source.slug, "the copy gets its own slug, never the source's");
});

test("the copy gets its OWN rendition rows — renditions are keyed by asset id, so a shared one would 404", async () => {
  const { deps, assetRenditionRepo } = fakeRouteDeps();
  const source = await seedAsset(deps);

  const { media } = (await call(duplicateTool(deps), { resource: "media", id: source.id })) as { media: MediaRecord };

  const forCopy = await assetRenditionRepo.listByAsset({ workspaceId: WORKSPACE_ID, assetId: media.id });
  assert.ok(forCopy.length > 0, "the copy must be independently addressable at its own /m/<id>/... URL");
});

// ---------------------------------------------------------------------------------------------
// Editorial fields.
// ---------------------------------------------------------------------------------------------

test("every editorial field is carried onto the copy, with the title defaulting to the source's own title with a numeric suffix", async () => {
  const { deps } = fakeRouteDeps();
  const source = await seedAsset(deps);

  const { media } = (await call(duplicateTool(deps), { resource: "media", id: source.id })) as { media: MediaRecord };

  assert.equal(media.title, `${source.title} 2`, "never 'Copy of <source>' — a numeric suffix instead");
  assert.equal(media.alt, "A hero banner");
  assert.equal(media.caption, "Shot on location");
  assert.equal(media.credit, "Jane Doe");
  assert.equal(media.width, 1200);
  assert.equal(media.height, 630);
  assert.equal(media.cssClass, "rounded shadow");
  assert.equal(media.htmlAttributes, 'loading="lazy"');
});

test("copying the same asset twice increments the suffix: '... 2', then '... 3'", async () => {
  const { deps } = fakeRouteDeps();
  const source = await seedAsset(deps);

  const first = (await call(duplicateTool(deps), { resource: "media", id: source.id })) as { media: MediaRecord };
  const second = (await call(duplicateTool(deps), { resource: "media", id: source.id })) as { media: MediaRecord };

  assert.equal(first.media.title, `${source.title} 2`);
  assert.equal(second.media.title, `${source.title} 3`);
});

test("an explicit title and slug are honored", async () => {
  const { deps } = fakeRouteDeps();
  const source = await seedAsset(deps);

  const { media } = (await call(duplicateTool(deps), {
    resource: "media",
    id: source.id,
    overrides: { title: "Hero banner — mobile crop", slug: "hero-banner-mobile" },
  })) as { media: MediaRecord };

  assert.equal(media.title, "Hero banner — mobile crop");
  assert.equal(media.slug, "hero-banner-mobile");
});

test("a source can be named by its slug, not only its id — media's own identity model", async () => {
  const { deps } = fakeRouteDeps();
  const source = await seedAsset(deps);

  const { media } = (await call(duplicateTool(deps), { resource: "media", id: source.slug })) as { media: MediaRecord };
  assert.equal(media.source.sha256, source.source.sha256);
});

test("the copy's content type is recorded against its hash, so it keeps its Images/Videos classification", async () => {
  const { deps, contentTypes } = fakeRouteDeps();
  const source = await seedAsset(deps);
  contentTypes.clear(); // an older asset that predates the content-type store

  const { media } = (await call(duplicateTool(deps), { resource: "media", id: source.id })) as { media: MediaRecord };

  assert.equal(contentTypes.get(media.source.sha256), "image/png", "sniffed from the real bytes, never a declared string");
});

// ---------------------------------------------------------------------------------------------
// Refusals — where "it's just a row" stops being true.
// ---------------------------------------------------------------------------------------------

test("a TRASHED source is refused — a copy would be a live entry for content already deleted", async () => {
  const { deps, mediaRepo } = fakeRouteDeps();
  const source = await seedAsset(deps);
  await mediaRepo.save({ ...source, status: "trashed" });
  const rowsBefore = (await mediaRepo.list({ workspaceId: WORKSPACE_ID })).length;

  await assert.rejects(call(duplicateTool(deps), { resource: "media", id: source.id }), /in the trash and was not copied/);
  assert.equal((await mediaRepo.list({ workspaceId: WORKSPACE_ID })).length, rowsBefore, "nothing may be written");
});

test("a source whose blob row is gone fails loudly and writes NOTHING — no half-formed library entry", async () => {
  const { deps, mediaRepo, assetBlobRepo } = fakeRouteDeps();
  const source = await seedAsset(deps);
  const blob = await assetBlobRepo.findByHash({ workspaceId: WORKSPACE_ID, sha256: source.source.sha256 });
  await assetBlobRepo.remove({ workspaceId: WORKSPACE_ID, sha256: blob!.sha256 });
  const rowsBefore = (await mediaRepo.list({ workspaceId: WORKSPACE_ID })).length;

  await assert.rejects(call(duplicateTool(deps), { resource: "media", id: source.id }), /bytes are missing/);
  assert.equal((await mediaRepo.list({ workspaceId: WORKSPACE_ID })).length, rowsBefore, "no orphan row may be left behind");
});

test("the draft/published status override is REJECTED for media rather than silently dropped", async () => {
  const { deps, mediaRepo } = fakeRouteDeps();
  const source = await seedAsset(deps);
  const rowsBefore = (await mediaRepo.list({ workspaceId: WORKSPACE_ID })).length;

  await assert.rejects(
    call(duplicateTool(deps), { resource: "media", id: source.id, overrides: { status: "published" } }),
    /does not support the 'status' override[\s\S]*Overrides honored for 'media': title and slug/,
  );
  assert.equal((await mediaRepo.list({ workspaceId: WORKSPACE_ID })).length, rowsBefore);
});

test("duplicating a nonexistent asset is rejected as not-found", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(call(duplicateTool(deps), { resource: "media", id: "no-such-asset" }), /was not found/);
});

test("a caller holding content.write but NOT media.upload cannot copy an asset", async () => {
  const { deps, mediaRepo } = fakeRouteDeps(["content.write", "admin.forms.manage"]);
  const source = await seedAsset(deps);
  const rowsBefore = (await mediaRepo.list({ workspaceId: WORKSPACE_ID })).length;

  await assert.rejects(call(duplicateTool(deps), { resource: "media", id: source.id }), /media\.upload/);
  assert.equal((await mediaRepo.list({ workspaceId: WORKSPACE_ID })).length, rowsBefore, "a denied caller must leave no copy behind");
});
