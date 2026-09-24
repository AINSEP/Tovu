import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { ForbiddenError } from "@jini-ai/cms/core";

import {
  InMemoryAssetBlobRepo,
  InMemoryAssetRenditionRepo,
  InMemoryBlobStore,
  InMemoryMediaContentTypeStore,
  InMemoryMediaRepo,
  InMemoryTransformDefinitionRepo,
  registerTransform,
  type BlobStorePort,
} from "../../media/index.js";
import type { RouteDeps } from "../../../server/routes/types.js";
import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../../../assistant/tool-registrations.js";
import { registerToolContributor, resetToolContributorsForTests } from "../../../assistant/tool-contribution-registry.js";
import { contributeMediaImportTools } from "../tool-registrations.js";
import { mediaImportAgentToolCatalog, type AgentToolDefinition } from "../agent-tools.js";

/**
 * @file `media_import_from_url` end to end through the REAL registry, the REAL `uploadMedia`, and the
 * REAL blob store — with only the network faked (a scripted `HttpClientPort`, the same seam
 * `credentialed-request.unit.test.ts` fakes for the same reason).
 *
 * The assertion this file is built around is deliberately NOT "a media row was created". This repo
 * has already shipped a media defect whose symptom was rows existing while their bytes did not, and
 * every preview rendering blank; a test that stops at "the row is there" is precisely the test that
 * would have passed throughout that bug. So the central test captures the bytes the BLOB STORE was
 * handed and compares them `deepStrictEqual` against the bytes the fake client returned, plus an
 * independent sha256 of both — and the fixture is a real PNG whose deflated pixel data is invalid
 * UTF-8, so a byte path that ever went through the lossy `bodyText` would fail it loudly.
 */

resetToolContributorsForTests();
registerToolContributor(contributeMediaImportTools());

const WORKSPACE_ID = "ws-media-import-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-06T00:00:00.000Z";
const SOURCE_URL = "https://cdn.example.com/generated/8f3ac91b0e.png";

/** The same real 16x16 RGB PNG `fetch-image.test.ts` uses — see that file's fixture doc for why a
 *  genuine binary payload (not `Buffer.from("fake-png")`) is load-bearing here. */
const REAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAACc0lEQVR4nAXBvUodMBQA4PMIeYKSFxCy1yGruGSq4BQQB6cecBFEiEsFFyOCDlXMoDgINYogDtoDd1ARa1BE4YrmcrUXvYhHr/8/Tb8PAIqAIqEoKBqKgWKhIBQHxUMJUCIUgpKgZCgMBUAUIf5J8anEhxbvRrxZ8YrixYlnL56CeIzigUQrifss7lgwgCxCfkr5ruSrls9GPlrZQnnn5K2XN0E2o7wi2UjyMss6yxqAKkJ9SPWq1JNWLaPYqhtU1041vLoIqhbVGalqUidZHbE6ANBF6Hepn5VuaX1rdNPqBuq60+deV4M+jvqQ9H7Su1lvsa4AmCLMmzSPyrA2TWP+WlNDc+rMsTcHwexFs02mksxmNutsVgFsEfZV2payN9o2jK1ZW0V75Oy+tzvBVqLdILuW7HK2i2znAbAIfJF4p/BaY93gqcUjxD8OtzxSwPWIK4SLCecyzjBOArgi3LN0t8o1tDs37ti6fXRbzv32bi24pegWyM0mN5XdGLsRAF+Ef5L+RvkL7avGH1i/g56cX/P+V/Dz0U+Tn0h+NPth9gMAoYjwKENThZoOxybs2VDBsO7Ckg/zIfyMYZzCSApDOfRz6AOIRcQHGa9UPNPx0MRtGzcwrri44ON0iOMx/qA4mCLm2MuxG4CKoJakhqKqpn1DFUtrSIuOZj1NBBqJNEj0PVFPpi6mToBURLqX6VKlE512Tdq0aRnTnEtTPo2GNBQTUupJ6VtOHZzaAXIR+U7muspHOm+ZvG7zIuYZl8d8Hg65P+Zeyl0pd+T8lXMbABfBLLmm+EBzxfCq5XnkSccjngcC90XuJu5M3J65jfnLf/72ttBVSbpjAAAAAElFTkSuQmCC",
  "base64"
);

