/**
 * @file THE `redirects` write chokepoint (SPEC-009 REQ-01/04/05/06/07/08/13/
 * 14/22/26; ADR-PIPE-009 C-001..C-004).
 *
 * Purpose:
 * `createRedirect`/`updateRedirect`/`tombstoneRedirect`/`importRedirects` —
 * the single manual-write entry point for redirect rules. Validates the
 * pattern (via `RedirectMatcher.validatePattern`), rejects unsafe targets —
 * absolute ones against the origin allowlist and site-relative ones against
 * the admin application's own URL space (write-path open-redirect oracle,
 * REQ-08; see `assertTargetAllowed`) — collapses/rejects
 * one-hop chains (INV-04), enforces the exact-match dedup rule
 * (behavior.spec.md §5.1), and writes the record + its revision in one
 * transaction via `ports.internal.ts`'s shared `insertRedirectAndRevision`
 * (INV-01/INV-07 — no other file writes `redirects`/`redirect_revisions`).
 *
 * Architectural role:
 * Feature logic. No Express/route code — route handlers (Phase 2) call these
 * functions directly and map thrown typed errors to HTTP codes per
 * errors.spec.md.
 */
import type { ClockPort, DomainEvent, IdGeneratorPort, OutboxPort } from "@jini-ai/cms/core";
import { hasForbiddenRawUrlCharacter } from "../../features/origin/index.js";
import type { OriginRegistryPort, RedirectTargetContext } from "../../features/origin/index.js";

import { checkSiteRelativeTarget } from "../../platform/routing/index.js";
import type { SiteRelativeTargetCheck } from "../../platform/routing/index.js";

import { insertRedirectAndRevision, type RedirectDbHandle } from "./ports.internal.js";
import type { RedirectMatcher, RedirectMutatedEvent, RedirectRepoPort } from "./ports.js";
import { isReferrerAliasLocation } from "./referrer-alias.js";
import { checkSameOriginDestination } from "./reserved-destination.js";
import {
  RedirectConflictError,
  RedirectLoopError,
  RedirectNotFoundError,
  RedirectTargetNotAllowedError,
  RedirectValidationError,
} from "./types.js";
import type {
  CreateRedirectInput,
  RedirectRecord,
  RedirectRevision,
  RedirectStatusCode,
  UpdateRedirectInput,
} from "./types.js";

// Exported (unchanged values) so `agent-tools.ts`'s published JSON Schema can reuse the exact
// bounds this chokepoint validates against, rather than restating them — same discipline as
// `seo/write-service.ts`'s identical export note.
export const MIN_TARGET_LENGTH = 1;
export const MAX_TARGET_LENGTH = 2048;
export const MIN_PRIORITY = 0;
export const MAX_PRIORITY = 1000;
const DEFAULT_PRIORITY = 0;
export const VALID_STATUS_CODES: readonly RedirectStatusCode[] = [301, 302, 307, 308];
export const MAX_IMPORT_BATCH_SIZE = 500;

function isAbsoluteOrProtocolRelative(target: string): boolean {
  return target.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(target);
}

export interface RedirectsWriteDeps {
  repo: RedirectRepoPort;
  /** The shared, non-tx-opening write handle (Decision A) — used via `ports.internal.ts`. */
  db: RedirectDbHandle;
  /** Opens/commits/rolls back the chokepoint's own transaction around a write. */
  transaction: <T>(fn: () => Promise<T>) => Promise<T>;
  matcher: RedirectMatcher;
  originRegistry: OriginRegistryPort;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  outbox: OutboxPort;
}

function validateStatusCode(statusCode: RedirectStatusCode): void {
  if (!VALID_STATUS_CODES.includes(statusCode)) {
    throw new RedirectValidationError(`statusCode must be one of ${VALID_STATUS_CODES.join(", ")}`);
  }
}

function validateToTargetLength(toTarget: string): void {
  if (toTarget.length < MIN_TARGET_LENGTH || toTarget.length > MAX_TARGET_LENGTH) {
    throw new RedirectValidationError(
      `toTarget must be ${MIN_TARGET_LENGTH}-${MAX_TARGET_LENGTH} characters (got ${toTarget.length})`
    );
  }
}

function validatePriority(priority: number): void {
  if (!Number.isInteger(priority) || priority < MIN_PRIORITY || priority > MAX_PRIORITY) {
    throw new RedirectValidationError(
      `priority must be an integer ${MIN_PRIORITY}-${MAX_PRIORITY} (got ${priority})`
    );
  }
}

