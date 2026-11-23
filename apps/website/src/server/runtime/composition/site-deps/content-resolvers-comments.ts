import { COMMENT_ENTITY_TYPE } from "#src/features/trash/index";
import { HeuristicSpamCheck } from "@jini-ai/cms/comments";
import { NoopContentTypeIndexProvisioner } from "#src/features/content-types/index";
import { SqliteCommentRepo } from "#src/features/comments/repo.sqlite";
import { SqliteContentTypeRepo } from "#src/features/content-types/repo.sqlite";
import { SqliteFormSubmissionRepo } from "#src/features/forms/repo.sqlite";
import { bindRemoveEntity } from "@jini-ai/cms/trash";
import { buildWidgetHostPorts } from "#src/features/widgets/deps";
import { createCommentTargetLookup } from "#src/features/comments/comment-targets";
import { createCommentsCapability } from "#src/features/comments/provider-selection";
import { createCommentsHostPorts } from "#src/features/comments/index";
import { createCommentsModule } from "@jini-ai/cms/comments";
import { createMenuPageTargetResolver } from "#src/features/navigation/page-target-resolver";
import { createNavMenuReadModel } from "#src/features/navigation/index";
import { removeEntityWithoutBlocker } from "#src/features/trash/index";
import { resolveGalleryWidgetMedia } from "@jini-ai/cms/widgets/html";
import { resolveMenuDoc } from "@jini-ai/cms/navigation";
import { widgetCollectionListPort } from "@jini-ai/cms/entries/site/public-list";
import { wireCoreResolvers } from "@jini-ai/cms/widgets/resolvers";
import type { SiteStore } from "../open-site-store.js";
import type { composeIdentitySettings } from "./identity-settings.js";
import type { SqliteEntryRepo } from "#src/features/entries/repo.sqlite";
import type { SqliteMediaRepo, SqliteTransformDefinitionRepo, SqliteMediaContentTypeStore } from "#src/platform/db/sqlite/media-repo.sqlite";
import type { SqlitePostRepo } from "#src/features/post/index";
import type { SqliteMenuRepo, SqliteNavLocationBindingRepo } from "#src/features/navigation/repo.sqlite";
import type { SqliteFormDefinitionRepo } from "#src/features/forms/repo.sqlite";
import type { createFormCollectionRegistry } from "@jini-ai/cms/forms";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import type { SqliteOutboxAdapter } from "#src/platform/db/sqlite/outbox-repo.sqlite";
import type { SqliteSettingsRepo } from "#src/features/settings/repo.sqlite";
import type { createTrashService } from "@jini-ai/cms/trash";
import type { SqliteTrashRepo, createContentDbTransactionRunner } from "#src/features/trash/index";
import type { startBootData } from "./boot-data.js";
import type { createSqliteIdentityRouteDeps } from "#src/features/identity/wiring";

interface ComposeContentResolversCommentsRequired {
  kernel: SiteStore["content"];
  siteTimeZone: ReturnType<typeof composeIdentitySettings>["siteTimeZone"];
  entryRepo: SqliteEntryRepo;
  mediaRepo: () => SqliteMediaRepo;
  transformDefinitionRepo: SqliteTransformDefinitionRepo;
  mediaContentTypeStore: () => SqliteMediaContentTypeStore;
  postRepo: () => SqlitePostRepo;
  menuRepo: SqliteMenuRepo;
  navLocationBindingRepo: SqliteNavLocationBindingRepo;
  formDefinitionRepo: SqliteFormDefinitionRepo;
  formCollectionProviders: () => () => ReturnType<typeof createFormCollectionRegistry>;
  routeDeps: () => NewsletterRouteDeps & ByokToolSurfaceDeps;
  outbox: SqliteOutboxAdapter;
  clock: { nowMs: () => number; nowIso: () => string };
  idGen: { newId: () => string };
  settingsRepo: SqliteSettingsRepo;
  workspaceId: string;
  trash: ReturnType<typeof createTrashService>;
  trashRepo: SqliteTrashRepo;
  trashTransaction: ReturnType<typeof createContentDbTransactionRunner>;
  commentsReady: ReturnType<typeof startBootData>["commentsReady"];
  commentsSettingsReady: ReturnType<typeof composeIdentitySettings>["commentsSettingsReady"];
  identity: ReturnType<typeof createSqliteIdentityRouteDeps>;
  settingsPrincipals: ReturnType<typeof composeIdentitySettings>["settingsPrincipals"];
}