const HTML_BODY = Buffer.from("<!DOCTYPE html><html><body>not an image</body></html>", "utf8");

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

/** Scripted `HttpClientPort` double — see `fetch-image.test.ts`'s copy for the shape's rationale. */
class FakeHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  private readonly responses: (HttpResponse | Error)[];
  private cursor = 0;

  constructor(responses: (HttpResponse | Error)[]) {
    this.responses = responses;
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    const next = this.responses[Math.min(this.cursor, this.responses.length - 1)];
    this.cursor += 1;
    if (next instanceof Error) throw next;
    return next;
  }
}

/**
 * A REAL `InMemoryBlobStore` with a tap on every write. Recording rather than stubbing matters: the
 * point is to inspect the exact `Uint8Array` that reached storage while still letting `uploadMedia`'s
 * genuine content-addressed write path run, so a regression that mangled bytes anywhere between the
 * HTTP response and the store is caught by comparing the two ends.
 */
class RecordingBlobStore implements BlobStorePort {
  readonly writes: Array<{ sha256: string; bytes: Uint8Array }> = [];
  private readonly inner = new InMemoryBlobStore();

  async put(input: { workspaceId: string; sha256: string; bytes: Uint8Array }): Promise<{ storageKey: string }> {
    this.writes.push({ sha256: input.sha256, bytes: input.bytes });
    return this.inner.put(input);
  }

  async putIfAbsent(input: { workspaceId: string; sha256: string; bytes: Uint8Array }): Promise<{ storageKey: string; written: boolean }> {
    this.writes.push({ sha256: input.sha256, bytes: input.bytes });
    return this.inner.putIfAbsent(input);
  }

  async get(input: { storageKey: string }): Promise<Uint8Array> {
    return this.inner.get(input);
  }

  async exists(input: { storageKey: string }): Promise<boolean> {
    return this.inner.exists(input);
  }

  async remove(input: { storageKey: string }): Promise<void> {
    return this.inner.remove(input);
  }
}

function imageResponse(bytes: Uint8Array, overrides: Partial<HttpResponse> = {}): HttpResponse {
  return { status: 200, headers: { "content-type": "image/png" }, bodyText: Buffer.from(bytes).toString("utf8"), bodyBytes: bytes, bodyTruncated: false, ...overrides };
}

function fakeRouteDeps(options: { allow?: boolean; responses?: (HttpResponse | Error)[] } = {}) {
  const allow = options.allow ?? true;
  const mediaRepo = new InMemoryMediaRepo();
  const assetBlobRepo = new InMemoryAssetBlobRepo();
  const assetRenditionRepo = new InMemoryAssetRenditionRepo();
  const blobStore = new RecordingBlobStore();
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo();
  const mediaImportHttpClient = new FakeHttpClient(options.responses ?? [imageResponse(REAL_PNG)]);
  const authorizeCalls: Array<Record<string, unknown>> = [];

  let counter = 0;
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: {
      newId: () => {
        counter += 1;
        return `id-${counter}`;
      },
    },
    mediaRepo,
    assetBlobRepo,
    assetRenditionRepo,
    blobStore,
    mediaContentTypeStore,
    transformDefinitionRepo,
    mediaImportHttpClient,
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
  };

  return { deps: deps as unknown as RouteDeps, mediaRepo, assetBlobRepo, blobStore, mediaContentTypeStore, transformDefinitionRepo, mediaImportHttpClient, authorizeCalls };
}

async function seedPublicTransform(transformDefinitionRepo: InMemoryTransformDefinitionRepo): Promise<void> {
  await registerTransform({
    deps: { transformRepo: transformDefinitionRepo, idGen: { newId: () => "transform-public-v1" }, clock: { nowIso: () => NOW } },
    input: { workspaceId: WORKSPACE_ID, name: "public", params: { format: "webp" }, owner: "core" },
  });
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = mediaImportAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

function mediaImportRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(buildAssistantToolRegistrations(deps).filter((r) => r.descriptor.id.startsWith("media_import")).map((r) => [r.descriptor.id, r]));
}

