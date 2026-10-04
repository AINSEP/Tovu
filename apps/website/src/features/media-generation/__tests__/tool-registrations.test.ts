import type { HttpClientPort } from "@jini-ai/core/primitives";
import { createHttpClient, EgressRefusedError } from "@jini-ai/platform/http/guarded";
import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { ForbiddenError } from "@jini-ai/cms/core";

import {
  InMemoryAssetBlobRepo,
  InMemoryAssetRenditionRepo,
  InMemoryMediaContentTypeStore,
  InMemoryMediaRepo,
  InMemoryBlobStore,
  InMemoryTransformDefinitionRepo,
  MediaProviderCredentialSecretStoreUnconfiguredError,
  registerTransform,
  saveMediaProviderCredentials,
} from "../../media/index.js";
import { InMemoryMediaProviderCredentialRepo } from "../../media/provider-credential-store.memory.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { KeyringPort } from "../../webhooks/index.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import type { RouteDeps } from "../../../server/routes/types.js";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../../../assistant/tool-registrations.js";

import { contributeMediaGenerationTools } from "../tool-registrations.js";
import { type AgentToolDefinition } from "@jini-ai/core";
import { mediaGenerationAgentToolCatalog } from "../agent-tools.js";
import type { MediaGenerationRequest, MediaGenerationResult, ProviderCredentials } from "@jini-ai/integrations/media-providers";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

/** A `KeyringPort` that always fails — simulates a missing/rotated `TOVU_INTEGRATIONS_ROOT_KEY`
 *  without touching real env state. Same local-duplicate idiom every other credential-store test in
 *  this codebase uses (e.g. `media/__tests__/provider-credential-store.test.ts`'s own copy). */
class BrokenKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    throw new Error("no root key: TOVU_INTEGRATIONS_ROOT_KEY is not set");
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
  async derive(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
}

/**
 * Covers `media_generate_asset`: catalog completeness, the "no credential configured" fail-closed
 * path (nothing written, nothing generated), the real decrypt -> generate -> upload -> publicUrl
 * pipeline against a FAKE `generateMedia` (never a real network call — see `tool-registrations.ts`'s
 * own `MediaGenerationToolDeps.generateMedia` doc for why this seam exists), default-vs-explicit
 * model selection, and the authorization half (this domain's own inline `requireToolPermission`
 * call, mirroring `tool-registrations.media.test.ts`'s identical structure for the sibling domain).
 */

contributions.contributors.clear({});
contributions.contributors.register({ contribution: contributeMediaGenerationTools() });

const WORKSPACE_ID = "ws-media-generation-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-02T00:00:00.000Z";
const FAKE_PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function fakeGenerateMedia(
  recorded: Array<{ request: MediaGenerationRequest; credentials: ProviderCredentials; options: { providerId: string; allowStubFallback: boolean } }>
): (
  request: MediaGenerationRequest,
  credentials: ProviderCredentials,
  options: { providerId: string; allowStubFallback: boolean }
) => Promise<MediaGenerationResult> {
  return async (request, credentials, options) => {
    recorded.push({ request, credentials, options });
    return { bytes: FAKE_PNG_BYTES, providerNote: "fake/test", providerId: options.providerId, usedStubFallback: false, warnings: [] };
  };
}

async function seedPublicTransform(transformDefinitionRepo: InMemoryTransformDefinitionRepo): Promise<void> {
  await registerTransform({
    deps: { transformRepo: transformDefinitionRepo, idGen: { newId: () => "transform-public-v1" }, clock: { nowMs() { return Date.parse(this.nowIso()); }, nowIso: () => NOW } },
    input: { workspaceId: WORKSPACE_ID, name: "public", params: { format: "webp" }, owner: "core" },
  });
}

