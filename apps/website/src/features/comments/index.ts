/**
 * @file Composition factory for the Comments plugin (ADR-031, SPEC-033/SPEC-035) — wires the
 * repo, spam check, hooks, ingress policy, and write-service together given the low-level deps a
 * composition root (`server/deps.ts`/`app.ts`) already has. Both composition roots call this
 * instead of each hand-assembling the same 5-piece wiring twice.
 *
 * `entryLookup` adapts `EntryRepoPort.findById` (already on `RouteDeps`) into the narrow shape
 * `ingress.ts` expects, computing `commentsClosed` from the entry's own `status`/`publishedAt` +
 * `CommentsSettings.closeAfterDays` — this file owns that math so `ingress.ts` itself stays free of
 * any entries-feature knowledge (ADR-046 Phase 3's "narrow typed dependencies" convention).
 *
 * BUG FIX (2026-09-03, found auditing `ingress.ts` for an unrelated complexity refactor): an entry
 * that has never been published (`status: "draft"`, `publishedAt: null`) OR was explicitly
 * unpublished (`status: "unpublished"`) was previously readable as "open" — nothing anywhere in the
 * ingress path checked `EntryRecord.status` at all, only `publishedAt`. A visitor who knew or
 * guessed either entry's id could post a public, world-visible-once-moderated comment on content
 * nobody has ever been shown, or content that was deliberately retracted. Checked ADR-031/SPEC-033/
 * SPEC-035 (this file's own citations) for a deliberate "drafts/retracted entries are commentable"
 * design decision — REQ-04 says only "entry-open"; no spec anywhere defines that term against
 * publish state, names a preview/staging use case, or otherwise addresses this. Treated as spec-
 * silent, not spec-permitted: fixed as the fail-closed reading (`isEntryOpenForComments` below),
 * reusing the existing `entry-closed` rejection reason rather than adding a new one to `ports.ts`'s
 * `CommentIngressRejection` union — from a submitter's point of view "never published" and
 * "retracted" are both just "not currently open for comments." This is a deliberate BEHAVIOR
 * CHANGE with no spec mandate behind it, disclosed here and in this commit's message rather than
 * smuggled in as if it were spec-required.
 *
 * Checked for a second call site before fixing (the exact failure class a sibling session found
 * elsewhere in this campaign — a correct primitive wired into only one of several routes): grepped
 * the whole `apps/website/src` tree for every construction of `CommentIngressDeps.entryLookup` and
 * every call to `createCommentIngressPolicy`/`repo.create` for a comment row. There is exactly ONE
 * of each — this file's own `entryLookup` below, `createCommentsModule`'s own call to
 * `createCommentIngressPolicy`, and `ingress.ts#submit()`'s own `repo.create()` — reached by both
 * real composition roots (`server/runtime/composition/{app,deps}.ts`) through this one factory and
 * by no other path (`write-service.ts` only ever calls `applyModeration`/`purge` on an EXISTING
 * comment, never `create`). Fixing it here closes every write call site, not just the one this
 * audit started from.
 *
 * Also checked the READ side for the same class of leak (does the public read path show comments
 * on an unpublished entry, not just accept new ones on it): `CommentRepoPort.listThreadForEntry`
 * has zero route call sites anywhere in this codebase today — grepped for every reference; the only
 * hits are its own port declaration, its two adapter implementations, and `repo.contract.test.ts`.
 * There is no live public comment-read route yet (ADR-031 §10's origin-isolated widget, this file's
 * own header already cites, remains deferred — "no ADR-025 host exists yet" per SPEC-033's own
 * Scope Note). So there is nothing to fix on the read side today; flagged here as a note for
 * whoever builds that route next, not a bug in the current tree.
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
import type { EntryRecord, EntryRepoPort } from "../entries/index.js";
import type { SettingsRepoPort } from "../settings/index.js";
import { createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import type { RateLimitProfile } from "#src/contracts/core/rate-limit/rate-limit";
import { createCommentHookRegistry } from "./hooks.js";
import { createCommentIngressPolicy } from "./ingress.js";
import type { EntryLookupResult } from "./ingress.js";
import type { CommentIngressPolicy, CommentRepoPort, SpamCheckPort } from "./ports.js";
import { getCommentsSettings } from "./settings.js";
import type { CommentsSettings } from "./types.js";
import { createCommentWriteService } from "./write-service.js";
import type {
  CommentTransactionRunner,
  CommentWriteService,
  ForgetRemovedCommentFn,
  RemoveCommentFn,
} from "./write-service.js";

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
  /** The spam-check adapter the caller has chosen (`HeuristicSpamCheck` by default in both real
   * composition roots, `AkismetSpamCheck` when an operator configures it) — this module never picks
   * one on its own, so the choice is a real DI seam, not a hardcoded default. */
  spamCheck: SpamCheckPort;
  /** Fixed fallback settings, used only when `settingsRepo` is omitted. */
  settings?: CommentsSettings;
  /** SPEC-035 — when supplied, settings are read LIVE from the ADR-028 ledger instead of the
   * fixed `settings`/`DEFAULT_COMMENTS_SETTINGS` fallback. The composition root is also
   * responsible for calling `ensureCommentsSettingDefinitions` at boot (mirrors SEO's
   * `ensureSeoSettingDefinitions` wiring) — this module does not register definitions itself. */
  settingsRepo?: SettingsRepoPort;
  /**
   * The local admin Trash's three seams, passed straight through to the moderation write-service.
   * Required, not optional: a default no-op would silently drop comments out of the Trash screen,
   * and "deleted but unrecoverable" is exactly the failure this feature exists to prevent. See
   * `write-service.ts`'s `RemoveCommentFn` for why none of them is a trash type.
   */
  remove: RemoveCommentFn;
  forgetRemoved: ForgetRemovedCommentFn;
  runInTransaction: CommentTransactionRunner;
}