function wired(toolId: string, deps: RouteDeps): ToolRegistration {
  const found = mediaImportRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

interface ImportResult {
  media: { id: string; title: string; alt: string; caption: string; credit: string; sha256: string; status: string; version: number; publicUrl: string | null; sourceUrl: string };
}

// ---------------------------------------------------------------------------
// 1. Wiring and published contract
// ---------------------------------------------------------------------------

test("exactly one tool is wired: media_import_from_url", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...mediaImportRegistrations(deps).keys()], ["media_import_from_url"]);
});

test("media_import_from_url publishes its catalog entry's inputSchema and description", () => {
  const { deps } = fakeRouteDeps();
  const registration = wired("media_import_from_url", deps);
  assert.ok(registration.descriptor.inputSchema);
  assert.deepEqual(registration.descriptor.inputSchema, catalogEntry("media_import_from_url").inputSchema);
  assert.equal(registration.descriptor.description, catalogEntry("media_import_from_url").description);
});

test("the catalog's declared side effect and this wiring layer's own risk classification agree", () => {
  assert.doesNotThrow(() => assertRiskMetadataIsWirable("media_import_from_url", catalogEntry("media_import_from_url")));
  assert.equal(catalogEntry("media_import_from_url").sideEffects, "mutates-durable-state");
});

// ---------------------------------------------------------------------------
// 2. The bytes — not "a row exists"
// ---------------------------------------------------------------------------

test("the exact bytes the HTTP client returned reach the blob store, byte for byte, with a matching sha256", async () => {
  const { deps, blobStore, transformDefinitionRepo } = fakeRouteDeps();
  await seedPublicTransform(transformDefinitionRepo);

  const out = (await wired("media_import_from_url", deps).handler(executionContext({ url: SOURCE_URL }))) as ImportResult;

  assert.equal(blobStore.writes.length, 1, "exactly one blob write — a second path writing its own copy would be the defect this domain refuses to add");
  assert.deepStrictEqual(Buffer.from(blobStore.writes[0]!.bytes), REAL_PNG, "the stored bytes must be the response bytes, unmodified");
  assert.equal(blobStore.writes[0]!.bytes.byteLength, REAL_PNG.byteLength, "a byte count that differs means the payload was re-encoded somewhere");
  assert.equal(blobStore.writes[0]!.sha256, sha256Hex(REAL_PNG), "the storage key's hash must be the hash of the real source bytes");
  assert.equal(out.media.sha256, sha256Hex(REAL_PNG), "the sha256 the tool reports back must be the same one it stored under");
});

test("the bytes are readable back out of the store under the reported hash — the stored object is not empty", async () => {
  const { deps, blobStore } = fakeRouteDeps();

  const out = (await wired("media_import_from_url", deps).handler(executionContext({ url: SOURCE_URL }))) as ImportResult;

  const stored = await blobStore.get({ storageKey: `ws/${WORKSPACE_ID}/blobs/${out.media.sha256.slice(0, 2)}/${out.media.sha256}` });
  assert.deepStrictEqual(Buffer.from(stored), REAL_PNG, "reading the blob back must return the source image, not a truncated or re-encoded one");
});

test("the SNIFFED content type is recorded against the blob's sha256, so the media library types it correctly", async () => {
  const { deps, mediaContentTypeStore } = fakeRouteDeps();

  const out = (await wired("media_import_from_url", deps).handler(executionContext({ url: SOURCE_URL }))) as ImportResult;

  const recorded = await mediaContentTypeStore.getMany({ workspaceId: WORKSPACE_ID, sha256s: [out.media.sha256] });
  assert.equal(recorded.get(out.media.sha256), "image/png");
});

test("the returned view is the same shape media_upload_asset/media_generate_asset return, plus the resolved sourceUrl", async () => {
  const { deps, transformDefinitionRepo } = fakeRouteDeps();
  await seedPublicTransform(transformDefinitionRepo);

  const out = (await wired("media_import_from_url", deps).handler(executionContext({ url: SOURCE_URL }))) as ImportResult;

  assert.deepEqual(Object.keys(out.media).sort(), ["alt", "caption", "credit", "id", "publicUrl", "sha256", "slug", "sourceUrl", "status", "title", "version"]);
  assert.equal(out.media.status, "active");
  assert.equal(out.media.version, 1);
  assert.equal(out.media.publicUrl, `/m/${out.media.id}/public.v1/image.webp`);
  assert.equal(out.media.sourceUrl, SOURCE_URL, "the transcript must record where the bytes actually came from");
});

