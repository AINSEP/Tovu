import { sanitizeShareDatabase } from "../../site-portability.js";
import { createAssistantAgentInventory } from "#src/assistant/agents";
import { createNativeAgentRuntime } from "@jini-ai/agent-runtime";
import { seededWorkspace } from "../../../configuration/seed.js";
import { type TrashKindMover, removeEntityWithoutBlocker, POST_ENTITY_TYPE, COMMENT_ENTITY_TYPE, MEDIA_ENTITY_TYPE, REDIRECT_ENTITY_TYPE, bindWidgetRemoval } from "#src/features/trash/index";
import { bindRemoveEntity, bindForgetRemovedEntity, createTrashSweep } from "@jini-ai/cms/trash";
import { createInMemoryRevocations } from "#src/features/publish-trust/revocations";
import { InMemoryPostSearchIndex } from "#src/features/post/index";
import { getSlugChangeCapture } from "#src/platform/routing/adapter";
import { renderDocBodyAsPageHtml } from "#src/server/inbound/public-http/http/site/render/content-html";
import { InMemoryPagesHtmlDocumentStore } from "#src/features/pages/index";
import { createInMemoryAgentSessionStore, createInMemoryConversationToolApprovalStore, resolvePublicAssistantAvailability } from "../../../../../assistant/index.js";
import { getEffective, set, INSTRUCTIONS_NAMESPACE } from "#src/features/settings/index";
import { preparePreviewSwitcherWrite } from "#src/features/theme/preview-switcher";
import { resolveActiveThemeId } from "#src/features/presentation/index";
import { composeVisitorToolsManagement } from "../../visitor-tools-management.js";
import type { MemoryRootContext, MemoryRouteDeps } from "./context.js";

/** Trash service and registry, the forms mover, and the site-backup sanitizer, plugin exports and agent inventory that open the root. */
export function memoryTrashCoreDeps(required: MemoryRootContext, _optional = {}) {
  const {
    clock,
    formDefinitionRepo,
    formTrashEntry,
    pluginExports,
    sqliteTrashDb,
    trash,
    trashRegistry,
  } = required;
  return {
    siteBackupSanitize: sanitizeShareDatabase,
    pluginExports,
    assistantAgentInventory: createAssistantAgentInventory({ runtime: createNativeAgentRuntime({ env: process.env }) }),
    workspaceId: seededWorkspace.id,
    trash,
    // The rest of this root stays hermetic; only term/taxonomy exercise the shared scratch database.
    registry: trashRegistry,
    db: sqliteTrashDb,
    // `POST /trash/items` (the admin Forms list's delete) reaches these memory-backed forms here:
    // `sqliteTrashDb` has no form row for `moveToTrash`'s snapshot read.
    trashMovers: new Map<string, TrashKindMover>([["form", {
      permission: formTrashEntry.permission,
      move: async ({ workspaceId, entityId, actor }) => {
        const form = await formDefinitionRepo.findById({ workspaceId, id: entityId });
        if (!form) return { ok: false, reason: "not-found" };
        const marker = await trash.trash({ workspaceId, entityType: "form", entityId, actor,
          display: { title: form.name, subtitle: form.slug }, at: clock.nowIso(), expectedVersion: form.version });
        if (marker.ok) return { ok: true, version: marker.version };
        return marker;
      },
    }]]),
  } satisfies Partial<MemoryRouteDeps>;
}

/** Per-entity `remove*` bindings over the root's Trash service. */
export function memoryTrashRemoverDeps(required: MemoryRootContext, _optional = {}) {
  const {
    trash,
  } = required;
  return {
    removePost: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
      trash: trash,
      entityType: POST_ENTITY_TYPE
    }) }),
    removeComment: bindRemoveEntity({
      trash: trash,
      entityType: COMMENT_ENTITY_TYPE
    }),
    removeMedia: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
      trash: trash,
      entityType: MEDIA_ENTITY_TYPE
    }) }),
    removeRedirect: bindRemoveEntity({
      trash: trash,
      entityType: REDIRECT_ENTITY_TYPE
    }),
    removeWidget: removeEntityWithoutBlocker({ remove: bindWidgetRemoval({ trash }) }),
    removeMenu: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
      trash: trash,
      entityType: "menu"
    }) }),
    // Bound the same way as `composition/deps.ts`; the matching adapters share `taxonomyDb`.
    removeTerm: bindRemoveEntity({
      trash: trash,
      entityType: "term"
    }),
  } satisfies Partial<MemoryRouteDeps>;
}

/** The taxonomy remover, the forget-removed bindings, the Trash sweep and the publish-trust revocations. */
export function memoryTrashSweepDeps(required: MemoryRootContext, _optional = {}) {
  const {
    trash,
    trashAdapters,
    trashRepo,
  } = required;
  return {
    removeTaxonomy: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
      trash: trash,
      entityType: "taxonomy"
    }) }),
    forgetRemovedMedia: bindForgetRemovedEntity({
      repo: trashRepo,
      entityType: MEDIA_ENTITY_TYPE
    }),
    forgetRemovedPost: bindForgetRemovedEntity({
      repo: trashRepo,
      entityType: POST_ENTITY_TYPE
    }),
    // Present so this root satisfies `TrashDeps`, and harmless: `createApp` never starts the
    // timer (`createServingApp` does), and the hermetic media/comment adapters have no
    // `hardDelete`, so a pass here would stand down rather than claim a removal.
    sweepTrash: createTrashSweep({
      repo: trashRepo,
      adapters: trashAdapters,
      transaction: ({ work }) => work(),
      entityPolicy: ({ entityType }) => (trashAdapters).has(entityType)
    }),
    isTrashableEntityType: ({ entityType }) => trashAdapters.has(entityType),
    // The hermetic half of the real SQLite deny store. `core.ts` still narrows this to `list`
    // before giving it to the request gate, so tests retain the same least-authority boundary.
    publishTrustRevocations: createInMemoryRevocations(),
  } satisfies Partial<MemoryRouteDeps>;
}

