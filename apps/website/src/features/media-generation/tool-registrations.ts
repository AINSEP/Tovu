import { UPLOAD_CAPS } from "@tovu/contracts/upload-limits";
import { buildMediaGenerationRegistrations as build, mediaGenerationDerivedRisk } from "@jini-ai/cms/media/site-generation/tool-registrations";
import { adaptLegacyAuthorize, type ToolContributor } from "@jini-ai/core";
import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import type { Clock, HttpClientPort } from "@jini-ai/core/primitives";
import type { MediaRecord, AssetBlobRepoPort, AssetRenditionRepoPort, BlobStorePort, MediaRepoPort, TransformDefinitionRepoPort } from "@jini-ai/cms/media";
import { uploadMedia } from "@jini-ai/cms/media";
import type { ImageCodecPort } from "@jini-ai/core/contracts/site/cms-media";
import type { Tracker } from "@jini-ai/core/contracts/site/diagnostics-observability";
import type { SecretSealerPort } from "@jini-ai/integrations/secrets";
import type { MediaProviderCredentialRepoPort } from "@jini-ai/cms/media/site/provider-credential-contracts";
import type { MediaContentTypeStorePort } from "@jini-ai/cms/media/site/content-type-store";
import type { MediaPublicUrlDeps } from "@jini-ai/cms/media/site/contracts";
import { getMediaProviderCredentials, resolveMediaProviderCredential } from "@jini-ai/cms/media/site/provider-credential-store";
import { resolveProviderCredentialsFromEnv, type MediaGenerationRequest, type MediaGenerationResult, type MediaProviderRegistry, type ProviderCredentials } from "@jini-ai/integrations/media-providers";
import { IMAGE_MODEL_IDS, imageModelIdsFrom } from "@jini-ai/integrations/media-providers/catalog";
import { MEDIA_PROVIDER_ALIASES, MEDIA_PROVIDER_ENV_VARS, defaultGenerateMedia, buildNoCredentialError } from "./host-media-providers.js";
import { issueCredentialSetup } from "#src/contracts/core/tool-failure-diagnostics";
import { parseTovuStoreMeta, createTovuStoreVault } from "#src/platform/secrets/vault-kinds";
import { CREDENTIAL_MESSAGES } from "@jini-ai/platform/secrets/credential-token";

const MEDIA_CREDENTIAL_POLICY = { ownerKey: "tovu", legacyIds: { grok: ["xai-grok-imagine"] },
  parseMeta: ({ meta }: { meta: unknown }) => parseTovuStoreMeta({ kind: "media-provider", meta }) as { baseUrl: string | null; model: string | null } };
const MEDIA_CREDENTIAL_BINDINGS = { vaultPolicy: MEDIA_CREDENTIAL_POLICY,
  storageMessage: CREDENTIAL_MESSAGES.storage,
  createVault: (required: Omit<Parameters<typeof createTovuStoreVault>[0], "kind">) => createTovuStoreVault({ ...required, kind: "media-provider" }),
};

type ResolvePublicUrls = (
  required: { deps: MediaPublicUrlDeps & { workspaceId: string }; assets: readonly MediaRecord[] },
  optional?: Record<string, never>,
) => Promise<Map<string, string | null>>;
export interface MediaGenerationToolDeps {
  tracker?: Tracker;
  /** Optional best-effort inline preview, using the same codec as media imports. */
  imageCodec?: ImageCodecPort;
  authorize: AuthorizeFn;
  /** Host-bound guard applies equally to vendor requests and provider-returned asset downloads. */
  mediaGenerationHttpClient: HttpClientPort;
  /** Built-in + plugin-contributed vendors, built ONCE at composition (`media-provider-registry.ts`'s
   *  `loadMediaProviderRegistry`). The tool's `model` enum, validation and dispatch all read it, so a
   *  plugin vendor is advertised, accepted and routed with no other change. */
  mediaProviderRegistry: MediaProviderRegistry;
  workspaceId: string;
  clock: Clock;
  idGen: { newId(): string };
  mediaRepo: MediaRepoPort;
  assetBlobRepo: AssetBlobRepoPort;
  assetRenditionRepo: AssetRenditionRepoPort;
  blobStore: BlobStorePort;
  mediaContentTypeStore: MediaContentTypeStorePort;
  transformDefinitionRepo: TransformDefinitionRepoPort;
  mediaProviderCredentialRepo: MediaProviderCredentialRepoPort;
  /** Same field name `RouteDeps` (and `CustomCredentialsToolDeps`) already uses for this shared
   *  sealer instance — see `provider-credential-store.ts`'s own header for why this store seals
   *  with no `aad`, the one respect in which its usage here differs from `custom-credentials`'s. */
  siteAssistantSecretSealer: SecretSealerPort;
  /**
   * The testability seam for the one real external I/O this domain performs (the 5a1 pre-check this
   * skill's workflow requires before writing the handler): a paid, non-deterministic third-party
   * call has no business running inside a unit test. Defaults to a thin wrapper over
   * `@jini-ai/integrations/media-providers`'s real `createMediaDispatchEngine` — see
   * {@link defaultGenerateMedia} — so production wiring supplies nothing extra; a test overrides
   * this with a fake that returns fixed bytes with no network access at all. `options.providerId`
   * (resolved from the selected `model` — see `agent-tools.ts`'s `IMAGE_MODEL_IDS`) replaces the old
   * hardcoded OpenAI-only provider id; `options.allowStubFallback` threads the caller's explicit
   * opt-in (see `GENERATE_SCHEMA`'s `allowStubFallback` field) into the engine's own stub-fallback
   * gate (`MediaDispatchEngineOptions.allowStubFallback`) — never enabled unless the caller asked.
   */
  generateMedia?: (
    required: {
      request: MediaGenerationRequest;
      credentials: ProviderCredentials;
      options: { providerId: string; allowStubFallback: boolean; httpClient: HttpClientPort; registry: MediaProviderRegistry };
    },
    optional?: { signal?: AbortSignal }
  ) => Promise<MediaGenerationResult>;
  /**
   * The credential-env lookup table {@link resolveCredentialForProvider}'s env fallback reads from.
   * Defaults to the real `process.env` in production — the composition root passes nothing and gets
   * this machine's actual environment, which is the whole point (see this file's own module doc for
   * why that fallback exists). Tests inject a fixed map (`{}` included) so a regression run's
   * pass/fail can never depend on which environment variables happen to be set on the machine that
   * happens to run it.
   */
  env?: NodeJS.ProcessEnv;
}

