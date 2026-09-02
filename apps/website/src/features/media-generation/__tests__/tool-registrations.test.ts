import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/cms/core";
import { ForbiddenError } from "@jini-ai/cms/core";

import {
  InMemoryAssetBlobRepo,
  InMemoryAssetRenditionRepo,
  InMemoryMediaContentTypeStore,
  InMemoryMediaRepo,
  InMemoryBlobStore,
  InMemoryTransformDefinitionRepo,
  registerTransform,
  saveMediaProviderCredentials,
} from "../../media/index.js";
import { InMemoryMediaProviderCredentialRepo } from "../../media/provider-credential-store.memory.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import type { RouteDeps } from "../../../server/routes/types.js";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../../../assistant/tool-registrations.js";
import { resetToolContributorsForTests, registerToolContributor } from "../../../assistant/tool-contribution-registry.js";
import { contributeMediaGenerationTools } from "../tool-registrations.js";
import { mediaGenerationAgentToolCatalog, type AgentToolDefinition } from "../agent-tools.js";
import type { MediaGenerationRequest, MediaGenerationResult, ProviderCredentials } from "@jini-ai/integrations/media-providers";

/**
 * Covers `media_generate_asset`: catalog completeness, the "no credential configured" fail-closed
 * path (nothing written, nothing generated), the real decrypt -> generate -> upload -> publicUrl
 * pipeline against a FAKE `generateMedia` (never a real network call — see `tool-registrations.ts`'s
 * own `MediaGenerationToolDeps.generateMedia` doc for why this seam exists), default-vs-explicit
 * model selection, and the authorization half (this domain's own inline `requireToolPermission`
 * call, mirroring `tool-registrations.media.test.ts`'s identical structure for the sibling domain).
 */

resetToolContributorsForTests();
registerToolContributor(contributeMediaGenerationTools());

const WORKSPACE_ID = "ws-media-generation-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-02T00:00:00.000Z";
const FAKE_PNG_BYTES = Buffer.from("fake-generated-png-bytes");

function fakeGenerateMedia(
  recorded: Array<{ request: MediaGenerationRequest; credentials: ProviderCredentials }>
): (request: MediaGenerationRequest, credentials: ProviderCredentials) => Promise<MediaGenerationResult> {
  return async (request, credentials) => {
    recorded.push({ request, credentials });
    return { bytes: FAKE_PNG_BYTES, providerNote: "fake/test", providerId: "openai", usedStubFallback: false, warnings: [] };
  };
}

async function seedPublicTransform(transformDefinitionRepo: InMemoryTransformDefinitionRepo): Promise<void> {
  await registerTransform({
    deps: { transformRepo: transformDefinitionRepo, idGen: { newId: () => "transform-public-v1" }, clock: { nowIso: () => NOW } },
    input: { workspaceId: WORKSPACE_ID, name: "public", params: { format: "webp" }, owner: "core" },
  });
}

function fakeRouteDeps(
  options: { allow?: boolean; withCredential?: boolean; generateMedia?: (request: MediaGenerationRequest, credentials: ProviderCredentials) => Promise<MediaGenerationResult> } = {}
) {
  const allow = options.allow ?? true;
  const mediaRepo = new InMemoryMediaRepo();
  const assetBlobRepo = new InMemoryAssetBlobRepo();
  const assetRenditionRepo = new InMemoryAssetRenditionRepo();
  const blobStore = new InMemoryBlobStore();
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo();
  const mediaProviderCredentialRepo = new InMemoryMediaProviderCredentialRepo();
  const keyring = new InMemoryKeyring();
  const siteAssistantSecretSealer = new AesGcmSecretSealer(keyring);
  const authorizeCalls: Array<Record<string, unknown>> = [];
  const generateCalls: Array<{ request: MediaGenerationRequest; credentials: ProviderCredentials }> = [];

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
    mediaProviderCredentialRepo,
    siteAssistantSecretSealer,
    generateMedia: options.generateMedia ?? fakeGenerateMedia(generateCalls),
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
  };

  return { deps: deps as unknown as RouteDeps, mediaRepo, transformDefinitionRepo, mediaProviderCredentialRepo, siteAssistantSecretSealer, keyring, authorizeCalls, generateCalls };
}

/** Seeds a real, decryptable "openai" credential row through the actual write path
 *  (`saveMediaProviderCredentials`), so `resolveMediaProviderCredential` inside the handler decrypts
 *  genuine ciphertext rather than a hand-built fixture. Takes the WHOLE `fakeRouteDeps()` fixture
 *  (not just its `deps`) because the repo/sealer/keyring instances it needs are returned alongside
 *  `deps`, not readable off `deps` itself — `RouteDeps` has no `keyring` field of its own; only this
 *  test's own seeding needs one. */
async function seedOpenAiCredential(fixture: Pick<ReturnType<typeof fakeRouteDeps>, "mediaProviderCredentialRepo" | "siteAssistantSecretSealer" | "keyring">): Promise<void> {
  await saveMediaProviderCredentials(
    { repo: fixture.mediaProviderCredentialRepo, sealer: fixture.siteAssistantSecretSealer, keyring: fixture.keyring, clock: { nowIso: () => NOW } },
    { workspaceId: WORKSPACE_ID, providers: { openai: { apiKey: "sk-real-test-key-7777", baseUrl: "https://api.openai.com/v1" } } }
  );
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = mediaGenerationAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

function mediaGenerationRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(buildAssistantToolRegistrations(deps).filter((r) => r.descriptor.id.startsWith("media_generate")).map((r) => [r.descriptor.id, r]));
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
  assert.doesNotThrow(() => assertRiskMetadataIsWirable("media_generate_asset", catalogEntry("media_generate_asset")));
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
    { repo: mediaProviderCredentialRepo, sealer: siteAssistantSecretSealer, keyring, clock: { nowIso: () => NOW } },
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
  const { deps, transformDefinitionRepo, generateCalls } = fixture;
  await seedOpenAiCredential(fixture);
  await seedPublicTransform(transformDefinitionRepo);

  const out = (await wired("media_generate_asset", deps).handler(executionContext({ prompt: "a red bicycle on a beach" }))) as {
    media: { id: string; title: string; alt: string; caption: string; credit: string; sha256: string; status: string; version: number; publicUrl: string | null };
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
  assert.equal(out.media.publicUrl, `/m/${out.media.id}/public.v1/image.webp`);
  assert.deepEqual(Object.keys(out.media).sort(), ["alt", "caption", "credit", "id", "publicUrl", "sha256", "status", "title", "version"]);
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
  const { deps, mediaRepo } = fixture;
  await seedOpenAiCredential(fixture);

  const out = (await wired("media_generate_asset", deps).handler(executionContext({ prompt: "a logo" }))) as { media: { sha256: string } };
  const [stored] = await mediaRepo.list({ workspaceId: WORKSPACE_ID });
  assert.equal(stored?.source.sha256, out.media.sha256);
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
  assert.match(error.message, /'model' must be one of gpt-image-2, gpt-image-1\.5, dall-e-3/);
  assert.match(error.message, /"additionalProperties":false/, "the published schema must travel with the failure, per withSchemaOnRejection");
  assert.equal(generateCalls.length, 0, "an invalid model must never reach the vendor call");
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