function fakeRouteDeps(
  options: {
    allow?: boolean;
    withCredential?: boolean;
    httpClient?: HttpClientPort;
    /** Pass `null` to omit the field entirely, so the handler falls through to the REAL
     *  `defaultGenerateMedia` (the real dispatch engine) instead of this file's injected fake — only
     *  safe with a deterministic guarded HTTP port, or scenarios proven never to reach a network call (the stub-fallback tests below, where
     *  the selected model's provider has no adapter registered at all). Omitted/`undefined` uses the
     *  fake, as before. */
    generateMedia?:
      | ((request: MediaGenerationRequest, credentials: ProviderCredentials, options: { providerId: string; allowStubFallback: boolean }) => Promise<MediaGenerationResult>)
      | null;
    /** Defaults to `{}` (no env vars at all) — deliberately NOT the real `process.env` — so no test
     *  here can pass or fail depending on what happens to be set on the machine running it. Tests
     *  that need the env-fallback path pass their own fixed map. */
    env?: NodeJS.ProcessEnv;
  } = {}
) {
  const allow = options.allow ?? true;
  const mediaRepo = new InMemoryMediaRepo({});
  const assetBlobRepo = new InMemoryAssetBlobRepo({});
  const assetRenditionRepo = new InMemoryAssetRenditionRepo({});
  const blobStore = new InMemoryBlobStore();
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo({});
  const mediaProviderCredentialRepo = new InMemoryMediaProviderCredentialRepo();
  const keyring = new InMemoryKeyring();
  const siteAssistantSecretSealer = new AesGcmSecretSealer(keyring);
  const authorizeCalls: Array<Record<string, unknown>> = [];
  const generateCalls: Array<{ request: MediaGenerationRequest; credentials: ProviderCredentials; options: { providerId: string; allowStubFallback: boolean } }> = [];

  let counter = 0;
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowMs() { return Date.parse(this.nowIso()); }, nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    mediaRepo,
    assetBlobRepo,
    assetRenditionRepo,
    blobStore,
    mediaContentTypeStore,
    transformDefinitionRepo,
    mediaProviderCredentialRepo,
    siteAssistantSecretSealer,
    mediaGenerationHttpClient: options.httpClient ?? {
      send: async () => { throw new Error("fixture forbids external media HTTP"); },
    },
    generateMedia: options.generateMedia === null ? undefined : (options.generateMedia ?? fakeGenerateMedia(generateCalls)),
    env: options.env ?? {},
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
  };

  return { deps: deps as unknown as RouteDeps, blobStore, assetBlobRepo, mediaContentTypeStore, mediaRepo, transformDefinitionRepo, mediaProviderCredentialRepo, siteAssistantSecretSealer, keyring, authorizeCalls, generateCalls };
}

/** Seeds a real, decryptable "openai" credential row through the actual write path
 *  (`saveMediaProviderCredentials`), so `resolveMediaProviderCredential` inside the handler decrypts
 *  genuine ciphertext rather than a hand-built fixture. Takes the WHOLE `fakeRouteDeps()` fixture
 *  (not just its `deps`) because the repo/sealer/keyring instances it needs are returned alongside
 *  `deps`, not readable off `deps` itself — `RouteDeps` has no `keyring` field of its own; only this
 *  test's own seeding needs one. */
async function seedOpenAiCredential(fixture: Pick<ReturnType<typeof fakeRouteDeps>, "mediaProviderCredentialRepo" | "siteAssistantSecretSealer" | "keyring">): Promise<void> {
  await saveMediaProviderCredentials(
    { repo: fixture.mediaProviderCredentialRepo, sealer: fixture.siteAssistantSecretSealer, keyring: fixture.keyring, clock: { nowMs() { return Date.parse(this.nowIso()); }, nowIso: () => NOW } },
    { workspaceId: WORKSPACE_ID, providers: { openai: { apiKey: "sk-real-test-key-7777", baseUrl: "https://api.openai.com/v1" } } }
  );
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

test("generated assets stamp the acting principal independently of the model and credit", async () => {
  const fixture = fakeRouteDeps();
  await seedOpenAiCredential(fixture);
  const result = await wired("media_generate_asset", fixture.deps).handler(executionContext({
    prompt: "A green bicycle", credit: "Editorial credit", createdBy: "forged-source-actor",
  })) as { media: { id: string; createdBy: string } };
  assert.equal(result.media.createdBy, PRINCIPAL_ID);
  const stored = await fixture.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: result.media.id });
  assert.ok(stored);
  assert.equal((stored as { createdBy?: string }).createdBy, PRINCIPAL_ID);
  assert.equal(stored.credit, "Editorial credit");
});

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = mediaGenerationAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

function mediaGenerationRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(buildAssistantToolRegistrations(deps, undefined, { contributions }).filter((r) => r.descriptor.id.startsWith("media_generate")).map((r) => [r.descriptor.id, r]));
}

