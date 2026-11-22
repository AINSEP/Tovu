import type { composeAgentPluginBootstrap } from "./agent-plugin-bootstrap.js";
import type { SiteStore } from "../open-site-store.js";
import type { composeStoreBasics } from "./store-basics.js";
import type { composeTrashStores } from "./trash-stores.js";
import type { composeTrashAdapters } from "./trash-adapters.js";
import type { composeTrashService } from "./trash-service.js";
import type { composeContentStores } from "./content-stores.js";
import type { composePreAssembly } from "./pre-assembly.js";
import type { composeEventsOrigin } from "./events-origin.js";
import type { composeContentRepos } from "./content-repos.js";
import type { providerPluginBoot } from "./provider-identity.js";
import { COMMENT_ENTITY_TYPE } from "#src/features/trash/index";
import { MEDIA_ENTITY_TYPE } from "#src/features/trash/index";
import { POST_ENTITY_TYPE } from "#src/features/trash/index";
import { PagesHtmlDocumentStore } from "#src/features/pages/index";
import { REDIRECT_ENTITY_TYPE } from "#src/features/trash/index";
import { SqliteWorkspaceRepo } from "#src/features/workspace/index";
import { bindForgetRemovedEntity } from "@jini-ai/cms/trash";
import { bindRemoveEntity } from "@jini-ai/cms/trash";
import { bindWidgetRemoval } from "#src/features/trash/index";
import { createChatRunLedger } from "#src/assistant/index";
import { createChatStoreFactory } from "#src/assistant/index";
import { createPeerSiteReads } from "../peer-site-reads.js";
import { createSqliteAgentSessionStore } from "#src/assistant/index";
import { createSqliteConversationToolApprovalStore } from "#src/assistant/persistence/conversation-tool-approval-store";
import { createTrashSweep } from "@jini-ai/cms/trash";
import { getSlugChangeCapture } from "#src/platform/routing/adapter";
import { postSearchIndexFor } from "#src/features/post/index";
import { removeEntityWithoutBlocker } from "#src/features/trash/index";
import { renderDocBodyAsPageHtml } from "#src/server/inbound/public-http/http/site/render/content-html";
import { sanitizeShareDatabase } from "#src/server/runtime/composition/site-portability";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";

interface RouteDepsContentTrashRequired {
  assistantAgentInventory: ReturnType<typeof composeAgentPluginBootstrap>["assistantAgentInventory"];
  resolvedSiteBinding: ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"];
  kernel: SiteStore["content"];
  workspaceId: string;
  postSearchBackfillReady: ReturnType<typeof composeStoreBasics>["postSearchBackfillReady"];
  trashRegistry: ReturnType<typeof composeTrashStores>["trashRegistry"];
  sqliteTrashDb: ReturnType<typeof composeTrashStores>["sqliteTrashDb"];
  trashRepo: ReturnType<typeof composeTrashStores>["trashRepo"];
  trashAdapters: ReturnType<typeof composeTrashAdapters>["trashAdapters"];
  trashTransaction: ReturnType<typeof composeTrashService>["trashTransaction"];
  trash: ReturnType<typeof composeTrashService>["trash"];
  postRepo: ReturnType<typeof composeContentStores>["postRepo"];
  pluginExports: ReturnType<typeof composePreAssembly>["pluginExports"];
}

interface RouteDepsChatAgentsRequired {
  kernel: SiteStore["content"];
  chat: SiteStore["chat"];
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  outbox: ReturnType<typeof composeEventsOrigin>["outbox"];
  entryRefsRepo: ReturnType<typeof composeContentRepos>["entryRefsRepo"];
  tracker: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>["tracker"];
  postRepo: ReturnType<typeof composeContentStores>["postRepo"];
  pluginExports: ReturnType<typeof composePreAssembly>["pluginExports"];
}

