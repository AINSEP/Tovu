/**
 * @file Comments' half of ADR-049 Decision 4 (ADR-031/SPEC-033/SPEC-035): maps `agent-tools.ts`'s
 * seven catalog entries onto the moderation queue, the four moderation transitions, and the two
 * settings operations, as `ToolRegistration`s. The entire catalog is wired.
 *
 * Authorization shape, and why it differs from Forms/Identity/content-types: `comments/
 * write-service.ts`'s own file header records that "Routes call authorize() first ... then this
 * service, never the repo directly" — the domain functions carry no `authorize()` call to inherit.
 * Six of the seven handlers here therefore perform that check themselves, via the kit's
 * `requireToolPermission`, mirroring each route's exact sequence. That is still ADR-021 §2's "one
 * evaluator": for those six, the single evaluation happens at the handler because that is where the
 * real admin route performs it. The seventh, `comments_update_settings`, is the exception and is
 * documented at its own handler.
 */
import {
  type AuthorizeFn,
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireNumber,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import { buildConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";
import type { SettingsRepoPort } from "../settings/index.js";
import type { PrincipalRepoPort } from "@jini-ai/cms/identity";
import type { ToolContributor } from "#src/assistant/index";
import {
  createSurfaceExchangeStore,
  resolveConfirmationDecision,
  SURFACE_EXCHANGE_ID_PARAM,
  type AssistantSurfaceDeps,
  type SurfaceExchange,
} from "../../contracts/core/tool-surface-exchanges.js";
import { commentsAgentToolCatalog } from "./agent-tools.js";
import type { CommentRepoPort } from "./ports.js";
import { getCommentsSettings, setCommentsSettings } from "./settings.js";
import type {
  CommentsSettings,
  CommentStatus,
  ModerationAction,
  ModerationQueuePage,
} from "./types.js";
import type { CommentWriteService } from "./write-service.js";

const CATALOG_BY_ID = indexCatalogById(commentsAgentToolCatalog);

/**
 * The exact slice of the route-deps bag Comments' tool handlers read. Declared structurally
 * (rather than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge
 * into the composition root. `server/routes/*` satisfies this structurally by passing its existing
 * `RouteDeps` object; nothing there changes.
 */
export interface CommentsToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  commentsReady: Promise<void>;
  commentsSettingsReady: Promise<void>;
  commentRepo: CommentRepoPort;
  commentWriteService: CommentWriteService;
  settingsRepo: SettingsRepoPort;
  principalRepo: PrincipalRepoPort;
}

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const commentsDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> commentRepo.listModerationQueue: read only.
  ["comments_list_moderation_queue", "none"],
  // -> getCommentsSettings (settings.ts): settingsRepo read only.
  ["comments_get_settings", "none"],
  // -> setCommentsSettings (settings.ts): N ledger set() calls, one per changed field.
  ["comments_update_settings", "mutates-durable-state"],
  // -> commentWriteService.applyModeration: status flip + moderation_log append + outbox/hooks.
  ["comments_approve_comment", "mutates-durable-state"],
  ["comments_mark_comment_spam", "mutates-durable-state"],
  ["comments_trash_comment", "mutates-durable-state"],
  ["comments_restore_comment", "mutates-durable-state"],
]);

/** What a comment looks like to the model — trims `CommentRecord` to what a moderation decision actually needs. */
function toCommentModerationView(record: {
  id: string;
  entryId: string;
  parentId: string | null;
  status: CommentStatus;
  authorName: string;
  authorEmail: string | null;
  bodyText: string;
  spamScore: number | null;
  createdAt: string;
  version: number;
}) {
  return {
    id: record.id,
    entryId: record.entryId,
    parentId: record.parentId,
    status: record.status,
    authorName: record.authorName,
    authorEmail: record.authorEmail,
    bodyText: record.bodyText,
    spamScore: record.spamScore,
    createdAt: record.createdAt,
    version: record.version,
  };
}