function wired(toolId: string, deps: RouteDeps): ToolRegistration {
  const found = mediaGenerationRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

// ---------------------------------------------------------------------------
// 1. Catalog completeness and published contract
// ---------------------------------------------------------------------------

test("exactly one tool is wired: media_generate_asset", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...mediaGenerationRegistrations(deps).keys()], ["media_generate_asset"]);
});

test("media_generate_asset publishes its catalog entry's inputSchema and description", () => {
  const { deps } = fakeRouteDeps();
  const registration = wired("media_generate_asset", deps);
  assert.ok(registration.descriptor.inputSchema);
  assert.deepEqual(registration.descriptor.inputSchema, catalogEntry("media_generate_asset").inputSchema);
  assert.equal(registration.descriptor.description, catalogEntry("media_generate_asset").description);
});

test("requiresConfirmation is unset — no ceremony beyond the ordinary permission gate", () => {
  const { deps } = fakeRouteDeps();
  assert.equal(wired("media_generate_asset", deps).descriptor.requiresConfirmation, undefined);
});

test("the real catalog and this wiring layer's own risk classification agree", () => {
  assert.doesNotThrow(() => assertRiskMetadataIsWirable("media_generate_asset", catalogEntry("media_generate_asset"), contributions));
});

// ---------------------------------------------------------------------------
// 2. No credential configured — fails closed, nothing written, nothing generated
// ---------------------------------------------------------------------------

test("no OpenAI credential configured: rejects with a clear message naming Media providers, calls neither generateMedia nor uploadMedia", async () => {
  const { deps, mediaRepo, generateCalls } = fakeRouteDeps();

  await assert.rejects(
    () => wired("media_generate_asset", deps).handler(executionContext({ prompt: "a red bicycle" })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /no OpenAI media-provider credential is configured/);
      assert.match(error.message, /Media providers/);
      assert.match(error.message, /Do not retry/);
      return true;
    }
  );

  assert.equal(generateCalls.length, 0, "the vendor must never be called when there is no credential to call it with");
  assert.deepEqual(await mediaRepo.list({ workspaceId: WORKSPACE_ID }), [], "nothing may be written when generation never ran");
});

test("a credential saved with baseUrl/model but no key yet is treated the same as no credential at all", async () => {
  const { deps, mediaProviderCredentialRepo, siteAssistantSecretSealer, keyring, generateCalls } = fakeRouteDeps();
  await saveMediaProviderCredentials(
    { repo: mediaProviderCredentialRepo, sealer: siteAssistantSecretSealer, keyring, clock: { nowMs() { return Date.parse(this.nowIso()); }, nowIso: () => NOW } },
    { workspaceId: WORKSPACE_ID, providers: { openai: { baseUrl: "https://api.openai.com/v1" } } }
  );

  await assert.rejects(() => wired("media_generate_asset", deps).handler(executionContext({ prompt: "a red bicycle" })), /no OpenAI media-provider credential is configured/);
  assert.equal(generateCalls.length, 0);
});

// ---------------------------------------------------------------------------
// 3. The real pipeline: decrypt -> generate -> upload -> content-type -> publicUrl
// ---------------------------------------------------------------------------

