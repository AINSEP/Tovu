import { COMMENT_ENTITY_TYPE } from "#src/features/trash/index";
import { MEDIA_ENTITY_TYPE } from "#src/features/trash/index";
import { PLUGIN_ENTITY_TYPE } from "#src/features/trash/index";
import { POST_ENTITY_TYPE } from "#src/features/trash/index";
import { REDIRECT_ENTITY_TYPE } from "#src/features/trash/index";
import { SqliteUserPurge } from "#src/features/identity/user-purge.sqlite";
import { TRASH_TABLES } from "#src/features/trash/repo.sqlite";
import type { TrashAdapter } from "@jini-ai/cms/trash";
import { USER_ENTITY_TYPE } from "#src/features/trash/index";
import { assertUserAccountAction } from "#src/features/identity/delete-user-service";
import { createCommentTrashAdapter } from "#src/features/trash/index";
import { createDirectoryTrashAdapter } from "#src/features/trash/index";
import { createMediaTrashAdapter } from "#src/features/trash/index";
import { createMemberTrashAdapter } from "#src/features/trash/adapters/member";
import { createPostTrashAdapter } from "#src/features/trash/index";
import { createRedirectTrashAdapter } from "#src/features/trash/index";
import { createTableTrashAdapter } from "@jini-ai/cms/trash/sql";
import { createUserTrashAdapter } from "#src/features/trash/index";
import { forgetPluginActivations } from "@jini-ai/plugins/host";
import { identityServiceDepsFrom } from "#src/server/inbound/admin-http/routes/users/deps";
import { outboxEventValues } from "@jini-ai/db/events";
import { purgeMedia } from "#src/features/media/index";
import { randomUUID } from "node:crypto";
import { withFollowUps } from "@jini-ai/cms/trash";
import type { composePluginRuntime } from "../plugin-runtime.js";
import type { followProviderActivations } from "#src/features/agent-plugins/provider-plugin-link";
import type { SiteStore } from "../open-site-store.js";
import type { SqliteMediaRepo, SqliteAssetBlobRepo, SqliteAssetRenditionRepo } from "#src/platform/db/sqlite/media-repo.sqlite";
import type { SqliteEntryRefsRepo } from "#src/platform/db/sqlite/entry-refs-repo.sqlite";
import type { SqlitePostRepo } from "#src/features/post/index";
import type { createMediaBlobStore } from "#src/features/object-storage/index";
import type { createSqliteIdentityRouteDeps } from "#src/features/identity/wiring";
import type { buildTrashRegistry } from "#src/features/trash/index";
import type { TrashFollowUpHooks } from "@jini-ai/cms/trash";

interface ComposeTrashAdaptersRequired {
  pluginRuntime: ReturnType<typeof composePluginRuntime>;
  pluginActivationRepo: ReturnType<typeof followProviderActivations>;
  kernel: SiteStore["content"];
  mediaRepo: () => SqliteMediaRepo;
  entryRefsRepo: () => SqliteEntryRefsRepo;
  postRepo: () => SqlitePostRepo;
  assetBlobRepo: () => SqliteAssetBlobRepo;
  assetRenditionRepo: SqliteAssetRenditionRepo;
  blobStore: ReturnType<typeof createMediaBlobStore>["blobStore"];
  clock: { nowMs: () => number; nowIso: () => string };
  identity: ReturnType<typeof createSqliteIdentityRouteDeps>;
  idGen: { newId: () => string };
  trashRegistry: ReturnType<typeof buildTrashRegistry>;
  sqliteTrashDb: SiteStore["content"];
  trashFollowUpHooks: Map<string, TrashFollowUpHooks>;
}

function pluginTrashAdapterFor(required: Pick<ComposeTrashAdaptersRequired, "pluginRuntime" | "pluginActivationRepo">, _optional = {}) {
  const { pluginRuntime, pluginActivationRepo } = required;
  return createDirectoryTrashAdapter({
    entityType: PLUGIN_ENTITY_TYPE,
    locate: ({ entityId }) => pluginRuntime.locatePluginPackageDirs(entityId),
    forget: ({ entityId }) => forgetPluginActivations({ pluginId: entityId, deps: { repo: pluginActivationRepo } }),
  });
}

export function composeTrashAdapters(required: ComposeTrashAdaptersRequired, _optional = {}) {
  const { pluginRuntime, pluginActivationRepo, kernel, mediaRepo, entryRefsRepo, postRepo, assetBlobRepo, assetRenditionRepo, blobStore, clock, identity, idGen, trashRegistry, sqliteTrashDb, trashFollowUpHooks } = required;
  const pluginTrashAdapter = pluginTrashAdapterFor({ pluginRuntime, pluginActivationRepo });
  const trashAdapters = new Map<string, TrashAdapter>([
    [POST_ENTITY_TYPE, createPostTrashAdapter(kernel)],
    [REDIRECT_ENTITY_TYPE, createRedirectTrashAdapter(kernel)],
    [COMMENT_ENTITY_TYPE, createCommentTrashAdapter(kernel)],
    [PLUGIN_ENTITY_TYPE, pluginTrashAdapter],
    [
      MEDIA_ENTITY_TYPE,
      createMediaTrashAdapter({
        db: kernel,
        // Media's hard delete is not a row delete: rendition rows hang off it and the blob store
        // holds bytes. `purgeMedia` owns that ladder, so the adapter delegates rather than
        // reimplementing it in SQL and silently orphaning bytes.
        purgeAsset: async ({ workspaceId: ws, entityId }) => {
          await purgeMedia({
            deps: { mediaRepo: mediaRepo(), entryRefsRepo: entryRefsRepo(), postRepo: postRepo(), blobRepo: assetBlobRepo(), renditionRepo: assetRenditionRepo, blobStore, clock },
            input: { workspaceId: ws, id: entityId },
          });
        },
      }),
    ],
    [
      USER_ENTITY_TYPE,
      createUserTrashAdapter({
        eventValues: outboxEventValues,
        db: kernel,
        assertAccountAction: async (required, optional) => {
          const service = identityServiceDepsFrom({ ...identity, clock, idGen });
          await service.repos.transactions.run({ workspaceId: required.workspaceId, execute: async () => {
            await assertUserAccountAction({ ...required, deps: service },
              { ...optional, seededOwnerPrincipalId: await identity.ownerPrincipalId });
          } });
        },
        // A fresh instance, not `identity.userPurge` (removed — see `wiring.ts`'s
        // `IdentityRouteDepsSlice.removeUser` doc): `purge`'s hard-delete is now reached only
        // through this adapter's own `purge()`, never directly from the route layer.
        purge: new SqliteUserPurge({ kernel, eventValues: outboxEventValues }),
        idGen: { next: () => randomUUID() },
        clock,
      }),
    ],
    // One generic adapter per `TRASHABLE` entry — `createTableTrashAdapter` is
    // written once and driven entirely by each entry's own registration, so this line never changes
    // as G2-G4 add more entries.
    ...[...trashRegistry.values()].map((entry) => {
      const tableAdapter = createTableTrashAdapter({ entry, kernel: sqliteTrashDb, tables: TRASH_TABLES });
      const adapter = entry.entityType === "member"
        ? createMemberTrashAdapter({ adapter: tableAdapter, db: sqliteTrashDb })
        : tableAdapter;
      const hooks = trashFollowUpHooks.get(entry.entityType);
      return [entry.entityType, hooks ? withFollowUps({ adapter }, hooks) : adapter] as const;
    }),
  ]);
  return { pluginTrashAdapter, trashAdapters };
}