export const buildMediaGenerationRegistrations = (routeDeps: MediaGenerationToolDeps, { resolvePublicUrls }: { resolvePublicUrls: ResolvePublicUrls }) => {
  const registry = routeDeps.mediaProviderRegistry;
  return build({
  catalogInput: { imageModelIds: registry === undefined ? IMAGE_MODEL_IDS : imageModelIdsFrom({ catalog: registry }), defaultModelId: "gpt-image-2", mediaAssetReadToolId: "content_read.media_asset" },
  deps: {
    get workspaceId() { return routeDeps.workspaceId; },
    get authorize() { return adaptLegacyAuthorize({ authorize: routeDeps.authorize }); },
    get tracker() { return routeDeps.tracker; },
    get imageCodec() { return routeDeps.imageCodec; },
    findModel: required => registry.findModel(required),
    missingCredential: ({ providerId }) => ({ generated: false, message: buildNoCredentialError({ providerId, registry }).message,
      credentialSetup: issueCredentialSetup({ setupToolId: "credential_save", prefill: { kind: "media-provider", target: providerId } }, {}) }),
    storage: {
      upload: ({ input }) => uploadMedia({ deps: { clock: routeDeps.clock, idGen: routeDeps.idGen, mediaRepo: routeDeps.mediaRepo, blobRepo: routeDeps.assetBlobRepo, renditionRepo: routeDeps.assetRenditionRepo, blobStore: routeDeps.blobStore }, input }, UPLOAD_CAPS),
      recordContentType: required => routeDeps.mediaContentTypeStore.set(required),
      resolvePublicUrls: ({ assets }) => resolvePublicUrls({ deps: routeDeps, assets }),
    },
    providers: {
      readSavedSelections: required => getMediaProviderCredentials({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, repo: routeDeps.mediaProviderCredentialRepo }, ...required }),
      readSavedCredential: required => resolveMediaProviderCredential({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, repo: routeDeps.mediaProviderCredentialRepo, sealer: routeDeps.siteAssistantSecretSealer }, ...required }).then(saved => saved ? { apiKey: saved.apiKey, ...(saved.baseUrl ? { baseUrl: saved.baseUrl } : {}) } : null),
      readEnvCredential: ({ providerId }) => (fromEnv => fromEnv.apiKey ? fromEnv : null)(resolveProviderCredentialsFromEnv({ providerId, env: routeDeps.env ?? process.env }, { envVars: MEDIA_PROVIDER_ENV_VARS, aliases: MEDIA_PROVIDER_ALIASES })),
      generateImage: ({ model, prompt, providerId, credentials, allowStubFallback }, optional) => (routeDeps.generateMedia ?? defaultGenerateMedia)({ request: { surface: "image", model, prompt }, credentials, options: { providerId, allowStubFallback, httpClient: routeDeps.mediaGenerationHttpClient, registry } }, optional),
    },
  },
  });
};

export const contributeMediaGenerationTools = ({ resolvePublicUrls }: { resolvePublicUrls: ResolvePublicUrls }, _optional = {}): ToolContributor<MediaGenerationToolDeps, unknown> =>
  ({ domain: "media-generation", build: deps => buildMediaGenerationRegistrations(deps, { resolvePublicUrls }), risk: mediaGenerationDerivedRisk });