/**
 * Resolve the actual target this rule should persist, applying one-hop
 * collapse (AC-16) and cycle rejection (AC-17): if `toTarget` (relative)
 * itself matches an existing active rule's `fromPattern`, collapse to that
 * rule's own target — the request path never chases more than one hop
 * (INV-04). If the collapsed target equals `fromPattern`, this create/update
 * would introduce a cycle; reject it instead of writing a self-loop.
 */
async function resolveCollapsedTarget(
  repo: RedirectRepoPort,
  workspaceId: string,
  fromPattern: string,
  toTarget: string
): Promise<string> {
  let finalTarget = toTarget;
  if (!isAbsoluteOrProtocolRelative(finalTarget)) {
    const chained = await repo.findByFromPattern({ workspaceId, fromPattern: finalTarget });
    if (chained && chained.status === "active") {
      finalTarget = chained.toTarget;
    }
  }
  if (finalTarget === fromPattern) {
    throw new RedirectLoopError(
      `redirect from '${fromPattern}' would create a cycle via '${toTarget}' (resolves back to '${fromPattern}')`
    );
  }
  return finalTarget;
}

/**
 * Why a site-relative target was refused, phrased for the operator or agent that wrote it.
 *
 * Split out of {@link assertTargetAllowed} so the refusal wording lives next to the verdict union
 * it exhausts — a new arm in `SiteRelativeTargetCheck` becomes a type error here rather than a
 * silently generic message.
 *
 * @param check - The verdict from `checkSiteRelativeTarget`, or from `checkSameOriginDestination`
 * when `assertTargetAllowed` phrases the absolute same-origin verdict (t91 B1, 2026-09-16) — its
 * arms are a subset of this parameter's, so no separate phrasing function is needed.
 * @returns The reason clause, or `null` when the target is allowed.
 * @complexity O(1).
 */
function siteRelativeRefusalReason(check: SiteRelativeTargetCheck): string | null {
  switch (check.kind) {
    case "ok":
      return null;
    case "reserved":
      return `it resolves to '/${check.surface}', which serves the authenticated admin application rather than this site's public pages`;
    case "off-origin":
      return "it looks site-relative but resolves to a different host (a URL parser reads '\\' as '/')";
    case "unparseable":
      return "it is not a parseable URL path";
    case "malformed-encoding":
      return "it contains a malformed percent-encoding";
    case "disallowed-character":
      return "it contains, or decodes to, a backslash or a control character";
  }
}

/**
 * The site-relative half of the write gate: routing's structural + reserved-path verdict, then the
 * redirect oracle's own raw-character rule. The read path hands a relative location to that oracle
 * by concatenation, so a target it refuses (a raw backslash, any whitespace) would be stored and
 * never fire; refusing it here keeps write and read agreeing. Checked SECOND so the more specific
 * routing reasons (off-origin, control character, reserved) keep their own wording — a bare
 * backslash target is `ok` to `checkSiteRelativeTarget` (on this site, `\` really does resolve to
 * `/`), so only this second check ever refuses it (t91 B2, 2026-09-16). Last, the exact target
 * `back`, which Express serves as the visitor's `Referer` instead of a path (see
 * `./referrer-alias.ts`; t91 review F1, 2026-09-16).
 *
 * @returns The reason clause, or `null` when the target is allowed.
 * @complexity O(n) in the target length.
 */
function siteRelativeTargetReason(target: string): string | null {
  const reason = siteRelativeRefusalReason(checkSiteRelativeTarget(target));
  if (reason !== null) return reason;
  if (hasForbiddenRawUrlCharacter(target)) {
    return "it contains a backslash or whitespace, which the redirect origin check refuses (write a space as '%20')";
  }
  if (isReferrerAliasLocation(target)) {
    return "it is 'back', which the server replaces with the visitor's Referer header (a redirect to whatever page linked here)";
  }
  return null;
}

