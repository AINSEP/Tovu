/**
 * @file ADR-031 §4 — `CommentIngressPolicy`, the single core-mediated public-submission
 * boundary (mirrors ADR-027's one `MediaIngressPolicy`). Enforces, in order:
 * comments-enabled → entry-open → parent-exists → depth-cap → rate-limit → honeypot/size/link
 * caps → sanitize → hook chain (veto/transform) → spam classification → write.
 *
 * Spam is stored silently (`status: "spam"`), never rejected at the boundary — a rejection is an
 * oracle a spammer tunes against (ADR-031 §4's own explicit instruction).
 *
 * `entryLookup` is a narrow, caller-injected dependency (ADR-046 Phase 3's "narrow typed
 * dependencies" convention) rather than a direct import of the entries feature module — its
 * `commentsClosed` field is where `CommentsSettings.closeAfterDays` math against the entry's own
 * publish date belongs; this file does not duplicate that logic.
 *
 * `authorIpHash`/honeypot are read from `submission.ingressContext` (already computed/salted by
 * the HTTP route layer, per `CommentSubmission`'s own doc: "the raw IP is never stored" — this
 * file never sees it) under the fixed keys `authorIpHash` and `honeypotValue`.
 *
 * `getSettings` (SPEC-035, ADR-028 Settings Layered Ledger wiring) is a per-call RESOLVER, not a
 * boot-captured snapshot — `submit()` reads it fresh at the top of every call, so an operator's
 * settings change via the admin `PUT .../comments/settings` route (`settings.ts`) takes effect on
 * the very next submission, not only after a restart. `index.ts` builds this resolver from
 * `settingsRepo` when the composition root supplies one, falling back to a fixed snapshot
 * otherwise (hermetic tests that don't wire the ledger).
 */
import type { ClockPort, IdGeneratorPort, OutboxPort, UUID } from "@jini-ai/cms/core";
import type { RateLimiter } from "../server/middleware/rate-limit";
import type { CommentHookRegistry } from "./hooks";
import type {
  CommentIngressPolicy,
  CommentIngressResult,
  CommentRepoPort,
  SpamCheckPort,
} from "./ports";
import { countLinks, sanitizeCommentBody } from "./sanitize";
import { COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID } from "./types";
import type {
  CommentRecord,
  CommentStatus,
  CommentSubmission,
  CommentsSettings,
  ModerationLogEntry,
} from "./types";

const MAX_BODY_LENGTH = 10_000;
const MAX_LINKS = 5;

export interface EntryLookupResult {
  id: UUID;
  /** True when the entry itself is closed to new comments (per-entry override or `closeAfterDays`). */
  commentsClosed: boolean;
}

export interface CommentIngressDeps {
  repo: CommentRepoPort;
  spamCheck: SpamCheckPort;
  hooks: CommentHookRegistry;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  getSettings: (workspaceId: UUID) => Promise<CommentsSettings>;
  entryLookup: (required: { workspaceId: UUID; entryId: UUID }) => Promise<EntryLookupResult | null>;
  rateLimiter: RateLimiter;
  /** ADR-031 §8 — every successful submission emits `comments.submitted` (whatever status
   * resulted, including an auto-classified `spam`); a moderator's LATER explicit action is what
   * emits `comments.marked_spam` (see `write-service.ts`) — the two are deliberately distinct. */
  outbox: OutboxPort;
}

