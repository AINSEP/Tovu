import express from "express";
import { randomUUID } from "node:crypto";

import { InMemoryEventBus, InMemoryOutbox, processOutbox } from "../core/events";
import { InMemoryChangeSetRepo } from "../core/commands";
import { InMemoryPostRepo } from "../features/post";
import { InMemoryPresentationSettingsRepo } from "../features/presentation";
import { discoverThemes } from "../features/theme";
import { createWorkspace, InMemoryWorkspaceRepo, WorkspaceConflictError, WorkspaceValidationError } from "../features/workspace";
import path from "node:path";
import { builtInThemesDir } from "./deps";
import { seededPosts, seededPresentation, seededWorkspace } from "./seed";
import { LocalBufferSink } from "../analytics/repo.memory";
import {
  ConsoleMailerAdapter,
  InMemoryMagicLinkTokenRepo,
  InMemoryMemberRepo,
  InMemoryMemberSessionRepo,
  InMemoryMemberSubscriptionRepo,
  InMemoryMemberTierRepo,
} from "../members";
import { InMemoryMenuRepo, InMemoryNavLocationBindingRepo } from "../navigation/repo.memory";
import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "../integrations";
import { createFixedSecretSigner } from "../integrations/signing";
import {
  InMemoryAssetBlobRepo,
  InMemoryAssetRenditionRepo,
  InMemoryBlobStore,
  InMemoryImageTransformer,
  InMemoryMediaRepo,
  InMemoryTransformDefinitionRepo,
} from "../media";
import { createInMemoryIdentityRouteDeps } from "../identity";

import { applyDevCors } from "./middleware/dev-cors";
import { registerAdminStatic } from "./middleware/admin-static";
import { registerAuthRoutes, requireAdminSession } from "./middleware/dev-auth";
import { registerAdminPostListRoute } from "./routes/admin/posts/list";
import { registerAdminPostCreateRoute } from "./routes/admin/posts/create";
import { registerAdminPageListRoute } from "./routes/admin/pages/list";
import { registerAdminPageCreateRoute } from "./routes/admin/pages/create";
import { registerSiteRoutes } from "./routes/site/pages";
import { registerStoreRoutes } from "./routes/site/store";
import { registerAnalyticsIngestRoute } from "./routes/site/analytics-ingest";
import { registerAdminPresentationGetRoute } from "./routes/admin/presentation/get";
import { registerAdminPresentationPatchRoute } from "./routes/admin/presentation/patch-active-theme";
import { registerAdminPostGetRoute } from "./routes/admin/posts/get-by-id";
import { registerAdminPostUpdateRoute } from "./routes/admin/posts/update";
import { registerAdminChangeSetListRoute } from "./routes/admin/change-sets/list";
import { registerAdminChangeSetGetRoute } from "./routes/admin/change-sets/get";
import { registerAdminChangeSetRevertRoute } from "./routes/admin/change-sets/revert";
import { registerContentPostGetRoute } from "./routes/content/posts/get-by-slug";
import { registerHealthRoute } from "./routes/ops/health";
import { registerAdminMemberListRoute } from "./routes/admin/members/list";
import { registerAdminMemberGetRoute } from "./routes/admin/members/get-by-id";
import { registerAdminMemberDisableRoute } from "./routes/admin/members/disable";
import { registerAdminMemberRequestMagicLinkRoute } from "./routes/admin/members/request-magic-link";
import { registerAdminAnalyticsRecentHitsRoute } from "./routes/admin/analytics/recent-hits";
import { registerAdminMenuListRoute } from "./routes/admin/menus/list";
import { registerAdminMenuGetRoute } from "./routes/admin/menus/get-by-id";
import { registerAdminMenuCreateRoute } from "./routes/admin/menus/create";
import { registerAdminMenuUpdateTreeRoute } from "./routes/admin/menus/update-tree";
import { registerAdminMenuAssignLocationRoute } from "./routes/admin/menus/assign-location";
import { registerAdminMenuDeleteRoute } from "./routes/admin/menus/delete";
import { registerAdminIntegrationsListRoute } from "./routes/admin/integrations/list";
import { registerAdminIntegrationsCreateRoute } from "./routes/admin/integrations/create";
import { registerAdminIntegrationsPauseRoute } from "./routes/admin/integrations/pause";
import { registerAdminIntegrationsDeleteRoute } from "./routes/admin/integrations/delete";
import { registerAdminIntegrationsDeliveriesRoute } from "./routes/admin/integrations/deliveries";
import { registerAdminMediaListRoute } from "./routes/admin/media/list";
import { registerAdminMediaUploadRoute } from "./routes/admin/media/upload";
import { registerAdminMediaUpdateRoute } from "./routes/admin/media/update";
import { registerAdminMediaTrashRoute } from "./routes/admin/media/trash";
import { registerAdminMediaDeleteRoute } from "./routes/admin/media/delete";
import { registerMediaRenditionRoute } from "./routes/site/media-rendition";
import { registerAdminUserListRoute } from "./routes/admin/users/list";
import { registerAdminUserCreateRoute } from "./routes/admin/users/create";
import { registerAdminUserAssignRoleRoute } from "./routes/admin/users/assign-role";
import { registerAdminUserAttachPolicyRoute } from "./routes/admin/users/attach-policy";
import { registerAdminRoleListRoute } from "./routes/admin/users/list-roles";
import { registerAdminRoleCreateRoute } from "./routes/admin/users/create-role";
import { registerAdminPolicyListRoute } from "./routes/admin/users/list-policies";
import { registerAdminPolicyCreateRoute } from "./routes/admin/users/create-policy";
import type { RouteDeps } from "./routes/types";