test("optional alt/caption/credit and the filename override are threaded onto the created asset", async () => {
  const { deps, mediaRepo } = fakeRouteDeps();

  await wired("media_import_from_url", deps).handler(
    executionContext({ url: SOURCE_URL, filename: "red fox snowy pine forest dawn", alt: "A red fox", caption: "At dawn", credit: "Higgsfield" })
  );

  const [stored] = await mediaRepo.list({ workspaceId: WORKSPACE_ID });
  assert.ok(stored);
  assert.equal(stored.alt, "A red fox");
  assert.equal(stored.caption, "At dawn");
  assert.equal(stored.credit, "Higgsfield");
  assert.match(stored.title, /red-fox-snowy-pine-forest-dawn/, `the override must drive the title; got '${stored.title}'`);
});

test("importing the same URL twice de-duplicates to ONE stored blob while creating a second library entry", async () => {
  const { deps, blobStore, mediaRepo } = fakeRouteDeps({ responses: [imageResponse(REAL_PNG), imageResponse(REAL_PNG)] });

  const first = (await wired("media_import_from_url", deps).handler(executionContext({ url: SOURCE_URL }))) as ImportResult;
  const second = (await wired("media_import_from_url", deps).handler(executionContext({ url: SOURCE_URL }))) as ImportResult;

  assert.equal(first.media.sha256, second.media.sha256, "identical bytes must hash identically");
  assert.notEqual(first.media.id, second.media.id);
  assert.equal((await mediaRepo.list({ workspaceId: WORKSPACE_ID })).length, 2);
  const distinctKeys = new Set(blobStore.writes.map((write) => write.sha256));
  assert.equal(distinctKeys.size, 1, "dedup is by content address — the second import must not write a second distinct blob");
});

// ---------------------------------------------------------------------------
// 3. Rejections persist NOTHING
// ---------------------------------------------------------------------------

test("a non-https URL is rejected, nothing is fetched, and nothing is persisted", async () => {
  const { deps, mediaRepo, blobStore, mediaImportHttpClient } = fakeRouteDeps();

  const error = await wired("media_import_from_url", deps)
    .handler(executionContext({ url: "http://cdn.example.com/fox.png" }))
    .then(() => null, (e: unknown) => e as Error);

  assert.ok(error);
  assert.match(error.message, /must use https/);
  assert.match(error.message, /"additionalProperties":false/, "the published schema must travel with the failure, per withSchemaOnRejection");
  assert.equal(mediaImportHttpClient.calls.length, 0, "the server must not have made the request at all");
  assert.equal(blobStore.writes.length, 0);
  assert.deepEqual(await mediaRepo.list({ workspaceId: WORKSPACE_ID }), []);
});

test("a URL that answers image/png with an HTML body is rejected and NOTHING is written — no row, no blob, no content type", async () => {
  const { deps, mediaRepo, blobStore, mediaContentTypeStore } = fakeRouteDeps({ responses: [imageResponse(HTML_BODY)] });

  await assert.rejects(() => wired("media_import_from_url", deps).handler(executionContext({ url: SOURCE_URL })), /its actual bytes are 'text\/html'/);

  assert.equal(blobStore.writes.length, 0, "a rejected import must never reach the blob store");
  assert.deepEqual(await mediaRepo.list({ workspaceId: WORKSPACE_ID }), []);
  assert.equal((await mediaContentTypeStore.getMany({ workspaceId: WORKSPACE_ID, sha256s: [sha256Hex(HTML_BODY)] })).size, 0);
});

test("a truncated response is rejected and NOTHING is written — the 'rows exist, bytes are corrupt' shape never happens", async () => {
  const { deps, mediaRepo, blobStore } = fakeRouteDeps({ responses: [imageResponse(REAL_PNG.subarray(0, 300), { bodyTruncated: true })] });

  await assert.rejects(() => wired("media_import_from_url", deps).handler(executionContext({ url: SOURCE_URL })), /Nothing was saved/);

  assert.equal(blobStore.writes.length, 0);
  assert.deepEqual(await mediaRepo.list({ workspaceId: WORKSPACE_ID }), []);
});

