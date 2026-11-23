/**
 * @file The three public visitor registrations `createApp` performs: comments submit, analytics ingest, forms submit. They are
 * capability constructions, not literals — comments STARTS salt resolution from the env, runtime mode and site-key keyring, and
 * forms builds file storage with a deferred free-space probe — so each runs once per app. Moved verbatim out of `app.ts`.
 */

import { statfs } from "node:fs/promises";
import { createFormMediaCleanup } from '#src/features/forms/form-file-purge';
import { analyticsProviderRouteDeps } from "../analytics-providers.js";
import { DEFAULT_GC_GRACE_MS } from "#src/features/media/index";
import { createCommentsHostPorts } from "#src/features/comments/index";
import { resolveCommentsIpHashSalt } from "@jini-ai/cms/comments/site/ip-hash-salt";
import { registerCommentsSubmitRoute } from "../../../inbound/public-http/routes/site/comments-submit.js";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { registerAnalyticsIngestRoute } from "../../../inbound/public-http/routes/site/analytics-ingest.js";
import { createFormFileStorage } from "../../../../features/forms/form-file-storage.js";
import { registerFormsSubmitRoute } from "../../../inbound/public-http/routes/site/forms-submit.js";
import type { MountInput } from "./module-handles.js";

/** Public comment submission: the salt resolution STARTS here (once per app), from the root's env and site-key keyring. */
export function registerCommentsSubmit({ app, routeDeps }: MountInput, _optional = {}): void {
  // Public comment submission (ADR-031 §4) — unauthenticated by design; must precede the site
  // `/:slug` catch-all, same reasoning as the store/analytics routes above.
  registerCommentsSubmitRoute({ app, deps: {
    visitorAnalyticsProof: routeDeps.visitorAnalyticsProof,
    visitorAnalyticsDeliveryAllowed: routeDeps.visitorAnalyticsDeliveryAllowed,
    visitorTracker: routeDeps.visitorTracker,
    tracker: routeDeps.tracker,
    idGen: routeDeps.idGen,
    ingressPolicy: routeDeps.commentIngressPolicy,
    providers: routeDeps.commentsProviders,
    workspaceId: routeDeps.workspaceId,
    // HTTP requests and accepted submissions consume separate budgets, never the same counter twice.
    rateLimiter: createCommentsHostPorts({ clock: routeDeps.clock, settingsRepo: routeDeps.settingsRepo, workspaceId: routeDeps.workspaceId }, {}).rateLimiter,
    // Resolved here, once, from the root's env and its site-key keyring — the route never reads env.
    // No public-constant fallback in production: see `features/comments/ip-hash-salt.ts`.
    ipHashSalt: resolveCommentsIpHashSalt({
      env: process.env, mode: resolveRuntimeMode(), workspaceId: routeDeps.workspaceId, keyring: routeDeps.siteAssistantSecretKeyring,
      // The salt resolver never logs: this host keeps its production fail-safe warning on the server console.
      warn: (line) => console.warn(line),
    }).then(({ salt }) => salt),
  } });
}

/** Public analytics beacon (ADR-035 §5). */
export function registerAnalyticsIngest({ app, routeDeps }: MountInput, _optional = {}): void {
  // Public analytics beacon (ADR-035 §5) — unauthenticated by design; must precede the site
  // `/:slug` catch-all. `config` is now the real ADR-028-backed adapter
  // (`analytics/config.settings.ts`'s `createSettingsAnalyticsConfig`), replacing the former
  // hardcoded dev-only stub.
  registerAnalyticsIngestRoute({ app, deps: {
    browserAnalytics: routeDeps.browserAnalytics,
    visitorAnalyticsProof: routeDeps.visitorAnalyticsProof,
    visitorAnalyticsDeliveryAllowed: routeDeps.visitorAnalyticsDeliveryAllowed,
    visitorTracker: routeDeps.visitorTracker,
    tracker: routeDeps.tracker,
    idGen: routeDeps.idGen,
    clock: routeDeps.clock,
    ids: routeDeps.idGen,
    sink: routeDeps.analyticsSink,
    config: routeDeps.analyticsConfig,
    resolveWorkspaceForHost: async () => routeDeps.workspaceId, // single-workspace v1
    analyticsSeed: process.env.ANALYTICS_ROOT_KEY_SEED ?? "dev-only-insecure-seed",
    ...analyticsProviderRouteDeps(routeDeps),
  } });
}

/** Public form submission, with its file storage and free-space probe built here, once per app. */
export function registerFormsSubmit({ app, routeDeps }: MountInput, _optional = {}): void {
  // ADR-046 Phase 3 (SPEC-034): the public media rendition route now registers earlier, as part of
  // `createMediaModule(routeDeps).registerRoutes(app)` above — it's still safely before the site
  // `/:slug` catch-all below, which is the only ordering constraint that ever applied to it.

  // Public, unauthenticated form submission endpoint (SPEC-010 REQ-05, FORMS_POST_SUBMIT) — must
  // precede the site `/:slug` catch-all, same reasoning as the routes immediately above.
  registerFormsSubmitRoute({ app, deps: {
    visitorAnalyticsProof: routeDeps.visitorAnalyticsProof,
    visitorAnalyticsDeliveryAllowed: routeDeps.visitorAnalyticsDeliveryAllowed,
    visitorTracker: routeDeps.visitorTracker,
    formSubmissionAttempts: routeDeps.formSubmissionAttempts,
    tracker: routeDeps.tracker,
    idGen: routeDeps.idGen,
    workspaceId: routeDeps.workspaceId,
    submitForm: {
      definitionRepo: routeDeps.formDefinitionRepo,
      submissionRepo: routeDeps.formSubmissionRepo,
      outbox: routeDeps.outbox,
      bus: routeDeps.bus,
      clock: routeDeps.clock,
      idGen: routeDeps.idGen,
      crypto: globalThis.crypto,
      rateLimiter: routeDeps.formsRateLimiter,
      readUploadFreeBytes: async () => {
        if (await routeDeps.siteBackupSources?.isMediaRemote?.()) return undefined;
        const stats = await statfs(routeDeps.siteStoragePaths.mediaUploadsDir);
        return stats.bavail * stats.bsize;
      },
      uploadSpaceMessage: "This site has no room for another attachment. Your answers are kept below. Your form has not been sent.",
      files: createFormFileStorage({ media: {
        clock: routeDeps.clock, idGen: routeDeps.idGen, mediaRepo: routeDeps.mediaRepo,
        entryRefsRepo: routeDeps.entryRefsRepo, postRepo: routeDeps.postRepo,
        blobRepo: routeDeps.assetBlobRepo, renditionRepo: routeDeps.assetRenditionRepo, blobStore: routeDeps.blobStore,
        ...createFormMediaCleanup({ kernel: routeDeps.contentKernel, outbox: routeDeps.outbox, clock: routeDeps.clock, graceMs: DEFAULT_GC_GRACE_MS }),
      }, contentTypes: routeDeps.mediaContentTypeStore,
        resolveCreatedByPrincipal: async ({ workspaceId }) => {
          // Uploads have no signed-in operator. Await identity's existing seed and attribute the
          // write to its active System principal, rather than minting a dangling anonymous id.
          await routeDeps.identityReady;
          const principal = (await routeDeps.principalRepo.list({ workspaceId })).find(row => row.kind === "system" && row.status === "active" && row.displayName === "System");
          if (!principal) throw new Error("form uploads require the site's System principal");
          return principal.id;
        },
      }, {}),
    },
  } });
}