export function composeContentResolversComments(required: ComposeContentResolversCommentsRequired, _optional = {}) {
  const { kernel, siteTimeZone, entryRepo, mediaRepo, transformDefinitionRepo, mediaContentTypeStore, postRepo, menuRepo, navLocationBindingRepo, formDefinitionRepo, formCollectionProviders, routeDeps, outbox, clock, idGen, settingsRepo, workspaceId, trash, trashRepo, trashTransaction, commentsReady, commentsSettingsReady, identity, settingsPrincipals } = required;
  const formSubmissionRepo = new SqliteFormSubmissionRepo({ store: kernel });
  // Collections plan R1 — hoisted above `wireCoreResolvers` (was constructed later, inline, only for
  // the `ContentTaxonomyDeps` object below). Both `SqliteContentTypeRepo` instances would read the
  // same `content.db` either way (it is a stateless adapter over `db`), but one shared instance
  // keeps this identical to `apps/website/src/server/runtime/composition/app.ts`'s hermetic root, where sharing is load-bearing.
  const contentTypeRepo = new SqliteContentTypeRepo({ store: kernel });
  const contentTypeIndexProvisioner = new NoopContentTypeIndexProvisioner();
  // SPEC-043/ADR-047 (widgets, Fable adversarial-review fix 2026-07-21) — the boot-wiring pass
  // `resolvers/index.ts`'s `wireCoreResolvers` file header always said was needed before the app
  // served traffic, but no composition root ever called it. Without this, `menu`/`recent-entries`/
  // `contact-form` widgets silently rendered as empty placeholders on every real page — only the
  // two static widget types (`text`/`social-links`) ever worked. Real deps only; `menu`'s
  // `NavMenuReadModel` is the one dependency with no prior real adapter anywhere in the codebase
  // (see `navigation/read-model.ts`'s file header).
  wireCoreResolvers({
    siteTimeZone,
    crypto: globalThis.crypto,
    // Defer captures: media MIME metadata is assembled later in this composition root.
    galleryMedia: ({ refs, context }) => resolveGalleryWidgetMedia({ refs, context, deps: {
      host: buildWidgetHostPorts({}), entryRepo, mediaRepo: mediaRepo(), transformRepo: transformDefinitionRepo, mediaContentTypeStore: mediaContentTypeStore(),
    } }),
    menus: { resolveMenuDoc },
    collectionList: widgetCollectionListPort,
    // postRepo is constructed below; defer its capture until an actual widget render.
    resolveMenuTargetHref: (required, optional = {}) => createMenuPageTargetResolver({ postRepo: postRepo() })(required, optional),
    entryList: entryRepo,
    navMenuReadModel: createNavMenuReadModel({ menuRepo, bindingRepo: navLocationBindingRepo }),
    formDefinitionRepo: { findById: formDefinitionRepo.findById.bind(formDefinitionRepo), findBySlug: formDefinitionRepo.findBySlug.bind(formDefinitionRepo) },
    formCollectionProviders: () => formCollectionProviders()(),
    formEmbedConsentOff: () => routeDeps().cookieConsent?.embedConsentOff?.() === true,
    contentTypes: contentTypeRepo,
  });
  const commentsModule = createCommentsModule({
    commentRepo: new SqliteCommentRepo({ store: kernel }, {}),
    // Entries first, then the public blog's legacy posts (`comment-targets.ts`); `postRepo` is
    // read lazily at submit time, after this root has finished constructing it.
    entryLookup: createCommentTargetLookup({ entries: entryRepo, posts: { findById: (required) => postRepo().findById(required) } }),
    outbox,
    clock,
    idGen,
    spamCheck: new HeuristicSpamCheck(),
    ...createCommentsHostPorts({ clock, settingsRepo, workspaceId }, {}),
    // Local admin Trash. A comment's "deleted" marker is one value of its moderation status, so the
    // index has to follow both directions of that transition — see `syncRemovalIndex`.
    remove: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
      trash: trash,
      entityType: COMMENT_ENTITY_TYPE
    }) }),
    forgetRemoved: ({ workspaceId: ws, id }) =>
      trashRepo.deleteByEntity({ workspaceId: ws, entityType: COMMENT_ENTITY_TYPE, entityId: id }),
    runInTransaction: trashTransaction,
  }, {});
  const commentsCapability = createCommentsCapability({
    siteId: workspaceId, module: commentsModule, commentsReady: commentsReady, settingsReady: commentsSettingsReady,
    settings: { settingsRepo, clock, ids: idGen, authorize: identity.authorize, principals: settingsPrincipals },
  });
  return { formSubmissionRepo, contentTypeRepo, contentTypeIndexProvisioner, commentsModule, commentsCapability };
}