test("a transport-level SSRF refusal propagates and nothing is written", async () => {
  const refusal = new Error("egress to '169.254.169.254' (169.254.169.254) rejected: resolved address is link-local");
  const { deps, mediaRepo, blobStore } = fakeRouteDeps({ responses: [refusal] });

  await assert.rejects(
    () => wired("media_import_from_url", deps).handler(executionContext({ url: "https://metadata.example.com/latest/meta-data/" })),
    /resolved address is link-local/
  );

  assert.equal(blobStore.writes.length, 0);
  assert.deepEqual(await mediaRepo.list({ workspaceId: WORKSPACE_ID }), []);
});

test("a missing 'url' is rejected before the network", async () => {
  const { deps, mediaImportHttpClient } = fakeRouteDeps();

  await assert.rejects(() => wired("media_import_from_url", deps).handler(executionContext({})), /url/);
  assert.equal(mediaImportHttpClient.calls.length, 0);
});

// ---------------------------------------------------------------------------
// 4. Authorization
// ---------------------------------------------------------------------------

test("calls authorize() with media.upload and the run's principal", async () => {
  const { deps, authorizeCalls } = fakeRouteDeps();

  await wired("media_import_from_url", deps).handler(executionContext({ url: SOURCE_URL }));

  assert.equal(authorizeCalls.length, 1);
  assert.equal(authorizeCalls[0]!.principalId, PRINCIPAL_ID);
  assert.equal(authorizeCalls[0]!.permission, "media.upload");
  assert.equal(authorizeCalls[0]!.permission, catalogEntry("media_import_from_url").authorization.permission);
  assert.equal(authorizeCalls[0]!.workspaceId, WORKSPACE_ID);
});

test("a denied principal is rejected, the URL is never fetched, and nothing is written", async () => {
  const { deps, mediaRepo, blobStore, mediaImportHttpClient } = fakeRouteDeps({ allow: false });

  await assert.rejects(
    () => wired("media_import_from_url", deps).handler(executionContext({ url: SOURCE_URL })),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenError);
      assert.match((error as Error).message, new RegExp(PRINCIPAL_ID));
      assert.match((error as Error).message, /media\.upload/);
      return true;
    }
  );

  assert.equal(mediaImportHttpClient.calls.length, 0, "the permission gate must run before the outbound request — otherwise an unauthorized principal can still make the server fetch a URL of their choosing");
  assert.equal(blobStore.writes.length, 0);
  assert.deepEqual(await mediaRepo.list({ workspaceId: WORKSPACE_ID }), []);
});

test("the ToolPolicy layer is a pass-through 'allow' — enforcement is this domain's own inline requireToolPermission call", () => {
  const { deps } = fakeRouteDeps();
  const registration = wired("media_import_from_url", deps);
  assert.equal(registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} }), "allow");
});

// ---------------------------------------------------------------------------
// MI-02 — the declared contract for `sourceUrl` (this module's `ImportedMediaView` doc: "after
// redirect resolution and normalization") reaching the actual emitted value.
// ---------------------------------------------------------------------------

test("sourceUrl records the hop that served the bytes after a redirect, which is what its contract has always claimed", async () => {
  const redirectedTo = "https://files.example.net/signed/fox-final.png";
  const { deps, transformDefinitionRepo } = fakeRouteDeps({ responses: [imageResponse(REAL_PNG, { finalUrl: redirectedTo })] });
  await seedPublicTransform(transformDefinitionRepo);

  const out = (await wired("media_import_from_url", deps).handler(executionContext({ url: SOURCE_URL }))) as ImportResult;

  assert.equal(out.media.sourceUrl, redirectedTo, "recording SOURCE_URL here would make the transcript name a URL that served nothing");
  assert.notEqual(out.media.sourceUrl, SOURCE_URL, "and the two really are different, so this assertion is not passing by coincidence");
});

test("an import with no redirect still records the requested URL — splitting the field's meaning must not blank the ordinary case", async () => {
  const { deps, transformDefinitionRepo } = fakeRouteDeps();
  await seedPublicTransform(transformDefinitionRepo);

  const out = (await wired("media_import_from_url", deps).handler(executionContext({ url: SOURCE_URL }))) as ImportResult;

  assert.equal(out.media.sourceUrl, SOURCE_URL);
});