test("with a saved credential: generates through the injected seam, uploads the bytes, and returns the same view shape media_upload_asset returns", async () => {
  const fixture = fakeRouteDeps();
  const { deps, blobStore, assetBlobRepo, transformDefinitionRepo, generateCalls } = fixture;
  await seedOpenAiCredential(fixture);
  await seedPublicTransform(transformDefinitionRepo);

  const out = (await wired("media_generate_asset", deps).handler(executionContext({ prompt: "a red bicycle on a beach" }))) as {
    media: { id: string; slug: string; title: string; alt: string; caption: string; credit: string; sha256: string; status: string; version: number; placeholder: boolean; publicUrl: string | null; createdBy: string | null };
  };

  assert.equal(generateCalls.length, 1);
  assert.equal(generateCalls[0]!.request.prompt, "a red bicycle on a beach");
  assert.equal(generateCalls[0]!.request.model, "gpt-image-2", "default model must be gpt-image-2 when omitted");
  assert.equal(generateCalls[0]!.request.surface, "image");
  assert.equal(generateCalls[0]!.credentials.apiKey, "sk-real-test-key-7777", "the decrypted key must reach the generation call");
  assert.equal(generateCalls[0]!.credentials.baseUrl, "https://api.openai.com/v1");

  assert.equal(out.media.status, "active");
  assert.equal(out.media.version, 1);
  assert.ok(out.media.id);
  assert.ok(out.media.sha256, "the uploaded bytes must be hashed like any other upload");
  assert.equal(out.media.sha256, createHash("sha256").update(FAKE_PNG_BYTES).digest("hex"));
  const blob = await assetBlobRepo.findByHash({ workspaceId: WORKSPACE_ID, sha256: out.media.sha256 });
  assert.ok(blob);
  const storedBytes = await blobStore.get({ storageKey: blob.storageKey });
  assert.deepEqual(Buffer.from(storedBytes), FAKE_PNG_BYTES, "binary renderer bytes survive the upload unchanged");
  assert.equal(createHash("sha256").update(storedBytes).digest("hex"), out.media.sha256);
  assert.equal(out.media.publicUrl, `/m/${out.media.slug}/public.v1/image.webp`);
  assert.equal(out.media.placeholder, false, "a real (non-stub) generation must report placeholder:false");
  assert.deepEqual(Object.keys(out.media).sort(), ["alt", "caption", "createdBy", "credit", "id", "placeholder", "publicUrl", "sha256", "slug", "status", "title", "version"]);
  assert.equal(out.media.createdBy, PRINCIPAL_ID, "the view carries the acting principal, like media_upload_asset's");
});

test("an explicit model is passed through instead of the default", async () => {
  const fixture = fakeRouteDeps();
  const { deps, transformDefinitionRepo, generateCalls } = fixture;
  await seedOpenAiCredential(fixture);
  await seedPublicTransform(transformDefinitionRepo);

  await wired("media_generate_asset", deps).handler(executionContext({ prompt: "a logo", model: "dall-e-3" }));

  assert.equal(generateCalls.length, 1);
  assert.equal(generateCalls[0]!.request.model, "dall-e-3");
});

test("the generated asset's content type is recorded (image/png) so it appears correctly typed in media_list_assets", async () => {
  const fixture = fakeRouteDeps();
  const { deps, mediaRepo, mediaContentTypeStore } = fixture;
  await seedOpenAiCredential(fixture);

  const out = (await wired("media_generate_asset", deps).handler(executionContext({ prompt: "a logo" }))) as { media: { sha256: string } };
  const [stored] = await mediaRepo.list({ workspaceId: WORKSPACE_ID });
  assert.equal(stored?.source.sha256, out.media.sha256);
  const contentTypes = await mediaContentTypeStore.getMany({ workspaceId: WORKSPACE_ID, sha256s: [out.media.sha256] });
  assert.equal(contentTypes.get(out.media.sha256), "image/png");
});

test("an unsupported model id is rejected with the schema attached for retry, and generateMedia is never called", async () => {
  // A credential IS configured — otherwise a rejection could come from "no credential configured"
  // instead of the model check this test targets, masking a regression in the validation itself.
  const fixture = fakeRouteDeps();
  const { deps, generateCalls } = fixture;
  await seedOpenAiCredential(fixture);

  const error = await wired("media_generate_asset", deps)
    .handler(executionContext({ prompt: "a logo", model: "some-other-vendor-model" }))
    .then(() => null, (e: unknown) => e as Error);

  assert.ok(error, "an unsupported model must reject");
  assert.match(error.message, /'model' must be a registered image model — got 'some-other-vendor-model'/);
  assert.match(error.message, /"additionalProperties":false/, "the published schema must travel with the failure, per withSchemaOnRejection");
  assert.equal(generateCalls.length, 0, "an invalid model must never reach the vendor call");
});

// ---------------------------------------------------------------------------
// 3b. Multi-provider model resolution + credential precedence (2026-09-02 follow-up)
// ---------------------------------------------------------------------------

test("a non-OpenAI model (nanobanana) with no saved credential falls back to the injected env credential", async () => {
  const { deps, generateCalls } = fakeRouteDeps({ env: { GEMINI_API_KEY: "env-gemini-key" } });

  await wired("media_generate_asset", deps).handler(executionContext({ prompt: "a red circle", model: "gemini-3.1-flash-image-preview" }));

  assert.equal(generateCalls.length, 1);
  assert.equal(generateCalls[0]!.options.providerId, "nanobanana", "the provider id must be resolved from the selected model, not hardcoded to openai");
  assert.equal(generateCalls[0]!.credentials.apiKey, "env-gemini-key");
  assert.equal(generateCalls[0]!.request.model, "gemini-3.1-flash-image-preview");
});

