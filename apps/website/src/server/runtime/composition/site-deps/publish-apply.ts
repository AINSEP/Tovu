import type { composePublishingStoresThemes } from "./publishing-stores-themes.js";
import type { composeDatabaseJournal } from "./database-journal.js";
import type { composeStoreBasics } from "./store-basics.js";
import type { composeEventsOrigin } from "./events-origin.js";
import type { composeContentStores } from "./content-stores.js";
import type { composeIdentitySettings } from "./identity-settings.js";
import type { composeTrashStores } from "./trash-stores.js";
import type { composeTrashService } from "./trash-service.js";
import type { composeMediaStorage } from "./media-storage.js";
import type { composeRedirects } from "./redirects.js";
import type { startBootData } from "./boot-data.js";
import type { composeContentRepos } from "./content-repos.js";
import type { composeContentResolversComments } from "./content-resolvers-comments.js";
import type { composeAgentPluginBootstrap } from "./agent-plugin-bootstrap.js";
import { POST_ENTITY_TYPE } from "#src/features/trash/index";
import { bindForgetRemovedEntity } from "@jini-ai/cms/trash";
import { bindRemoveEntity } from "@jini-ai/cms/trash";
import { buildContentPublishPorts } from "#src/server/runtime/composition/content-publish-ports";
import { createPublishContentApplyPort } from "#src/features/publish-content/apply-port";
import { removeEntityWithoutBlocker } from "#src/features/trash/index";
import { rescanThemes } from "#src/features/theme/index";
import { toPublishContentApplyDeps } from "#src/features/publish-content/apply-port";

interface ComposePublishContentApplyPortRequired {
  workspaceId: string;
  publishContentBundleRepo: ReturnType<typeof composePublishingStoresThemes>["publishContentBundleRepo"];
  publishContentBaselineRepo: ReturnType<typeof composePublishingStoresThemes>["publishContentBaselineRepo"];
  publishContentRunRepo: ReturnType<typeof composeDatabaseJournal>["publishContentRunRepo"];
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  idGen: ReturnType<typeof composeStoreBasics>["idGen"];
  outbox: ReturnType<typeof composeEventsOrigin>["outbox"];
  changeSets: ReturnType<typeof composeContentStores>["changeSets"];
  identity: ReturnType<typeof composeIdentitySettings>["identity"];
  postRepo: ReturnType<typeof composeContentStores>["postRepo"];
  trashRepo: ReturnType<typeof composeTrashStores>["trashRepo"];
  trash: ReturnType<typeof composeTrashService>["trash"];
  mediaRepo: ReturnType<typeof composeContentStores>["mediaRepo"];
  assetBlobRepo: ReturnType<typeof composeContentStores>["assetBlobRepo"];
  blobStore: ReturnType<typeof composeMediaStorage>["blobStore"];
  mediaContentTypeStore: ReturnType<typeof composePublishingStoresThemes>["mediaContentTypeStore"];
  redirectsWriteDeps: ReturnType<typeof composeRedirects>["redirectsWriteDeps"];
  menuRepo: ReturnType<typeof startBootData>["menuRepo"];
  navLocationBindingRepo: ReturnType<typeof startBootData>["navLocationBindingRepo"];
  formDefinitionRepo: ReturnType<typeof composeContentRepos>["formDefinitionRepo"];
  contentTypeRepo: ReturnType<typeof composeContentResolversComments>["contentTypeRepo"];
  contentTypeIndexProvisioner: ReturnType<typeof composeContentResolversComments>["contentTypeIndexProvisioner"];
  taxonomyRepo: ReturnType<typeof composeContentRepos>["taxonomyRepo"];
  termRepo: ReturnType<typeof composeContentRepos>["termRepo"];
  sqliteEntryTermRepo: ReturnType<typeof composeContentRepos>["sqliteEntryTermRepo"];
  taxonomyRevisionRepo: ReturnType<typeof composeContentRepos>["taxonomyRevisionRepo"];
  stampWatermark: ReturnType<typeof composeContentRepos>["stampWatermark"];
  entryRepo: ReturnType<typeof composeContentRepos>["entryRepo"];
  entryRefsRepo: ReturnType<typeof composeContentRepos>["entryRefsRepo"];
  widgetBindingRepo: ReturnType<typeof composeContentRepos>["widgetBindingRepo"];
  settingsRepo: ReturnType<typeof composeIdentitySettings>["settingsRepo"];
  settingsPrincipals: ReturnType<typeof composeIdentitySettings>["settingsPrincipals"];
  presentationRepo: ReturnType<typeof composeIdentitySettings>["presentationRepo"];
  siteThemes: ReturnType<typeof composePublishingStoresThemes>["siteThemes"];
  resolvedThemesDir: ReturnType<typeof composeAgentPluginBootstrap>["resolvedThemesDir"];
  publishContentSeedHash: ReturnType<typeof composePublishingStoresThemes>["publishContentSeedHash"];
}

