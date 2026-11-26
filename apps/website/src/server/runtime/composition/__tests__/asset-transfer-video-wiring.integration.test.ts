import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createContributionRegistry, type ToolContributor, type DerivedToolContributor } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { buildAssistantToolRegistrations, type AssistantToolRegistryDeps } from "#src/assistant/tool-registrations";
import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { MAX_UPLOAD_BYTES } from "@tovu/contracts/upload-limits";
import { createRouteDeps } from "../app.js";
import { installFirstPartyToolContributors } from "../tool-catalog-manifest.js";

test("the composed files_copy Media destination stores the original and links the web copy", async () => {
  const deps = createRouteDeps();
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  };
  const original = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
  Buffer.from([0, 0, 0, 24, ...Buffer.from("ftypisom"), 0, 0, 2, 0, ...Buffer.from("isomiso2")]).copy(original);
  const converted = Uint8Array.from([0, 0, 0, 24, ...Buffer.from("ftypmp42"), 0, 0, 0, 0, ...Buffer.from("mp42isom")]);
  let conversions = 0;
  installFirstPartyToolContributors({ contributions }, { mediaConversionPorts: { transcoder: { transcode: async ({ input }) => {
    conversions++;
    assert.deepEqual(Buffer.from(input), original);
    const [stored] = await deps.mediaRepo.list({ workspaceId: deps.workspaceId });
    assert.ok(stored, "the original row exists before conversion");
    const blob = await deps.assetBlobRepo.findByHash({ workspaceId: deps.workspaceId, sha256: stored.source.sha256 });
    assert.ok(blob, "the original blob exists before conversion");
    assert.deepEqual(Buffer.from(await deps.blobStore.get({ storageKey: blob.storageKey })), original);
    return { ok: true, bytes: converted };
  } } } });
  const registrations = buildAssistantToolRegistrations({ ...deps,
    magicLinkPerEmailLimiter: createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: deps.clock }),
    authorize: async () => ({ allowed: true, reason: "test" }),
    mediaImportHttpClient: { send: async () => ({ status: 200, headers: { "content-type": "video/mp4" }, bodyText: "", bodyBytes: original }) },
  } as AssistantToolRegistryDeps, { surfaces: undefined, options: { contributions } });
  const copy = registrations.find(registration => registration.descriptor.id === "files_copy");
  assert.ok(copy);
  const result = await copy.handler({ input: { sources: [{ root: "url", url: "https://cdn.example/clip.mp4" }], destination: { kind: "media" } },
    principal: { id: "copy-owner" }, executionId: "copy-video", run: { id: "copy-run" }, signal: new AbortController().signal });
  assert.equal(conversions, 1);
  assert.equal((result as { applied: boolean }).applied, true);
  const all = await deps.mediaRepo.list({ workspaceId: deps.workspaceId });
  assert.equal(all.length, 2);
  const source = all.find(item => !item.description);
  assert.ok(source);
  assert.equal(source.createdBy, "copy-owner");
  assert.equal(all.find(item => item.id !== source.id)?.description, `Web-playable copy of "${source.title}".`);
  const blob = await deps.assetBlobRepo.findByHash({ workspaceId: deps.workspaceId, sha256: source.source.sha256 });
  assert.ok(blob);
  assert.deepEqual(Buffer.from(await deps.blobStore.get({ storageKey: blob.storageKey })), original);
});
