/**
 * @file Composition factory for the Comments plugin (ADR-031, SPEC-033/SPEC-035) — wires the
 * repo, spam check, hooks, ingress policy, and write-service together given the low-level deps a
 * composition root (`server/deps.ts`/`app.ts`) already has. Both composition roots call this
 * instead of each hand-assembling the same 5-piece wiring twice.
 *
 * `entryLookup` adapts `EntryRepoPort.findById` (already on `RouteDeps`) into the narrow shape
 * `ingress.ts` expects, computing `commentsClosed` from `CommentsSettings.closeAfterDays` +
 * the entry's own `publishedAt` — this file owns that math so `ingress.ts` itself stays free of
 * any entries-feature knowledge (ADR-046 Phase 3's "narrow typed dependencies" convention).
 *
 * `settingsRepo` (SPEC-035, ADR-028 Settings Layered Ledger wiring): when supplied, this module
 * reads `CommentsSettings` LIVE from the ledger (`settings.ts#getCommentsSettings`), per call, via
 * the `getSettings` resolver both `ingress.ts` and this file's own `entryLookup` share — an
 * operator's settings change takes effect on the next request, not only after a restart.
 * `DEFAULT_COMMENTS_SETTINGS` remains the fallback when `settingsRepo` is omitted (hermetic tests
 * that don't want to wire the ledger) AND the per-key default `getCommentsSettings` itself falls
 * back to before `ensureCommentsSettingDefinitions` has run in a real composition.
 */
import type { ClockPort, IdGeneratorPort, OutboxPort, UUID } from "@jini-ai/cms/core";
import type { EntryRepoPort } from "../features/entries/index.js";
import type { SettingsRepoPort } from "../features/settings/index.js";
import { createRateLimiter } from "#src/core/rate-limit/rate-limit";
import type { RateLimitProfile } from "#src/core/rate-limit/rate-limit";
import { createCommentHookRegistry } from "./hooks.js";
import { createCommentIngressPolicy } from "./ingress.js";
import type { EntryLookupResult } from "./ingress.js";
import type { CommentIngressPolicy, CommentRepoPort } from "./ports.js";
import { getCommentsSettings } from "./settings.js";
import { HeuristicSpamCheck } from "./spam.heuristic.js";
import type { CommentsSettings } from "./types.js";
import { createCommentWriteService } from "./write-service.js";
import type { CommentWriteService } from "./write-service.js";

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
  /** Fixed fallback settings, used only when `settingsRepo` is omitted. */
  settings?: CommentsSettings;
  /** SPEC-035 — when supplied, settings are read LIVE from the ADR-028 ledger instead of the
   * fixed `settings`/`DEFAULT_COMMENTS_SETTINGS` fallback. The composition root is also
   * responsible for calling `ensureCommentsSettingDefinitions` at boot (mirrors SEO's
   * `ensureSeoSettingDefinitions` wiring) — this module does not register definitions itself. */
  settingsRepo?: SettingsRepoPort;
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
  const hooks = createCommentHookRegistry();
  const spamCheck = new HeuristicSpamCheck();
  // Disclosed gap (SPEC-035): `maxPerIpPerHour` is readable/writable through the ledger like every
  // other `CommentsSettings` field, but the actual rate-LIMITER below is still constructed ONCE,
  // fixed at `COMMENTS_SUBMIT_PROFILE.max` (= the same value as `DEFAULT_COMMENTS_SETTINGS.
  // maxPerIpPerHour`) — an operator changing it via the admin settings route updates the STORED
  // value but does not yet reconfigure the live limiter. Making the limiter itself dynamically
  // reconfigurable per-workspace is a larger change to `core/rate-limit/rate-limit.ts`'s
  // fixed-window counter store, out of this slice's scope (mirrors the task's own "don't build a
  // large amount of new plumbing beyond what already exists for SEO's pattern" guidance).
  const rateLimiter = createRateLimiter({ profile: COMMENTS_SUBMIT_PROFILE, clock: deps.clock });

  // SPEC-035 — the live settings resolver: reads the ADR-028 ledger per call when `settingsRepo`
  // is supplied, else falls back to the fixed `deps.settings ?? DEFAULT_COMMENTS_SETTINGS`
  // snapshot (hermetic tests / a composition root that hasn't wired the ledger).
  const getSettings = async (workspaceId: UUID): Promise<CommentsSettings> =>
    deps.settingsRepo
      ? getCommentsSettings({ settingsRepo: deps.settingsRepo }, { workspaceId })
      : deps.settings ?? DEFAULT_COMMENTS_SETTINGS;

  const entryLookup = async (required: { workspaceId: UUID; entryId: UUID }): Promise<EntryLookupResult | null> => {
    const entry = await deps.entryRepo.findById({ workspaceId: required.workspaceId, id: required.entryId });
    if (!entry) return null;
    const settings = await getSettings(required.workspaceId);
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
    getSettings,
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

export type { CommentRepoPort, CommentIngressPolicy, SpamCheckPort } from "./ports.js";
export type { CommentRecord, CommentStatus, CommentsSettings, CommentSubmission, ModerationAction, ModerationLogEntry } from "./types.js";
export { COMMENTS_DATA_MODULE, COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID, COMMENTS_PLUGIN_ID } from "./types.js";
export type { CommentWriteService } from "./write-service.js";
export { ensureCommentsSettingDefinitions, getCommentsSettings, setCommentsSettings } from "./settings.js";
export { CommentsSettingsValidationError } from "./errors.js";
