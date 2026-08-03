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
import type { AuthorizeFn } from "../core/commands/command";
import type { SettingsRepoPort } from "../features/settings";
import type { PrincipalRepoPort } from "../identity";
import {
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
} from "../core/tools/registration-kit";
import { commentsAgentToolCatalog } from "./agent-tools";
import type { CommentRepoPort } from "./ports";
import { getCommentsSettings, setCommentsSettings } from "./settings";
import type { CommentsSettings, CommentStatus, ModerationAction, ModerationQueuePage } from "./types";
import type { CommentWriteService } from "./write-service";

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

export function buildCommentsRegistrations(routeDeps: CommentsToolDeps): ToolRegistration[] {
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
    comments_trash_comment: buildCommentsModerationHandler(routeDeps, { permission: "comments.delete", action: "trash", toStatus: "trash" }),
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