/**
 * The write-path target gate (REQ-08), in two halves that close the SAME hole from opposite sides.
 *
 * An ABSOLUTE or protocol-relative target names a host, so the question is "is that host allowed"
 * and `OriginRegistryPort` answers it. A SITE-RELATIVE target names no host, so the origin
 * allowlist has nothing to say about it — and that used to mean it was not checked at all, which
 * left the admin application's own URL space (`/admin`, `/api/...`, served by this same Express
 * app) usable as a redirect destination from a public-site rule, including through the
 * agent-callable `redirects_create`. `checkSiteRelativeTarget` is the second half; it is the same
 * rule `site-inspection`'s `published_page_fetch` applies to a caller-supplied site path, shared
 * from `platform/routing/reserved-paths.ts` rather than restated here.
 *
 * Note for a workspace that predates this gate: a stored rule whose target is now refused can
 * still be turned off with `tombstoneRedirect` (which only flips `status` and never re-validates
 * the target) or repointed with `updateRedirect` by supplying a new `toTarget`.
 *
 * An absolute target that names the workspace's OWN origin passes the host oracle trivially (its
 * own host is always allowed there), so it also gets the reserved-path rule — via the same
 * `checkSameOriginDestination` the read path applies to the interpolated `Location` (t91 B1,
 * 2026-09-16). Before this, `/admin`/`/api/...` written as an absolute same-origin target was
 * stored and simply never served, because only the read gate refused it.
 *
 * @throws {RedirectTargetNotAllowedError} Naming which half refused, and why.
 * @complexity O(n) in the target length, plus one or two `OriginRegistryPort`/`canonicalOrigin`
 * reads for absolute targets.
 */
async function assertTargetAllowed(
  originRegistry: OriginRegistryPort,
  workspaceId: string,
  target: string
): Promise<void> {
  if (!isAbsoluteOrProtocolRelative(target)) {
    const reason = siteRelativeTargetReason(target);
    if (reason === null) return;
    throw new RedirectTargetNotAllowedError(
      `toTarget '${target}' is not an allowed redirect destination: ${reason}`
    );
  }
  const ctx: RedirectTargetContext = { workspaceId };
  const allowed = await originRegistry.isAllowedRedirectTarget(ctx, target);
  if (!allowed) {
    throw new RedirectTargetNotAllowedError(`toTarget '${target}' is not an allowed redirect destination`);
  }
  // The host oracle only answers "is that host allowed" — a same-origin target passes it by
  // construction, so it still needs the reserved-path check. No try/catch around
  // canonicalOrigin: isAllowedRedirectTarget above only returns true once a canonical origin
  // exists, so a throw here is a real repo/infra error and must surface — the write does not
  // happen (fail closed), not get reworded as a target verdict.
  const verdict = checkSameOriginDestination(target, await originRegistry.canonicalOrigin(ctx));
  const reason = siteRelativeRefusalReason(verdict);
  if (reason === null) return;
  throw new RedirectTargetNotAllowedError(`toTarget '${target}' is not an allowed redirect destination: ${reason}`);
}

async function assertNoDuplicate(
  repo: RedirectRepoPort,
  workspaceId: string,
  matchType: string,
  fromPattern: string,
  excludeId?: string
): Promise<void> {
  if (matchType !== "exact") return;
  const dup = await repo.lookupExact({ workspaceId, path: fromPattern, includeOverrideOnly: false });
  if (dup && dup.id !== excludeId) {
    throw new RedirectConflictError(`an active exact rule for '${fromPattern}' already exists`);
  }
}

async function enqueueMutatedEvent(
  deps: RedirectsWriteDeps,
  record: RedirectRecord,
  change: "created" | "updated" | "tombstoned"
): Promise<void> {
  const event: RedirectMutatedEvent = {
    id: deps.idGen.newId(),
    name: `redirect.${change}`,
    occurredAt: deps.clock.nowIso(),
    aggregateId: record.id,
    workspaceId: record.workspaceId,
    actorId: record.createdByPrincipal,
    payload: { workspaceId: record.workspaceId, redirectId: record.id, change },
  };
  // `OutboxPort.enqueue`'s `DomainEvent` parameter defaults its payload generic to
  // `Record<string, unknown>`; a named `interface` payload (as opposed to a type alias/object
  // literal) isn't automatically assignable to that without an explicit index signature — the
  // same TS quirk affects every other typed-payload event in this codebase (e.g.
  // `menu-service.ts`'s `NavMenuChangedPayload`). `ports.ts`'s `RedirectMutatedEventPayload` stays
  // unchanged (ADR-PIPE-009 says `ports.ts` is frozen), so the widening is a call-site cast.
  await deps.outbox.enqueue(event as unknown as DomainEvent);
}

