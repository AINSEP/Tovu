/**
 * @file ADR-031 §3/§8 — the moderation write-service: wraps `CommentRepoPort.applyModeration`/
 * `purge` with outbox event emission and the `comments.statusChanged` action hook. Routes call
 * `authorize()` first (ADR-021 flat `comments.*` strings), then this service, never the repo
 * directly — the same "typed, core-owned write, no side-door" discipline ADR-023 §7 requires of
 * the repo itself, one layer up.
 */
import type { ClockPort, IdGeneratorPort, OutboxPort, UUID } from "../core/ports";
import type { CommentHookRegistry } from "./hooks";
import type { CommentEventName, CommentRepoPort } from "./ports";
import type { CommentStatus, ModerationAction } from "./types";

export interface CommentWriteServiceDeps {
  repo: CommentRepoPort;
  outbox: OutboxPort;
  hooks: CommentHookRegistry;
  clock: ClockPort;
  idGen: IdGeneratorPort;
}

export type ModerationResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "conflict"; currentVersion?: number };

const EVENT_NAME_BY_ACTION: Partial<Record<ModerationAction, CommentEventName>> = {
  approve: "comments.approved",
  mark_spam: "comments.marked_spam",
  trash: "comments.trashed",
};

// Inline object literal at the enqueue() call site (not a `CommentDomainEvent`-typed
// intermediate) — see ingress.ts's identical note on why: TS only infers a
// `Record<string, unknown>`-compatible index signature for a FRESH literal argument.
async function emitEvent(
  deps: CommentWriteServiceDeps,
  required: { workspaceId: UUID; name: CommentEventName; commentId: UUID; entryId: UUID; status: CommentStatus }
): Promise<void> {
  await deps.outbox.enqueue({
    id: deps.idGen.newId(),
    name: required.name,
    occurredAt: deps.clock.nowIso(),
    aggregateId: required.commentId,
    workspaceId: required.workspaceId,
    payload: { commentId: required.commentId, entryId: required.entryId, status: required.status },
  });
}

export interface CommentWriteService {
  applyModeration(required: {
    workspaceId: UUID;
    id: UUID;
    expectedVersion: number;
    action: ModerationAction;
    toStatus: CommentStatus;
    actorPrincipalId: UUID;
    note: string | null;
  }): Promise<ModerationResult>;

  purge(required: { workspaceId: UUID; id: UUID; actorPrincipalId: UUID; note: string | null }): Promise<ModerationResult>;
}

export function createCommentWriteService(deps: CommentWriteServiceDeps): CommentWriteService {
  return {
    async applyModeration(required) {
      const at = deps.clock.nowIso();
      const result = await deps.repo.applyModeration({ ...required, at });
      if (!result.ok) return result;

      await deps.hooks.runStatusChangedHooks({
        workspaceId: required.workspaceId,
        commentId: required.id,
        fromStatus: result.log.fromStatus,
        toStatus: result.record.status,
      });

      const eventName = EVENT_NAME_BY_ACTION[required.action];
      if (eventName) {
        await emitEvent(deps, {
          workspaceId: required.workspaceId,
          name: eventName,
          commentId: required.id,
          entryId: result.record.entryId,
          status: result.record.status,
        });
      }

      return { ok: true };
    },

    async purge(required) {
      const at = deps.clock.nowIso();
      const before = await deps.repo.findById({ workspaceId: required.workspaceId, id: required.id });
      const result = await deps.repo.purge({ ...required, at });
      if (!result.ok) return result;

      if (before) {
        await emitEvent(deps, {
          workspaceId: required.workspaceId,
          name: "comments.purged",
          commentId: required.id,
          entryId: before.entryId,
          status: before.status,
        });
      }

      return { ok: true };
    },
  };
}