test("no model specified, no OpenAI credential anywhere, but a different vendor's env credential IS set: the default resolves to a model that vendor can actually generate with, not a hardcoded OpenAI id that always fails here", async () => {
  const { deps, generateCalls } = fakeRouteDeps({ env: { GEMINI_API_KEY: "env-gemini-key" } });

  await wired("media_generate_asset", deps).handler(executionContext({ prompt: "a red circle" }));

  assert.equal(generateCalls.length, 1, "must not reject with 'no OpenAI credential configured' when a different vendor is actually usable");
  assert.equal(generateCalls[0]!.options.providerId, "nanobanana", "default must resolve to the one provider with an actual credential, not stay hardcoded to openai");
  assert.equal(generateCalls[0]!.request.model, "gemini-3.1-flash-image-preview");
  assert.equal(generateCalls[0]!.credentials.apiKey, "env-gemini-key");
});

test("a saved credential wins over the env fallback even when both are present", async () => {
  const fixture = fakeRouteDeps({ env: { OPENAI_API_KEY: "env-key-must-be-ignored" } });
  const { deps, generateCalls } = fixture;
  await seedOpenAiCredential(fixture);

  await wired("media_generate_asset", deps).handler(executionContext({ prompt: "a logo" }));

  assert.equal(generateCalls.length, 1);
  assert.equal(generateCalls[0]!.credentials.apiKey, "sk-real-test-key-7777", "the SAVED key must win, not the env one");
});

test("a saved credential that fails to decrypt throws its own error and never falls through to env", async () => {
  const fixture = fakeRouteDeps({ env: { OPENAI_API_KEY: "env-key-must-never-be-used" } });
  await seedOpenAiCredential(fixture);
  // Same repo (holds the already-seeded row), but a sealer built on a keyring that can never derive
  // the key it was sealed with — simulates a rotated/missing master secret without touching real env
  // state (same idiom `media/__tests__/provider-credential-store.test.ts` already establishes).
  const brokenDeps = { ...fixture.deps, siteAssistantSecretSealer: new AesGcmSecretSealer(new BrokenKeyring()) };

  await assert.rejects(
    () => wired("media_generate_asset", brokenDeps).handler(executionContext({ prompt: "a logo" })),
    (error: unknown) => {
      assert.ok(error instanceof MediaProviderCredentialSecretStoreUnconfiguredError, `expected MediaProviderCredentialSecretStoreUnconfiguredError, got ${String(error)}`);
      return true;
    }
  );
  assert.equal(fixture.generateCalls.length, 0, "a broken saved credential must never silently fall through to the env key and generate anyway");
});

test("no credential anywhere (saved or env) names the selected model's vendor, not always 'OpenAI'", async () => {
  const { deps, generateCalls } = fakeRouteDeps({ env: {} });

  await assert.rejects(
    () => wired("media_generate_asset", deps).handler(executionContext({ prompt: "a red circle", model: "gemini-3.1-flash-image-preview" })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /no Nano Banana media-provider credential is configured/);
      assert.match(error.message, /GOOGLE_API_KEY, GEMINI_API_KEY/, "should name the env vars it checked");
      return true;
    }
  );
  assert.equal(generateCalls.length, 0);
});

// ---------------------------------------------------------------------------
// 3c. Stub fallback — explicit opt-in only, flag visibly set on the return
// ---------------------------------------------------------------------------

// 2026-09-02 catalogue fix: 'flux-schnell-fal' (provider 'fal') used to be `integrated: true` in
// the catalogue with ZERO adapter registered anywhere in the dispatch engine's
// `mediaVendorRegistry` — a catalogue lie (see `agent-tools.ts`'s `IMAGE_MODEL_IDS` doc, and
// `@jini-ai/integrations`'s `providers.test.ts` adapter-coverage assertion that now guards every
// provider against this recurring). `fal` is `integrated: false` now, so `IMAGE_MODEL_IDS` no
// longer contains any of its models — 'flux-schnell-fal' fails the SAME schema-level check as any
// other unsupported model id (see "an unsupported model id is rejected..." above) and never reaches
// the dispatch engine at all. The two tests below used to force the REAL engine to run
// (`generateMedia: null`) specifically because this (provider, surface) pair could reach it without
// a fetch call; that's no longer true for any catalogued vendor, so they're rewritten to match.
const UNIMPLEMENTED_VENDOR_MODEL = "flux-schnell-fal";