export interface CreateRedirectRequired {
  deps: RedirectsWriteDeps;
  input: CreateRedirectInput;
  /**
   * Provenance to stamp on the created record (REQ-01/26). Defaults to
   * `'manual'`. `importRedirects` (C-004) passes `'import'` here — this is
   * an internal parameter, not part of `CreateRedirectInput`'s public shape
   * (an API caller never chooses their own provenance).
   */
  source?: "manual" | "import";
}

/** C-001: manual-create entry point (REQ-01). */
export async function createRedirect(required: CreateRedirectRequired): Promise<{ record: RedirectRecord }> {
  const { deps, input, source = "manual" } = required;

  const patternCheck = deps.matcher.validatePattern({
    matchType: input.matchType,
    fromPattern: input.fromPattern,
  });
  if (!patternCheck.ok) throw new RedirectValidationError(patternCheck.reason);
  validateToTargetLength(input.toTarget);
  validateStatusCode(input.statusCode);
  const priority = input.priority ?? DEFAULT_PRIORITY;
  validatePriority(priority);

  await assertTargetAllowed(deps.originRegistry, input.workspaceId, input.toTarget);
  const finalTarget = await resolveCollapsedTarget(deps.repo, input.workspaceId, input.fromPattern, input.toTarget);
  if (finalTarget !== input.toTarget) {
    await assertTargetAllowed(deps.originRegistry, input.workspaceId, finalTarget);
  }
  await assertNoDuplicate(deps.repo, input.workspaceId, input.matchType, input.fromPattern);

  const now = deps.clock.nowIso();
  const id = deps.idGen.newId();
  const record: RedirectRecord = {
    id,
    workspaceId: input.workspaceId,
    matchType: input.matchType,
    fromPattern: input.fromPattern,
    toTarget: finalTarget,
    statusCode: input.statusCode,
    status: "active",
    override: input.override ?? false,
    priority,
    source,
    createdByPrincipal: input.actorId,
    createdByPluginId: input.pluginId,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  const revision: RedirectRevision = {
    redirectId: id,
    workspaceId: input.workspaceId,
    seq: 1,
    state: record,
    tombstoned: false,
    actorId: input.actorId,
    pluginId: input.pluginId,
    recordedAt: now,
  };

  await deps.transaction(async () => {
    await insertRedirectAndRevision({ db: deps.db, record, revision });
  });
  await enqueueMutatedEvent(deps, record, "created");

  return { record };
}

export interface UpdateRedirectRequired {
  deps: RedirectsWriteDeps;
  input: UpdateRedirectInput;
}

/** The PATCH-able subset of a redirect record — `updateRedirect`'s input, one field at a time,
 *  falls back to `existing`'s own value. */
type UpdatableRedirectFields = Pick<
  RedirectRecord,
  "matchType" | "fromPattern" | "toTarget" | "statusCode" | "priority" | "override" | "status"
>;

/** Merges a partial `UpdateRedirectInput` over the existing record's own values — C-002's
 *  "apply only what changed" PATCH semantics, isolated as its own defaulting decision so
 *  {@link updateRedirect} itself only has to sequence validate → write against the result. */
function resolveUpdateFields(input: UpdateRedirectInput, existing: RedirectRecord): UpdatableRedirectFields {
  return {
    matchType: input.matchType ?? existing.matchType,
    fromPattern: input.fromPattern ?? existing.fromPattern,
    toTarget: input.toTarget ?? existing.toTarget,
    statusCode: input.statusCode ?? existing.statusCode,
    priority: input.priority ?? existing.priority,
    override: input.override ?? existing.override,
    status: input.status ?? existing.status,
  };
}

/** C-002: symmetric chokepoint entry for updates (REQ-04). */
export async function updateRedirect(required: UpdateRedirectRequired): Promise<{ record: RedirectRecord }> {
  const { deps, input } = required;

  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  if (!existing) throw new RedirectNotFoundError(`redirect '${input.id}' was not found`);

  const fields = resolveUpdateFields(input, existing);

  const patternCheck = deps.matcher.validatePattern({ matchType: fields.matchType, fromPattern: fields.fromPattern });
  if (!patternCheck.ok) throw new RedirectValidationError(patternCheck.reason);
  validateToTargetLength(fields.toTarget);
  validateStatusCode(fields.statusCode);
  validatePriority(fields.priority);

  await assertTargetAllowed(deps.originRegistry, input.workspaceId, fields.toTarget);
  const finalTarget = await resolveCollapsedTarget(deps.repo, input.workspaceId, fields.fromPattern, fields.toTarget);
  if (finalTarget !== fields.toTarget) {
    await assertTargetAllowed(deps.originRegistry, input.workspaceId, finalTarget);
  }
  await assertNoDuplicate(deps.repo, input.workspaceId, fields.matchType, fields.fromPattern, existing.id);

  const now = deps.clock.nowIso();
  const version = existing.version + 1;
  const record: RedirectRecord = { ...existing, ...fields, toTarget: finalTarget, updatedAt: now, version };
  const revision: RedirectRevision = {
    redirectId: existing.id,
    workspaceId: input.workspaceId,
    seq: version,
    state: record,
    tombstoned: false,
    actorId: input.actorId,
    pluginId: input.pluginId,
    recordedAt: now,
  };

  await deps.transaction(async () => {
    await insertRedirectAndRevision({ db: deps.db, record, revision });
  });
  await enqueueMutatedEvent(deps, record, "updated");

  return { record };
}

export interface TombstoneRedirectRequired {
  deps: RedirectsWriteDeps;
  input: { workspaceId: string; id: string; actorId: string; pluginId?: string };
}

/** C-003: soft-delete (REQ-05). */
export async function tombstoneRedirect(
  required: TombstoneRedirectRequired
): Promise<{ record: RedirectRecord }> {
  const { deps, input } = required;

  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  if (!existing) throw new RedirectNotFoundError(`redirect '${input.id}' was not found`);

  if (existing.status === "disabled") {
    // Idempotent no-op: already tombstoned, no new revision needed.
    return { record: existing };
  }

  const now = deps.clock.nowIso();
  const version = existing.version + 1;
  const record: RedirectRecord = { ...existing, status: "disabled", updatedAt: now, version };
  const revision: RedirectRevision = {
    redirectId: existing.id,
    workspaceId: input.workspaceId,
    seq: version,
    state: record,
    tombstoned: true,
    actorId: input.actorId,
    pluginId: input.pluginId,
    recordedAt: now,
  };

  await deps.transaction(async () => {
    await insertRedirectAndRevision({ db: deps.db, record, revision });
  });
  await enqueueMutatedEvent(deps, record, "tombstoned");

  return { record };
}

export interface ImportRedirectsRequired {
  deps: RedirectsWriteDeps;
  input: { workspaceId: string; actorId: string; rules: CreateRedirectInput[] };
}

export interface ImportRedirectsFailure {
  index: number;
  code: string;
  message: string;
}

function errorToCode(err: unknown): string {
  if (err instanceof RedirectValidationError) return "REDIRECT_VALIDATION_ERROR";
  if (err instanceof RedirectTargetNotAllowedError) return "REDIRECT_TARGET_NOT_ALLOWED";
  if (err instanceof RedirectConflictError) return "REDIRECT_CONFLICT";
  if (err instanceof RedirectLoopError) return "REDIRECT_LOOP_DETECTED";
  return "INTERNAL_ERROR";
}

/**
 * C-004: batch-create reusing the same chokepoint, no bypass (REQ-26). Each
 * item is processed independently through `createRedirect` — NOT one shared
 * transaction across items (EC-08); a per-item failure does not abort
 * already-written prior items.
 */
export async function importRedirects(
  required: ImportRedirectsRequired
): Promise<{ created: RedirectRecord[]; failed: ImportRedirectsFailure[] }> {
  const { deps, input } = required;

  if (input.rules.length < 1 || input.rules.length > MAX_IMPORT_BATCH_SIZE) {
    throw new RedirectValidationError(
      `import batch size must be 1-${MAX_IMPORT_BATCH_SIZE} (got ${input.rules.length})`
    );
  }

  const created: RedirectRecord[] = [];
  const failed: ImportRedirectsFailure[] = [];

  for (let index = 0; index < input.rules.length; index++) {
    const rule = input.rules[index];
    try {
      const { record } = await createRedirect({
        deps,
        input: { ...rule, workspaceId: input.workspaceId, actorId: input.actorId },
        source: "import",
      });
      created.push(record);
    } catch (err) {
      failed.push({
        index,
        code: errorToCode(err),
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { created, failed };
}