/**
 * @file HTTP composition root and route wiring.
 *
 * Purpose:
 * Assembles concrete adapters and exposes API endpoints.
 *
 * How it relates to the project:
 * - Default composition uses in-memory adapters seeded from `./seed` — this is
 *   what tests exercise (hermetic, no filesystem). The running server injects
 *   the SQLite composition from `./deps` instead (see `index.ts`).
 * - Calls `createWorkspace` slice for command handling.
 * - Triggers `processOutbox` after successful writes to deliver async events.
 *
 * Architectural role:
 * Keeps transport concerns (HTTP, status codes, request parsing) separate from
 * domain logic. Feature code remains reusable outside Express.
 */

/** In-memory route deps seeded from `./seed`. Default for tests/dev. */
export function createRouteDeps(): RouteDeps {
  const workspaceRepo = new InMemoryWorkspaceRepo([seededWorkspace]);
  const postRepo = new InMemoryPostRepo(seededPosts);
  const presentationRepo = new InMemoryPresentationSettingsRepo([seededPresentation]);
  const clock = { nowIso: () => new Date().toISOString() };
  const idGen = { newId: () => randomUUID() };
  const identity = createInMemoryIdentityRouteDeps({ workspaceId: seededWorkspace.id, clock, idGen });

  return {
    workspaceId: seededWorkspace.id,
    workspaceRepo,
    postRepo,
    presentationRepo,
    changeSets: new InMemoryChangeSetRepo(),
    themes: discoverThemes(builtInThemesDir(), "built-in"),
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    clock,
    idGen,
    analyticsSink: new LocalBufferSink(),
    ...identity,
    memberRepo: new InMemoryMemberRepo([]),
    memberTierRepo: new InMemoryMemberTierRepo([]),
    memberSubscriptionRepo: new InMemoryMemberSubscriptionRepo([]),
    memberSessionRepo: new InMemoryMemberSessionRepo([]),
    magicLinkRepo: new InMemoryMagicLinkTokenRepo([]),
    mailer: new ConsoleMailerAdapter(),
    menuRepo: new InMemoryMenuRepo(),
    navLocationBindingRepo: new InMemoryNavLocationBindingRepo(),
    webhookSubscriptionRepo: new InMemoryWebhookSubscriptionRepo(),
    webhookDeliveryRepo: new InMemoryWebhookDeliveryRepo(),
    // DEV-ONLY: no real secret material — createFixedSecretSigner resolves from this empty map,
    // so it has nothing to sign with until either (a) manual testing maps a specific
    // subscription id to a placeholder Buffer secret, or (b) this is replaced by a
    // KeyringPort.derive()-backed signer (ADR-036 §5) once that port's home lands.
    webhookSigner: createFixedSecretSigner(new Map()),
    // `media` (ADR-027 walking skeleton): in-memory rows + in-memory blob bytes here so tests
    // stay hermetic (no filesystem writes) — the real running server (`server/deps.ts`) uses
    // `LocalFsBlobStore` for actual byte durability while keeping rows in-memory too (see that
    // file's comment for why: no SQLite adapter exists yet for this newer library, matching the
    // disclosed precedent the last several admin-section libraries followed).
    mediaRepo: new InMemoryMediaRepo([]),
    assetBlobRepo: new InMemoryAssetBlobRepo([]),
    assetRenditionRepo: new InMemoryAssetRenditionRepo([]),
    blobStore: new InMemoryBlobStore(),
    // ADR-027 §4 transform registry + rendition generation (new in this task): in-memory registry
    // rows (no SQLite adapter yet, same disclosed precedent as the media repos above) and the
    // deterministic `InMemoryImageTransformer` test double here so hermetic tests never depend on
    // `sharp` being installed — see `src/media/image-transformer.sharp.ts`'s file header for the
    // disclosed blocker on the real adapter, which `server/deps.ts` wires instead.
    transformDefinitionRepo: new InMemoryTransformDefinitionRepo([]),
    imageTransformer: new InMemoryImageTransformer(),
  };
}