export function composePublishContentApplyPort(required: ComposePublishContentApplyPortRequired, _optional = {}) {
  const { workspaceId, publishContentBundleRepo, publishContentBaselineRepo, publishContentRunRepo, clock, idGen, outbox, changeSets, identity, postRepo, trashRepo, trash, mediaRepo, assetBlobRepo, blobStore, mediaContentTypeStore, redirectsWriteDeps, menuRepo, navLocationBindingRepo, formDefinitionRepo, contentTypeRepo, contentTypeIndexProvisioner, taxonomyRepo, termRepo, sqliteEntryTermRepo, taxonomyRevisionRepo, stampWatermark, entryRepo, entryRefsRepo, widgetBindingRepo, settingsRepo, settingsPrincipals, presentationRepo, siteThemes, resolvedThemesDir, publishContentSeedHash } = required;
  const publishContentApplyPort = createPublishContentApplyPort({
    workspaceId,
    bundleRepo: publishContentBundleRepo,
    baselineRepo: publishContentBaselineRepo,
    runRepo: publishContentRunRepo,
    publishContentDeps: publishContentApplyDeps({ workspaceId, clock, idGen, outbox, changeSets, identity, postRepo, trashRepo, trash, mediaRepo, assetBlobRepo, blobStore, mediaContentTypeStore, redirectsWriteDeps, menuRepo, navLocationBindingRepo, formDefinitionRepo, contentTypeRepo, contentTypeIndexProvisioner, taxonomyRepo, termRepo, sqliteEntryTermRepo, taxonomyRevisionRepo, stampWatermark, entryRepo, entryRefsRepo, widgetBindingRepo, settingsRepo, settingsPrincipals, presentationRepo, siteThemes, resolvedThemesDir }),
    clock,
    idGen,
    getSeedHash: publishContentSeedHash,
  });
  return { publishContentApplyPort };
}

function publishContentApplyDeps(required: Pick<ComposePublishContentApplyPortRequired, "workspaceId" | "clock" | "idGen" | "outbox" | "changeSets" | "identity" | "postRepo" | "trashRepo" | "trash" | "mediaRepo" | "assetBlobRepo" | "blobStore" | "mediaContentTypeStore" | "redirectsWriteDeps" | "menuRepo" | "navLocationBindingRepo" | "formDefinitionRepo" | "contentTypeRepo" | "contentTypeIndexProvisioner" | "taxonomyRepo" | "termRepo" | "sqliteEntryTermRepo" | "taxonomyRevisionRepo" | "stampWatermark" | "entryRepo" | "entryRefsRepo" | "widgetBindingRepo" | "settingsRepo" | "settingsPrincipals" | "presentationRepo" | "siteThemes" | "resolvedThemesDir">, _optional = {}) {
  const { workspaceId, clock, idGen, outbox, changeSets, identity, postRepo, trashRepo, trash, mediaRepo, assetBlobRepo, blobStore, mediaContentTypeStore, redirectsWriteDeps, menuRepo, navLocationBindingRepo, formDefinitionRepo, contentTypeRepo, contentTypeIndexProvisioner, taxonomyRepo, termRepo, sqliteEntryTermRepo, taxonomyRevisionRepo, stampWatermark, entryRepo, entryRefsRepo, widgetBindingRepo, settingsRepo, settingsPrincipals, presentationRepo, siteThemes, resolvedThemesDir } = required;
  return toPublishContentApplyDeps({
    workspaceId,
    clock,
    idGen,
    outbox,
    changeSets,
    authorize: identity.authorize,
    // F2 — one ports bag keyed by entityType (`type-registry.ts`'s `PublishContentPorts`).
    ports: {
      post: postPublishPorts({ postRepo, trashRepo, trash }),
      media: { repo: mediaRepo, assetBlobRepo, blobStore, contentTypeStore: mediaContentTypeStore },
      redirect: redirectsWriteDeps,
      menu: { repo: menuRepo, bindingRepo: navLocationBindingRepo },
      ...buildContentPublishPorts({
        workspaceId,
        postRepo,
        formDefinitionRepo,
        contentTypeRepo,
        contentTypeIndexProvisioner,
        taxonomyRepo,
        termRepo,
        entryTermRepo: sqliteEntryTermRepo,
        taxonomyRevisionRepo,
        stampWatermark,
        entryRepo,
        entryRefsRepo,
        widgetBindingRepo,
        settingsRepo,
        principalRepo: settingsPrincipals,
        presentationRepo,
        themes: siteThemes,
      }),
      "theme-files": {
        // S19 (S-F4) — the theme-files handler's `apply()` stages/writes under this site's own
        // themes root, the SAME value `routeDeps.themesDir` (below) resolves to. See
        // `routes/types.ts`'s `themesDir` doc.
        themesDir: resolvedThemesDir,
        onReplaced: () => {
          rescanThemes({ themes: siteThemes, dir: resolvedThemesDir });
        },
      },
    },
  });
}

function postPublishPorts({ postRepo, trashRepo, trash }: Pick<ComposePublishContentApplyPortRequired, "postRepo" | "trashRepo" | "trash">) {
  return {
        repo: postRepo,
        forgetRemoved: bindForgetRemovedEntity({
          repo: trashRepo,
          entityType: POST_ENTITY_TYPE
        }),
        // S4 (publish-overwrite-live-plan-2026-09-24) — same binding `routeDeps.removePost` below
        // uses; the post handler's `retire()` needs it to wrap `retirePostForReplacement`.
        remove: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
          trash: trash,
          entityType: POST_ENTITY_TYPE
        }) }),
      };
}