test("a real vendor's model with no registered adapter is rejected the same as any unsupported model id — never reaches generateMedia", async () => {
  const fixture = fakeRouteDeps();
  const { deps, generateCalls } = fixture;
  await seedOpenAiCredential(fixture);

  const error = await wired("media_generate_asset", deps)
    .handler(executionContext({ prompt: "a red circle", model: UNIMPLEMENTED_VENDOR_MODEL }))
    .then(() => null, (e: unknown) => e as Error);

  assert.ok(error, "a model naming a vendor with no adapter must reject before generation, not at generation time");
  assert.match(error.message, /'model' must be a registered image model — got 'flux-schnell-fal'/);
  assert.equal(generateCalls.length, 0, "this must never reach generateMedia — that's the whole point of the catalogue fix");
});

// The dispatch engine's own "no renderer configured" error and allowStubFallback-returns-a-
// placeholder behavior (`resolveRenderer` finding nothing registered) are still real production
// code paths — every currently catalogued `integrated: true` provider has an adapter now, but a
// FUTURE provider shipped with `integrated: true` and no adapter yet would still hit them. That
// engine-level behavior is proven directly against the engine, bypassing this tool's schema gate
// (which now blocks any such model from reaching the engine at all), in Jini's own
// `dispatch/__tests__/engine.test.ts` ("returns placeholder bytes when allowStubFallback is true and
// no renderer is wired", using `leonardo-phoenix` — a model this tool's own schema rejects for the
// same reason `flux-schnell-fal` now is). What THIS test still owns: proving
// `tool-registrations.ts`'s handler correctly threads `MediaGenerationResult.usedStubFallback` into
// the returned `media.placeholder` field, independent of which vendor produced it.
test("usedStubFallback:true from generateMedia is surfaced as media.placeholder:true on the tool's return", async () => {
  const fixture = fakeRouteDeps({
    generateMedia: async (_request, _credentials, options) => ({
      bytes: FAKE_PNG_BYTES,
      providerNote: "stub/test",
      providerId: options.providerId,
      usedStubFallback: true,
      warnings: [],
    }),
  });
  const { deps, mediaRepo } = fixture;
  await seedOpenAiCredential(fixture);

  const out = (await wired("media_generate_asset", deps).handler(
    executionContext({ prompt: "a red circle", allowStubFallback: true })
  )) as { media: { id: string; placeholder: boolean } };

  assert.equal(out.media.placeholder, true, "a stub-fallback render must be visibly flagged, never mistaken for a real generation");
  const [stored] = await mediaRepo.list({ workspaceId: WORKSPACE_ID });
  assert.ok(stored, "the placeholder bytes must still be uploaded like any other generated asset");
});

test("allowStubFallback:true is forwarded and a non-stub generator result preserves its bytes and placeholder:false", async () => {
  const fixture = fakeRouteDeps();
  const { deps, generateCalls, blobStore, assetBlobRepo } = fixture;
  await seedOpenAiCredential(fixture);

  const out = (await wired("media_generate_asset", deps).handler(executionContext({ prompt: "a logo", allowStubFallback: true }))) as {
    media: { sha256: string; placeholder: boolean };
  };

  assert.equal(generateCalls.length, 1);
  assert.equal(generateCalls[0]!.options.allowStubFallback, true, "the flag is still threaded through to the engine...");
  assert.equal(out.media.placeholder, false);
  const blob = await assetBlobRepo.findByHash({ workspaceId: WORKSPACE_ID, sha256: out.media.sha256 });
  assert.ok(blob);
  assert.deepEqual(Buffer.from(await blobStore.get({ storageKey: blob.storageKey })), FAKE_PNG_BYTES);
});

// ---------------------------------------------------------------------------
// 4. Authorization
// ---------------------------------------------------------------------------