/** Projects a `ModerationQueuePage` into the model-facing shape — `workspaceId`/internal fields (threadRootId, depth, authorIpHash, spamProvider, updatedAt) dropped, same discipline as content-types' `toContentTypeView`. */
function toModerationQueueToolView(page: ModerationQueuePage): { items: ReturnType<typeof toCommentModerationView>[]; nextCursor: string | null } {
  return { items: page.items.map(toCommentModerationView), nextCursor: page.nextCursor };
}

/**
 * Builds one moderation-action tool handler — shared by approve/mark_spam/trash/restore, which
 * differ only in the permission gated on and the `action`/`toStatus` pair passed to
 * `commentWriteService.applyModeration`. Factored out rather than four near-duplicate handlers.
 *
 * `applyModeration`'s success half is `{ok:true}` with no updated record (a real interface
 * limitation, not a shortcut this file takes — `CommentWriteService`'s declared return type
 * carries nothing else back), so the acknowledgement echoes what the model already told it
 * (commentId, the resulting status) — the same "echo the id back" convention
 * `identity_role_delete` uses for a void-resolving domain call.
 *
 * @complexity O(1) beyond the wrapped `applyModeration` call.
 * @overallScore 100
 */
function buildCommentsModerationHandler(
  routeDeps: CommentsToolDeps,
  spec: { permission: string; action: ModerationAction; toStatus: CommentStatus },
): ToolHandler {
  return async (ctx) => {
    const input = requireInputRecord(ctx.input);
    const commentId = requireString(input, "commentId");

    await requireToolPermission(routeDeps, {
      principalId: ctx.principal.id,
      permission: spec.permission,
      entityType: "comment",
      entityId: commentId,
    });

    await routeDeps.commentsReady;
    const result = await routeDeps.commentWriteService.applyModeration({
      workspaceId: routeDeps.workspaceId,
      id: commentId,
      expectedVersion: requireNumber(input, "expectedVersion"),
      action: spec.action,
      toStatus: spec.toStatus,
      actorPrincipalId: ctx.principal.id,
      note: typeof input.note === "string" ? input.note : null,
    });
    if (!result.ok) {
      throw result.reason === "conflict"
        ? new Error(`comment was modified concurrently (current version is ${result.currentVersion}) — re-read with comments_list_moderation_queue and retry with the fresh version`)
        : new Error(`comment '${commentId}' was not found`);
    }

    return { moderated: { commentId, toStatus: spec.toStatus } };
  };
}

const COMMENTS_TRASH_TOOL_ID = "comments_trash_comment";

/** The `ui://` URI for one trash-confirmation instance — keyed by the exchange id, mirroring
 *  `source-control/tool-registrations.ts`'s `commitConfirmationUri` (a comment has an id but the
 *  dialog is a one-shot per exchange, not a resource with its own stable URL the way a post is). */
function trashConfirmationUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/comments-trash-comment/${exchangeId}` as UIResourceUri;
}

/**
 * Renders `comments_trash_comment`'s confirmation dialog — Jini's `buildConfirmationSurface` owns
 * HOW a confirmation dialog behaves; this function only decides WHAT a comment trash should say.
 * Mirrors `features/post/delete-confirmation-ui.ts`'s `buildDeleteConfirmationResource` shape.
 *
 * @complexity O(n) in the rendered body-preview length.
 */
function buildTrashConfirmationResource(spec: {
  comment: { authorName: string; bodyText: string; status: CommentStatus };
  exchangeId: string;
}): UIResource {
  const { comment, exchangeId } = spec;
  const bodyPreview = comment.bodyText.length > 140 ? `${comment.bodyText.slice(0, 140)}…` : comment.bodyText;

  return buildConfirmationSurface({
    uri: trashConfirmationUri(exchangeId),
    title: "Trash this comment?",
    description: "The comment will be moved to the trash. It can be restored with comments_restore_comment.",
    details: [
      { label: "Author", value: comment.authorName },
      { label: "Comment", value: bodyPreview },
      { label: "Current status", value: comment.status },
    ],
    danger: true,
    confirm: {
      label: "Trash comment",
      toolName: COMMENTS_TRASH_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
    },
    cancel: {
      label: "Cancel",
      toolName: COMMENTS_TRASH_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" },
    },
    app: { appName: "tovu-comments-trash-comment", appVersion: "1" },
    preferredFrameSize: ["100%", "320px"],
  });
}

/** Reads the optional patch members of `comments_update_settings`, requiring at least one — mirrors Forms' `requireFormsPatch`'s identical "no accepted-as-no-op empty patch" discipline. */
function requireCommentsSettingsPatch(input: Record<string, unknown>): Partial<CommentsSettings> {
  const patch: Partial<CommentsSettings> = {};
  if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
  if (typeof input.requireModeration === "boolean") patch.requireModeration = input.requireModeration;
  if (typeof input.maxDepth === "number") patch.maxDepth = input.maxDepth;
  if (input.closeAfterDays === null || typeof input.closeAfterDays === "number") patch.closeAfterDays = input.closeAfterDays as number | null;
  if (typeof input.spamAutoRejectScore === "number") patch.spamAutoRejectScore = input.spamAutoRejectScore;
  if (typeof input.maxPerIpPerHour === "number") patch.maxPerIpPerHour = input.maxPerIpPerHour;
  if (Object.keys(patch).length === 0) {
    throw new Error("at least one of enabled, requireModeration, maxDepth, closeAfterDays, spamAutoRejectScore, maxPerIpPerHour is required");
  }
  return patch;
}

export function buildCommentsRegistrations(
  routeDeps: CommentsToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore() },
): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    comments_list_moderation_queue: async (ctx) => {
      const input = requireInputRecord(ctx.input);

      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "comments.read", entityType: "comment" });

      await routeDeps.commentsReady;
      const status: CommentStatus = typeof input.status === "string" ? (input.status as CommentStatus) : "pending";
      const limit = typeof input.limit === "number" ? input.limit : 20;
      const cursor = typeof input.cursor === "string" ? input.cursor : null;
      const page = await routeDeps.commentRepo.listModerationQueue({ workspaceId: routeDeps.workspaceId, status, limit, cursor });
      return toModerationQueueToolView(page);
    },

    comments_get_settings: async (ctx) => {
      // `getCommentsSettings` has no `authorize` in its deps at all (unlike `setCommentsSettings`,
      // which self-enforces via its own `set()` call below) — the GET route gates explicitly
      // before calling it, so this handler mirrors that same explicit call.
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "comments.configure", entityType: "comments-settings" });

      await routeDeps.commentsSettingsReady;
      const settings = await getCommentsSettings({ settingsRepo: routeDeps.settingsRepo }, { workspaceId: routeDeps.workspaceId });
      return { settings };
    },

    comments_update_settings: async (ctx) => {
      const patch = requireCommentsSettingsPatch(requireInputRecord(ctx.input));

      // No explicit pre-check here, unlike every other Comments handler: `setCommentsSettings`
      // (settings.ts) self-enforces internally — its `set()` call is invoked with
      // `requiredPermissionOverride: 'comments.configure'` HARD-CODED inside settings.ts itself, so
      // passing `authorize: routeDeps.authorize` through is exactly ADR-021 §2's "one evaluator",
      // reached the domain-function way Forms/Identity use, not the explicit-handler way the rest
      // of this file uses. See settings.ts's own comment on that override for why.
      await routeDeps.commentsSettingsReady;
      const settings = await setCommentsSettings(
        {
          settingsRepo: routeDeps.settingsRepo,
          clock: routeDeps.clock,
          ids: routeDeps.idGen,
          authorize: routeDeps.authorize,
          principals: routeDeps.principalRepo,
        },
        { workspaceId: routeDeps.workspaceId, patch, callerPrincipalId: ctx.principal.id },
      );
      return { settings };
    },

    comments_approve_comment: buildCommentsModerationHandler(routeDeps, { permission: "comments.moderate", action: "approve", toStatus: "approved" }),
    comments_mark_comment_spam: buildCommentsModerationHandler(routeDeps, { permission: "comments.moderate", action: "mark_spam", toStatus: "spam" }),

    /**
     * The MCP-UI-gated trash — the second tool (after `content_post_delete`) migrated onto the
     * shared held-open confirmation exchange (2026-09-08, ADS-memory/reports/
     * 2026-09-08-delete-confirmation-build.md). Unlike Posts/Pages, this domain's own write path
     * (`applyModeration`) already carries an optimistic-concurrency check via `expectedVersion`, so
     * no separate stale-version re-read is needed here — a row that moved between the dialog
     * opening and the click surfaces as `applyModeration`'s own `conflict` result, thrown the same
     * way it always was.
     *
     * No fallback to the unconfirmed shape when `ctx.emitSurface` is unavailable — mirrors
     * `content_post_delete`'s identical fail-closed posture (see that handler's own doc).
     */
    comments_trash_comment: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const commentId = requireString(input, "commentId");
      const expectedVersion = requireNumber(input, "expectedVersion");

      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "comments.delete",
        entityType: "comment",
        entityId: commentId,
      });

      await routeDeps.commentsReady;
      const existing = await routeDeps.commentRepo.findById({ workspaceId: routeDeps.workspaceId, id: commentId });
      if (!existing) throw new Error(`comment '${commentId}' was not found`);

      if (!ctx.emitSurface) {
        throw new Error(
          "comments_trash_comment: this execution context has no interactive confirmation channel " +
            "(no emitSurface), so a destructive trash cannot be gated here. Nothing was trashed."
        );
      }

      const exchange: SurfaceExchange = surfaces.surfaceExchanges.open(
        { toolId: COMMENTS_TRASH_TOOL_ID, principalId: ctx.principal.id },
        ctx.emitSurface
      );
      const ui = buildTrashConfirmationResource({
        comment: { authorName: existing.authorName, bodyText: existing.bodyText, status: existing.status },
        exchangeId: exchange.id,
      });

      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        const outcome = await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource: ui } });
        if (!outcome.confirmed) {
          if (outcome.reason === "declined") {
            return { trashed: false, cancelled: true, commentId };
          }
          return {
            trashed: false,
            cancelled: false,
            reason: outcome.reason,
            note:
              outcome.reason === "expired"
                ? "The user did not respond to the confirmation dialog before it expired. Nothing was trashed."
                : "The confirmation dialog was closed because the run ended. Nothing was trashed.",
          };
        }

        const result = await routeDeps.commentWriteService.applyModeration({
          workspaceId: routeDeps.workspaceId,
          id: commentId,
          expectedVersion,
          action: "trash",
          toStatus: "trash",
          actorPrincipalId: ctx.principal.id,
          note: typeof input.note === "string" ? input.note : null,
        });
        if (!result.ok) {
          throw result.reason === "conflict"
            ? new Error(`comment was modified concurrently (current version is ${result.currentVersion}) — re-read with comments_list_moderation_queue and retry with the fresh version`)
            : new Error(`comment '${commentId}' was not found`);
        }

        return { trashed: true, cancelled: false, moderated: { commentId, toStatus: "trash" } };
      } finally {
        ctx.signal.removeEventListener("abort", closeOnAbort);
      }
    },

    comments_restore_comment: buildCommentsModerationHandler(routeDeps, { permission: "comments.moderate", action: "restore", toStatus: "approved" }),
  };

  // No `unwiredToolIds`: Comments wires its ENTIRE catalog, same tripwire discipline as Forms.
  return buildDomainRegistrations({
    domain: "comments",
    catalogModule: "comments/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: commentsDerivedRisk,
  });
}

/**
 * Contributes Comments' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildCommentsRegistrations`/
 * `commentsDerivedRisk` by name; this is the seam that replaced it (2026-08-17 — see
 * `tool-contribution-registry.ts`'s header for why: this edge used to close a module cycle with
 * `assistant`, and a one-directional `comments -> assistant` registration call does not).
 */
export function contributeCommentsTools(): ToolContributor {
  return { domain: "comments", build: buildCommentsRegistrations, risk: commentsDerivedRisk };
}