/** Workspace and post repos, search, page store, chat history, agent sessions and the approval options. */
export function memoryPostChatDeps(required: MemoryRootContext, _optional = {}) {
  const {
    clock,
    entryRefsRepo,
    inMemoryChatHistory,
    options,
    outbox,
    pluginExports,
    postRepo,
    workspaceRepo,
  } = required;
  return {
    workspaceRepo,
    postRepo,
    // Mirrors `postRepo` on every query rather than maintaining an index — see
    // `features/post/search-index.memory.ts` for why that is right for this root and wrong for
    // `deps.ts`'s. Constructed eagerly, but its scratch database is not opened until the first
    // search, so the many tests that call `createRouteDeps()` without searching pay nothing.
    postSearch: new InMemoryPostSearchIndex(postRepo),
    // SPEC-009 REQ-15 — `updatePost` looks the capture up per write, so whatever is bound in routing's
    // slot at that moment (`registerSlugChangeCapture` above) decides whether a rename leaves a redirect.
    slugChangeCapture: () => getSlugChangeCapture({}),
    // Backed by `postRepo` above, NOT by a throwaway `:memory:` ContentDb — this root's posts do
    // not live in any SQLite database, so a real-adapter-over-scratch-db would edit rows nothing
    // else in this root can see. See `features/pages/html-document-store.memory.ts`'s header.
    // `entryRefsRepo` (SPEC-047 Slice 3) is the same instance `RouteDeps.entryRefsRepo` below
    // exposes — one shared index, mirroring `apps/website/src/server/runtime/composition/deps.ts`'s identical wiring. No separate
    // `revisions:` field to wire here (S1, fix plan 2026-09-24 row 14) — unlike the sqlite store,
    // this double's `deps.repo` is already the full `postRepo`, so its own `appendRevision` calls
    // use that same instance unconditionally; see `html-document-store.memory.ts`'s header.
    docBodyAsPageHtml: renderDocBodyAsPageHtml,
    pagesHtmlStore: (scope, options: { allowedKinds?: ReadonlySet<import("#src/contracts/core/post-kind").PostKind> } = {}) => new InMemoryPagesHtmlDocumentStore(scope, { ...options, repo: postRepo, clock, entryRefsRepo, outbox, validatePluginEmbeds: pluginExports.validateHtml }),
    // No in-memory *reimplementation* of the chat store: this root gets the real adapter over a
    // throwaway `:memory:` database. `search-index.memory.ts` earns a hand-written double because
    // it mirrors `postRepo` rather than maintaining an index; chat history has no such alternate
    // shape, so a second implementation would only be a second thing to keep in sync — and the
    // one property tests most need to trust here is the isolation predicate, which only the real
    // adapter has. `ensureChatHistoryTables` is the package's own path for a host with no
    // migration system, which is exactly this root's situation.
    chatHistory: inMemoryChatHistory.chatHistory,
    chatRunLedger: inMemoryChatHistory.chatRunLedger,
    // Same "no in-memory reimplementation needed" situation as `chatHistory` above, but this port
    // has no `ai_chats` foreign key or isolation predicate to get right, so a plain map (no `db`
    // at all) is the whole double — see `agent-session-store.ts`'s own doc.
    agentSessions: createInMemoryAgentSessionStore(),
    conversationToolApprovals: createInMemoryConversationToolApprovalStore(),
    ...(options.nativeApprovalMemory ? { nativeApprovalMemory: options.nativeApprovalMemory } : {}),
    ...(options.approvalIdentityForRun ? { approvalIdentityForRun: options.approvalIdentityForRun } : {}),
  } satisfies Partial<MemoryRouteDeps>;
}

/** Presentation and settings repos, the settings write seam, SEO and visitor tools. */
export function memorySettingsSeoDeps(required: MemoryRootContext, _optional = {}) {
  const {
    assistantSettingsReady,
    clock,
    idGen,
    identity,
    presentationRepo,
    seoDeps,
    seoReady,
    settingsPrincipals,
    settingsReady,
    settingsRepo,
    siteAssistantCredentialRepo,
    siteAssistantSecretSealer,
    siteThemes,
    sitemapService,
  } = required;
  return {
    presentationRepo,
    settingsRepo,
    getEffective,
    set: (required, optional) => set(required, {
      ...optional,
      preparePreviewSwitcherWrite: async write => preparePreviewSwitcherWrite({ write, themes: siteThemes, workspaceId: seededWorkspace.id, activeThemeId: await resolveActiveThemeId({ presentationRepo, workspaceId: seededWorkspace.id }) }),
      canEnablePublicAssistant: async ({ workspaceId }) => (await resolvePublicAssistantAvailability({
        repo: siteAssistantCredentialRepo, sealer: siteAssistantSecretSealer, workspaceId,
      })).ready,
    }),
    instructionsNamespace: INSTRUCTIONS_NAMESPACE,
    settingsReady,
    seoReady,
    seoDeps,
    sitemapService,
    assistantSettingsReady,
    visitorToolsManagement: composeVisitorToolsManagement({ workspaceId: seededWorkspace.id, ready: assistantSettingsReady,
      settings: { repo: settingsRepo, clock, ids: idGen, authorize: identity.authorize, principals: settingsPrincipals } }),
  } satisfies Partial<MemoryRouteDeps>;
}