export function createApp(routeDeps: RouteDeps = createRouteDeps()) {
  const app = express();
  applyDevCors(app);
  // Default 100kb body limit is too small for the media upload route, which accepts
  // base64-encoded bytes in the JSON body (no multipart-parsing dependency in this repo yet —
  // see routes/admin/media/upload.ts's file comment for the disclosed simplification). 15mb
  // covers modest walking-skeleton test/dev uploads; a real implementation should stream
  // multipart/octet-stream instead of inflating bytes through base64 JSON.
  app.use(express.json({ limit: "15mb" }));

  void routeDeps.bus.subscribe("workspace.created", async (event) => {
    // Demonstration side effect. Replace with indexers/webhooks/etc.
    console.log("event handled:", event.name, event.payload);
  });

  registerHealthRoute(app, routeDeps);

  // Session auth: login/logout/me are ungated; everything else under
  // /api/admin requires a session. Real argon2id + principal/session model
  // (ADR-021/SPEC-006) — see middleware/dev-auth.ts.
  registerAuthRoutes(app, routeDeps);
  app.use("/api/admin", requireAdminSession(routeDeps));

  registerAdminPostListRoute(app, routeDeps);
  registerAdminPostCreateRoute(app, routeDeps);
  registerAdminPostGetRoute(app, routeDeps);
  registerAdminPostUpdateRoute(app, routeDeps);
  registerAdminPageListRoute(app, routeDeps);
  registerAdminPageCreateRoute(app, routeDeps);
  registerAdminChangeSetListRoute(app, routeDeps);
  registerAdminChangeSetGetRoute(app, routeDeps);
  registerAdminChangeSetRevertRoute(app, routeDeps);
  registerAdminPresentationGetRoute(app, routeDeps);
  registerAdminPresentationPatchRoute(app, routeDeps);
  registerContentPostGetRoute(app, routeDeps);
  registerAdminMemberListRoute(app, routeDeps);
  registerAdminMemberGetRoute(app, routeDeps);
  registerAdminMemberDisableRoute(app, routeDeps);
  registerAdminMemberRequestMagicLinkRoute(app, routeDeps);
  registerAdminAnalyticsRecentHitsRoute(app, routeDeps);
  registerAdminMenuListRoute(app, routeDeps);
  registerAdminMenuGetRoute(app, routeDeps);
  registerAdminMenuCreateRoute(app, routeDeps);
  registerAdminMenuUpdateTreeRoute(app, routeDeps);
  registerAdminMenuAssignLocationRoute(app, routeDeps);
  registerAdminMenuDeleteRoute(app, routeDeps);
  registerAdminIntegrationsListRoute(app, routeDeps);
  registerAdminIntegrationsCreateRoute(app, routeDeps);
  registerAdminIntegrationsPauseRoute(app, routeDeps);
  registerAdminIntegrationsDeleteRoute(app, routeDeps);
  registerAdminIntegrationsDeliveriesRoute(app, routeDeps);
  registerAdminMediaListRoute(app, routeDeps);
  registerAdminMediaUploadRoute(app, routeDeps);
  registerAdminMediaUpdateRoute(app, routeDeps);
  registerAdminMediaTrashRoute(app, routeDeps);
  registerAdminMediaDeleteRoute(app, routeDeps);
  registerAdminUserListRoute(app, routeDeps);
  registerAdminUserCreateRoute(app, routeDeps);
  registerAdminUserAssignRoleRoute(app, routeDeps);
  registerAdminUserAttachPolicyRoute(app, routeDeps);
  registerAdminRoleListRoute(app, routeDeps);
  registerAdminRoleCreateRoute(app, routeDeps);
  registerAdminPolicyListRoute(app, routeDeps);
  registerAdminPolicyCreateRoute(app, routeDeps);

  // Built admin SPA (apps/admin/dist) at /admin; helpful 503 when unbuilt.
  registerAdminStatic(app, {
    distDir: process.env.TOVU_ADMIN_DIST ?? path.resolve(__dirname, "../../apps/admin/dist"),
  });

  /**
   * Create workspace route.
   *
   * Hybrid execution model:
   * - synchronous command path for validation + persistence
   * - outbox flush to run async side effects reliably
   */
  app.post("/workspaces", async (req, res) => {
    try {
      const { id } = await createWorkspace(
        {
          deps: {
            idGen: routeDeps.idGen,
            clock: routeDeps.clock,
            repo: routeDeps.workspaceRepo,
            outbox: routeDeps.outbox,
          },
          input: {
            name: String(req.body?.name ?? ""),
            slug: String(req.body?.slug ?? ""),
          },
        }
      );

      await processOutbox({ outbox: routeDeps.outbox, bus: routeDeps.bus, clock: routeDeps.clock });

      res.status(201).json({ id });
    } catch (err) {
      if (err instanceof WorkspaceValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }

      if (err instanceof WorkspaceConflictError) {
        res.status(409).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });

  // SPIKE: sample Tier-3 store page — must precede the site `/:slug` catch-all.
  registerStoreRoutes(app, routeDeps);

  // Public analytics beacon (ADR-035 §5) — unauthenticated by design; must precede the site
  // `/:slug` catch-all. DEV-ONLY config stub: always-enabled, no exclusions, honors DNT/GPC.
  // Real config should be backed by ADR-028 settings once that wiring exists.
  registerAnalyticsIngestRoute(app, {
    clock: routeDeps.clock,
    ids: routeDeps.idGen,
    sink: routeDeps.analyticsSink,
    config: {
      get: async ({ workspaceId }) => ({
        workspaceId,
        enabled: true,
        honorDoNotTrack: true,
        honorGlobalPrivacyControl: true,
        rawRetentionDays: 30,
        excludedPaths: [],
        excludedIpRanges: [],
        sink: "local",
      }),
    },
    resolveWorkspaceForHost: async () => routeDeps.workspaceId, // single-workspace v1
    rootKeySeed: process.env.ANALYTICS_ROOT_KEY_SEED ?? "dev-only-insecure-seed",
  });

  // Public, unauthenticated media rendition serving (ADR-027 §4 frozen URL contract) — must
  // precede the site `/:slug` catch-all, same reasoning as the store/analytics routes above.
  registerMediaRenditionRoute(app, routeDeps);

  // Public dummy site — registered last (GET /:slug is a catch-all).
  registerSiteRoutes(app, routeDeps);

  return app;
}

export const app = createApp();
