import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import type { MediaTranscoderPort } from "@jini-ai/cms/media";
import { createFfmpegMediaTranscoder } from "@jini-ai/cms/media/node";
import { InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryBlobStore, InMemoryMediaRepo, uploadMedia } from "../index.js";
import { contributeMediaTools } from "../tool-registrations.js";
import { nativeToolMetadata } from "#src/contracts/core/tool-metadata/index";

const WORKSPACE_ID = "ws-convert";
const PRINCIPAL_ID = "owner-1";
const NOW = "2026-11-24T00:00:00.000Z";
const TOOL_ID = "media_convert_video";
// A genuine leading `ftyp isom` box: sniffs as video/mp4 without being a playable file.
const MOV_AS_MP4 = new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftypisom"), 0, 0, 2, 0, ...Buffer.from("isomiso2")]);
const CONVERTED = new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftypmp42"), 0, 0, 0, 0, ...Buffer.from("mp42isom")]);

function harness() {
  let counter = 0;
  const deps = {
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: WORKSPACE_ID,
    clock: { nowMs: () => Date.parse(NOW), nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    mediaRepo: new InMemoryMediaRepo({}),
    assetBlobRepo: new InMemoryAssetBlobRepo({}),
    assetRenditionRepo: new InMemoryAssetRenditionRepo({}),
    blobStore: new InMemoryBlobStore(),
  };
  return deps;
}
type Deps = ReturnType<typeof harness>;

function registrations(deps: Deps, ports: Parameters<typeof contributeMediaTools>[0] = {}): ToolRegistration[] {
  return contributeMediaTools(ports).build(deps as never, {} as never);
}

async function seedVideo(deps: Deps) {
  const { clock, idGen, mediaRepo, assetBlobRepo: blobRepo, assetRenditionRepo: renditionRepo, blobStore } = deps;
  const { media } = await uploadMedia({ deps: { clock, idGen, mediaRepo, blobRepo, renditionRepo, blobStore }, input: { workspaceId: WORKSPACE_ID, bytes: MOV_AS_MP4, filename: "Pitch.mp4", contentType: "video/mp4", createdByPrincipal: PRINCIPAL_ID } });
  return media;
}

function invoke(registration: ToolRegistration, input: Record<string, unknown>) {
  const ctx: ToolExecutionContext = { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
  return registration.handler(ctx) as Promise<Record<string, unknown>>;
}

const fakeTranscoder: MediaTranscoderPort = { transcode: async () => ({ ok: true, bytes: CONVERTED }) };

test("media_convert_video is offered only when the host injects a video converter", () => {
  const deps = harness();
  assert.equal(registrations(deps).some((r) => r.descriptor.id === TOOL_ID), false, "no converter means no tool for the assistant to call");
  assert.equal(registrations(deps, { transcoder: fakeTranscoder }).some((r) => r.descriptor.id === TOOL_ID), true);
});

test("media_convert_video saves a web copy, keeps the original and links the copy back to it in plain words", async () => {
  const deps = harness();
  const original = await seedVideo(deps);
  const tool = registrations(deps, { transcoder: fakeTranscoder }).find((r) => r.descriptor.id === TOOL_ID);
  assert.ok(tool);

  const out = await invoke(tool, { mediaId: original.id }) as { converted: boolean; originalId: string; convertedId: string; media: { title: string } };

  assert.equal(out.converted, true);
  assert.equal(out.originalId, original.id);
  assert.equal(out.media.title, "Pitch (web)");
  assert.equal((await deps.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: original.id }))?.status, "active", "the original stays as it was");
  const copy = await deps.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: out.convertedId });
  assert.equal(copy?.description, 'Web-playable copy of "Pitch".', "the copy says which video it came from");
  assert.equal(copy?.version, 2, "linking the copy is one saved edit on top of the upload");
});

test("with no ffmpeg on the host the tool says so in plain words and saves nothing", async () => {
  const deps = harness();
  const original = await seedVideo(deps);
  const transcoder = createFfmpegMediaTranscoder({ findBinaries: async () => undefined }, {});
  const tool = registrations(deps, { transcoder }).find((r) => r.descriptor.id === TOOL_ID);
  assert.ok(tool);

  const out = await invoke(tool, { mediaId: original.id }) as { converted: boolean; error: { message: string } };

  assert.equal(out.converted, false);
  assert.match(out.error.message, /^Video conversion needs ffmpeg on this computer\. \(ERR-[0-9A-F-]+\)$/, "plain words plus the support id the owner can quote");
  assert.equal((await deps.mediaRepo.list({ workspaceId: WORKSPACE_ID })).length, 1, "no copy was written");
});

test("the tool keeps the approval Jini declares and is discoverable by search", () => {
  const registration = registrations(harness(), { transcoder: fakeTranscoder }).find((r) => r.descriptor.id === TOOL_ID);
  assert.deepEqual(registration?.descriptor.metadata?.approval, { class: "edit", confirmation: "direct" });
  assert.deepEqual(nativeToolMetadata.approvals[TOOL_ID], { class: "edit", confirmation: "direct" });
  assert.match(nativeToolMetadata.keywords[TOOL_ID] ?? "", /\bmov\b/);
});