test("calls authorize() with media.upload and the run's principal", async () => {
  const fixture = fakeRouteDeps();
  const { deps, authorizeCalls } = fixture;
  await seedOpenAiCredential(fixture);
  authorizeCalls.length = 0;

  await wired("media_generate_asset", deps).handler(executionContext({ prompt: "a logo" }));

  assert.equal(authorizeCalls.length, 1);
  assert.equal(authorizeCalls[0]!.principalId, PRINCIPAL_ID);
  assert.equal(authorizeCalls[0]!.permission, "media.upload");
  assert.equal(authorizeCalls[0]!.permission, catalogEntry("media_generate_asset").authorization.permission);
  assert.equal(authorizeCalls[0]!.workspaceId, WORKSPACE_ID);
});

test("a denied principal is rejected and NOTHING is written or generated", async () => {
  const fixture = fakeRouteDeps({ allow: false });
  const { deps, mediaRepo, generateCalls } = fixture;
  // A credential IS configured — proves the denial is the permission gate, not a fallthrough to
  // the "no credential" rejection.
  await seedOpenAiCredential(fixture);

  await assert.rejects(
    () => wired("media_generate_asset", deps).handler(executionContext({ prompt: "a logo" })),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenError);
      assert.match((error as Error).message, new RegExp(PRINCIPAL_ID));
      assert.match((error as Error).message, /media\.upload/);
      return true;
    }
  );

  assert.equal(generateCalls.length, 0, "the permission gate must run before any generation call");
  assert.deepEqual(await mediaRepo.list({ workspaceId: WORKSPACE_ID }), []);
});

test("the ToolPolicy layer is a pass-through 'allow' — enforcement is this file's own inline requireToolPermission call", () => {
  const { deps } = fakeRouteDeps();
  const registration = wired("media_generate_asset", deps);
  const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
  assert.equal(decision, "allow");
});


// REGRESSION: fails if defaultGenerateMedia stops forwarding the host's guarded HTTP client.
for (const scenario of ["private", "redirect", "public"] as const) {
  test(`media generation enforces host egress policy for a provider-returned ${scenario} asset`, async () => {
    const transported: string[] = [];
    const assetUrl = scenario === "private" ? "http://127.0.0.1/private.png" : "https://assets.example/generated.png";
    const httpClient = createHttpClient({
      userAgent: "Tovu-media-egress-test",
      dns: { resolve: async () => ["8.8.8.8"] },
      clock: { nowMs: () => Date.parse(NOW), timeoutSignal: () => new AbortController().signal },
      policy: {
        allowedSchemes: ["http", "https"], denyPrivateAddresses: true, devHostAllowlist: [],
        maxRedirects: 0, connectTimeoutMs: 600_000,
        maxResponseBytes: 96 * 1024 * 1024, maxDecompressedBytes: 96 * 1024 * 1024,
      },
      transport: { requestPinned: async ({ request }) => {
        transported.push(request.url);
        if (request.method === "POST") {
          return { status: 200, headers: { "content-type": "application/json" },
            bodyText: JSON.stringify({ data: [{ url: assetUrl }] }), finalUrl: request.url };
        }
        if (scenario === "redirect") {
          return { status: 302, headers: { location: "http://127.0.0.1/private.png" }, bodyText: "", finalUrl: request.url };
        }
        return { status: 200, headers: { "content-type": "image/png" }, bodyText: "",
          bodyBytes: FAKE_PNG_BYTES, bodyTruncated: false, bodyBytesTruncated: false, finalUrl: request.url };
      } },
    });
    const fixture = fakeRouteDeps({ generateMedia: null, httpClient });
    await seedOpenAiCredential(fixture);
    await seedPublicTransform(fixture.transformDefinitionRepo);
    const pending = wired("media_generate_asset", fixture.deps).handler(executionContext({ prompt: "a red bicycle", model: "gpt-image-2" }));
    if (scenario === "public") {
      const result = await pending;
      assert.ok(result && typeof result === "object" && "media" in result);
      assert.deepEqual(transported, ["https://api.openai.com/v1/images/generations", assetUrl]);
    } else {
      await assert.rejects(pending, EgressRefusedError);
      assert.equal(transported.some(url => url.includes("127.0.0.1")), false, "a refused peer must never reach the transport");
      assert.equal(transported.length, scenario === "private" ? 1 : 2);
    }
  });
}