function readIngressString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function createCommentIngressPolicy(deps: CommentIngressDeps): CommentIngressPolicy {
  return {
    async submit(submission: CommentSubmission): Promise<CommentIngressResult> {
      const settings = await deps.getSettings(submission.workspaceId);
      if (!settings.enabled) return { ok: false, reason: "comments-disabled" };

      const entry = await deps.entryLookup({ workspaceId: submission.workspaceId, entryId: submission.entryId });
      if (!entry) return { ok: false, reason: "entry-not-found" };
      if (entry.commentsClosed) return { ok: false, reason: "entry-closed" };

      let depth = 0;
      let parentThreadRootId: UUID | null = null;
      if (submission.parentId) {
        const parent = await deps.repo.findById({ workspaceId: submission.workspaceId, id: submission.parentId });
        if (!parent) return { ok: false, reason: "parent-not-found" };
        depth = parent.depth + 1;
        if (depth > settings.maxDepth) return { ok: false, reason: "max-depth-exceeded" };
        parentThreadRootId = parent.threadRootId;
      }

      const authorIpHash = readIngressString(submission.ingressContext.authorIpHash);
      const rateLimitResult = deps.rateLimiter.check(authorIpHash ?? "unknown");
      if (!rateLimitResult.allowed) return { ok: false, reason: "rate-limited" };

      if (readIngressString(submission.ingressContext.honeypotValue)) {
        return { ok: false, reason: "honeypot-tripped" };
      }

      const sanitizedBody = sanitizeCommentBody(submission.bodyRaw);
      if (sanitizedBody.length > MAX_BODY_LENGTH) return { ok: false, reason: "body-too-large" };
      if (countLinks(sanitizedBody) > MAX_LINKS) return { ok: false, reason: "too-many-links" };

      const sanitizedSubmission: CommentSubmission = { ...submission, bodyRaw: sanitizedBody };
      const hookResult = await deps.hooks.runBeforeSubmitChain(sanitizedSubmission);
      if ("reject" in hookResult) return { ok: false, reason: hookResult.reject };

      const verdict = await deps.spamCheck.check(hookResult.submission);
      const status: CommentStatus =
        verdict.score >= settings.spamAutoRejectScore ? "spam" : settings.requireModeration ? "pending" : "approved";

      const id = deps.idGen.newId();
      const now = deps.clock.nowIso();
      const record: CommentRecord = {
        id,
        workspaceId: submission.workspaceId,
        entryId: submission.entryId,
        parentId: submission.parentId,
        threadRootId: parentThreadRootId ?? id,
        depth,
        status,
        authorPrincipalId: hookResult.submission.authorPrincipalId,
        authorName: hookResult.submission.authorName,
        authorEmail: hookResult.submission.authorEmail,
        authorUrl: hookResult.submission.authorUrl,
        authorIpHash,
        bodyText: hookResult.submission.bodyRaw,
        spamScore: verdict.score,
        spamProvider: verdict.provider,
        createdAt: now,
        updatedAt: now,
        version: 0,
      };

      // OQ-3 resolution (ADR-031 round-2 fold, SPEC-035): every ingress-created comment gets a
      // `submit` moderation_log row, attributed to the seeded system principal — the ingress has
      // no real operator principal to attribute this to (the visitor is anonymous by definition),
      // and the auto-classification (pending/approved/spam) IS itself a moderation decision, just
      // one core made instead of a human. `fromStatus: null` (nothing existed before this write).
      const submitLogEntry: ModerationLogEntry = {
        id: deps.idGen.newId(),
        workspaceId: record.workspaceId,
        commentId: record.id,
        actorPrincipalId: COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID,
        action: "submit",
        fromStatus: null,
        toStatus: record.status,
        at: now,
        note: null,
      };
      await deps.repo.create(record, submitLogEntry);

      // Inline object literal (not a `CommentDomainEvent`-typed intermediate) — matches this
      // codebase's established `outbox.enqueue()` call-site convention (e.g.
      // `features/entries/write-service.ts`): TS only infers a `Record<string, unknown>`-
      // compatible index signature for a FRESH object literal argument, not for a value already
      // typed against a concrete interface without one.
      await deps.outbox.enqueue({
        id: deps.idGen.newId(),
        name: "comments.submitted",
        occurredAt: now,
        aggregateId: record.id,
        workspaceId: record.workspaceId,
        payload: { commentId: record.id, entryId: record.entryId, status: record.status },
      });

      return { ok: true, comment: record, autoClassified: status };
    },
  };
}
