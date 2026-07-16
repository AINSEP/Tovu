/**
 * @file Composition factory for the Comments plugin (ADR-031, SPEC-033) — wires the repo, spam
 * check, hooks, ingress policy, and write-service together given the low-level deps a composition
 * root (`server/deps.ts`/`app.ts`) already has. Both composition roots call this instead of each
 * hand-assembling the same 5-piece wiring twice.
 *
 * `entryLookup` adapts `EntryRepoPort.findById` (already on `RouteDeps`) into the narrow shape
 * `ingress.ts` expects, computing `commentsClosed` from `CommentsSettings.closeAfterDays` +
 * the entry's own `publishedAt` — this file owns that math so `ingress.ts` itself stays free of
 * any entries-feature knowledge (ADR-046 Phase 3's "narrow typed dependencies" convention).
 *
 * `DEFAULT_COMMENTS_SETTINGS` is a disclosed v1 simplification: `CommentsSettings` is meant to
 * live in the ADR-028 Settings Layered Ledger under a `comments.*` namespace once that wiring
 * exists (per `types.ts`'s own doc on `CommentsSettings`) — that integration is not built this
 * pass; every workspace gets these fixed defaults instead.
 */
import type { ClockPort, IdGeneratorPort, OutboxPort, UUID } from "../core/ports";
import type { EntryRepoPort } from "../features/entries/write-service";
import { createRateLimiter } from "../server/middleware/rate-limit";
import type { RateLimitProfile } from "../server/middleware/rate-limit";
import { createCommentHookRegistry } from "./hooks";
import { createCommentIngressPolicy } from "./ingress";
import type { EntryLookupResult } from "./ingress";
import type { CommentIngressPolicy, CommentRepoPort } from "./ports";
import { HeuristicSpamCheck } from "./spam.heuristic";
import type { CommentsSettings } from "./types";
import { createCommentWriteService } from "./write-service";
import type { CommentWriteService } from "./write-service";

export const DEFAULT_COMMENTS_SETTINGS: CommentsSettings = {
  enabled: true,
  requireModeration: true,
  maxDepth: 5,
  closeAfterDays: null,
  spamAutoRejectScore: 0.5,
  maxPerIpPerHour: 20,
};

/** api.spec-style profile, mirroring `FORMS_SUBMIT_PROFILE`'s shape/magnitude for a comparable public write endpoint. */
export const COMMENTS_SUBMIT_PROFILE: RateLimitProfile = { windowSeconds: 3600, max: 20, burst: 0 };

export interface CommentsModuleDeps {
  commentRepo: CommentRepoPort;
  entryRepo: Pick<EntryRepoPort, "findById">;
  outbox: OutboxPort;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  settings?: CommentsSettings;
}

export interface CommentsModule {
  commentRepo: CommentRepoPort;
  ingressPolicy: CommentIngressPolicy;
  writeService: CommentWriteService;
}

function computeCommentsClosed(publishedAt: string | null, closeAfterDays: number | null, nowIso: string): boolean {
  if (closeAfterDays === null || publishedAt === null) return false;
  const publishedMs = Date.parse(publishedAt);
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(publishedMs) || Number.isNaN(nowMs)) return false;
  const ageDays = (nowMs - publishedMs) / (1000 * 60 * 60 * 24);
  return ageDays > closeAfterDays;
}

export function createCommentsModule(deps: CommentsModuleDeps): CommentsModule {
  const settings = deps.settings ?? DEFAULT_COMMENTS_SETTINGS;
  const hooks = createCommentHookRegistry();
  const spamCheck = new HeuristicSpamCheck();
  const rateLimiter = createRateLimiter(COMMENTS_SUBMIT_PROFILE, deps.clock);

  const entryLookup = async (required: { workspaceId: UUID; entryId: UUID }): Promise<EntryLookupResult | null> => {
    const entry = await deps.entryRepo.findById({ workspaceId: required.workspaceId, id: required.entryId });
    if (!entry) return null;
    return {
      id: entry.id,
      commentsClosed: computeCommentsClosed(entry.publishedAt, settings.closeAfterDays, deps.clock.nowIso()),
    };
  };

  const ingressPolicy = createCommentIngressPolicy({
    repo: deps.commentRepo,
    spamCheck,
    hooks,
    clock: deps.clock,
    idGen: deps.idGen,
    settings,
    entryLookup,
    rateLimiter,
    outbox: deps.outbox,
  });

  const writeService = createCommentWriteService({
    repo: deps.commentRepo,
    outbox: deps.outbox,
    hooks,
    clock: deps.clock,
    idGen: deps.idGen,
  });

  return { commentRepo: deps.commentRepo, ingressPolicy, writeService };
}

export type { CommentRepoPort, CommentIngressPolicy, SpamCheckPort } from "./ports";
export type { CommentRecord, CommentStatus, CommentsSettings, CommentSubmission, ModerationAction, ModerationLogEntry } from "./types";
export { COMMENTS_DATA_MODULE, COMMENTS_PLUGIN_ID } from "./types";
export type { CommentWriteService } from "./write-service";