export function routeDepsContentTrash(required: RouteDepsContentTrashRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "siteBackupSanitize" | "pluginExports" | "assistantAgentInventory" | "workspaceId" | "peerSiteReads" | "workspaceRepo" | "trash" | "removePost" | "removeComment" | "removeMedia" | "removeRedirect" | "removeWidget" | "forgetRemovedMedia" | "forgetRemovedPost" | "sweepTrash" | "isTrashableEntityType" | "registry" | "db" | "postRepo" | "postGoLiveCandidates" | "postSearch"> {
  const { assistantAgentInventory, resolvedSiteBinding, kernel, workspaceId, postSearchBackfillReady, trashRegistry, sqliteTrashDb, trashRepo, trashAdapters, trashTransaction, trash, postRepo, pluginExports } = required;
  return {
    siteBackupSanitize: sanitizeShareDatabase,
    pluginExports,
    assistantAgentInventory,
    workspaceId: workspaceId,
    peerSiteReads: createPeerSiteReads({ currentSiteDir: resolvedSiteBinding.dir }, {}),
    workspaceRepo: new SqliteWorkspaceRepo({ store: kernel }),
    trash,
    // Pre-bound per domain. A delete path receives exactly one of these and therefore cannot reach
    // another domain's entities by passing the wrong string.
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
    forgetRemovedMedia: bindForgetRemovedEntity({
      repo: trashRepo,
      entityType: MEDIA_ENTITY_TYPE
    }),
    forgetRemovedPost: bindForgetRemovedEntity({
      repo: trashRepo,
      entityType: POST_ENTITY_TYPE
    }),
    // The 60-day backstop's one pass. `createServingApp` owns the timer that calls it, so it runs
    // only in a site-serving process — never in the exporter or the agent daemon.
    sweepTrash: createTrashSweep({
      repo: trashRepo,
      adapters: trashAdapters,
      transaction: ({ work }) => trashTransaction(work),
      entityPolicy: ({ entityType }) => (trashAdapters).has(entityType)
    }),
    // Read on every call; see `TrashDeps.isTrashableEntityType`.
    isTrashableEntityType: ({ entityType }) => trashAdapters.has(entityType),
    // `TrashDeps.registry`/`db` — read by `moveToTrash` (`POST .../trash/items`) and by
    // `permissions.ts`'s registry-based permission lookup, both via this same `routeDeps` object.
    registry: trashRegistry,
    db: sqliteTrashDb,
    postRepo,
    postGoLiveCandidates: postRepo,
    postSearch: postSearchIndexFor(kernel, { ready: postSearchBackfillReady }),
  };
}

export function routeDepsChatAgents(required: RouteDepsChatAgentsRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "slugChangeCapture" | "docBodyAsPageHtml" | "pagesHtmlStore" | "chatHistory" | "chatRunLedger" | "agentSessions" | "conversationToolApprovals"> {
  const { kernel, chat, clock, outbox, entryRefsRepo, tracker, postRepo, pluginExports } = required;
  return {
    // SPEC-009 REQ-15 — `updatePost` looks the capture up per write, so whatever is bound in routing's
    // slot at that moment (`registerSlugChangeCapture` above) decides whether a rename leaves a redirect.
    slugChangeCapture: () => getSlugChangeCapture({}),
    // SPEC-047/ADR-056 — the db handle and clock are closed over here so no route ever holds one;
    // a route supplies only the `(workspaceId, postId)` scope. See `RouteDeps.pagesHtmlStore`.
    // `entryRefsRepo` (SPEC-047 Slice 3) is the same instance `RouteDeps.entryRefsRepo` below
    // exposes — one shared index, not a second writer. `revisions: postRepo` (S1, fix plan
    // 2026-09-24 row 14) is the SAME `postRepo` constructed above — one `post_revisions` ledger,
    // not a second writer of that either.
    // `outbox`: a published HTML page edit enqueues `entry.updated`, so site search reindexes it.
    docBodyAsPageHtml: renderDocBodyAsPageHtml,
    pagesHtmlStore: (scope, options: { allowedKinds?: ReadonlySet<import("#src/contracts/core/post-kind").PostKind> } = {}) => new PagesHtmlDocumentStore(scope, { ...options, db: kernel, clock, entryRefsRepo, revisions: postRepo, outbox, validatePluginEmbeds: pluginExports.validateHtml }),
    // `chat` is the store's chat kernel (on SQLite, the sidecar `chat.db`, NOT `content.db` —
    // ADS-memory/reports/2026-09-05-db-split-scoping.md §6). None of these stores opens a database
    // itself.
    chatHistory: createChatStoreFactory({ store: chat }),
    chatRunLedger: createChatRunLedger({ store: chat }, { tracker }),
    // Migration `0051`'s table, over the same sidecar handle immediately above — see
    // `RouteDeps.agentSessions`'s own doc for why this is not principal-scoped like `chatHistory`.
    agentSessions: createSqliteAgentSessionStore({ store: chat, clock }),
    // G3 "Allow for this chat": with the conversation, over the same sidecar handle.
    conversationToolApprovals: createSqliteConversationToolApprovalStore({ store: chat }),
  };
}