export interface CommentsModule {
  commentRepo: CommentRepoPort;
  ingressPolicy: CommentIngressPolicy;
  writeService: CommentWriteService;
}

/** `closeAfterDays` age math ONLY — assumes the entry is otherwise eligible. Does not, and must
 *  not, decide publish state; see {@link isEntryOpenForComments}, which composes this with the
 *  publish-state check this file's header documents. */
function isPastCloseWindow(publishedAt: string | null, closeAfterDays: number | null, nowIso: string): boolean {
  if (closeAfterDays === null || publishedAt === null) return false;
  const publishedMs = Date.parse(publishedAt);
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(publishedMs) || Number.isNaN(nowMs)) return false;
  const ageDays = (nowMs - publishedMs) / (1000 * 60 * 60 * 24);
  return ageDays > closeAfterDays;
}

/**
 * Whether an entry may currently receive a new public comment: it must actually be `published`
 * — not `draft` (never shown to anyone) and not `unpublished` (deliberately retracted) — AND not
 * past its `closeAfterDays` window. `status !== "published"` is checked FIRST and short-circuits:
 * `publishedAt` alone cannot distinguish "live" from "retracted", because `unpublishEntry`
 * (`@jini-ai/cms/entries` `write-service.ts#transitionEntryStatus`) deliberately does not clear
 * `publishedAt` on retraction (`publishedAt: target.status === "published" ? now : current.
 * publishedAt`) — it stays at whatever it was, so a stale `publishedAt` from before retraction
 * would otherwise still pass the age check. See this file's header for the bug this closes.
 */
function isEntryOpenForComments(entry: Pick<EntryRecord, "status" | "publishedAt">, closeAfterDays: number | null, nowIso: string): boolean {
  if (entry.status !== "published") return false;
  return !isPastCloseWindow(entry.publishedAt, closeAfterDays, nowIso);
}

export function createCommentsModule(deps: CommentsModuleDeps): CommentsModule {
  const hooks = createCommentHookRegistry();
  const spamCheck = deps.spamCheck;
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
      commentsClosed: !isEntryOpenForComments(entry, settings.closeAfterDays, deps.clock.nowIso()),
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
    remove: deps.remove,
    forgetRemoved: deps.forgetRemoved,
    runInTransaction: deps.runInTransaction,
  });

  return { commentRepo: deps.commentRepo, ingressPolicy, writeService };
}

export type { CommentRepoPort, CommentIngressPolicy, SpamCheckPort } from "./ports.js";
export { HeuristicSpamCheck } from "./spam.heuristic.js";
export type { CommentRecord, CommentStatus, CommentsSettings, CommentSubmission, ModerationAction, ModerationLogEntry } from "./types.js";
export { COMMENTS_DATA_MODULE, COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID, COMMENTS_PLUGIN_ID } from "./types.js";
export type {
  CommentTransactionRunner,
  CommentWriteService,
  ForgetRemovedCommentFn,
  RemoveCommentFn,
} from "./write-service.js";
export { ensureCommentsSettingDefinitions, getCommentsSettings, setCommentsSettings } from "./settings.js";
export { CommentsSettingsValidationError } from "./errors.js";
