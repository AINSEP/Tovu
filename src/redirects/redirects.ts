/**
 * @file THE `redirects` write chokepoint (SPEC-009 REQ-01/04/05/06/07/08/13/
 * 14/22/26; ADR-PIPE-009 C-001..C-004).
 *
 * Purpose:
 * `createRedirect`/`updateRedirect`/`tombstoneRedirect`/`importRedirects` —
 * the single manual-write entry point for redirect rules. Validates the
 * pattern (via `RedirectMatcher.validatePattern`), rejects unsafe absolute
 * targets (write-path open-redirect oracle, REQ-08), collapses/rejects
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
import type { ClockPort, DomainEvent, IdGeneratorPort, OutboxPort } from "../core/ports";
import type { OriginRegistryPort, RedirectTargetContext } from "../origin";

import { insertRedirectAndRevision, type RedirectDbHandle } from "./ports.internal";
import type { RedirectMatcher, RedirectMutatedEvent, RedirectRepoPort } from "./ports";
import {
  RedirectConflictError,
  RedirectLoopError,
  RedirectNotFoundError,
  RedirectTargetNotAllowedError,
  RedirectValidationError,
} from "./types";
import type {
  CreateRedirectInput,
  RedirectRecord,
  RedirectRevision,
  RedirectStatusCode,
  UpdateRedirectInput,
} from "./types";

const MIN_TARGET_LENGTH = 1;
const MAX_TARGET_LENGTH = 2048;
const MIN_PRIORITY = 0;
const MAX_PRIORITY = 1000;
const DEFAULT_PRIORITY = 0;
const VALID_STATUS_CODES: readonly RedirectStatusCode[] = [301, 302, 307, 308];
const MAX_IMPORT_BATCH_SIZE = 500;

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

async function assertTargetAllowed(
  originRegistry: OriginRegistryPort,
  workspaceId: string,
  target: string
): Promise<void> {
  if (!isAbsoluteOrProtocolRelative(target)) return;
  const ctx: RedirectTargetContext = { workspaceId };
  const allowed = await originRegistry.isAllowedRedirectTarget(ctx, target);
  if (!allowed) {
    throw new RedirectTargetNotAllowedError(`toTarget '${target}' is not an allowed redirect destination`);
  }
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

/** C-002: symmetric chokepoint entry for updates (REQ-04). */
export async function updateRedirect(required: UpdateRedirectRequired): Promise<{ record: RedirectRecord }> {
  const { deps, input } = required;

  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  if (!existing) throw new RedirectNotFoundError(`redirect '${input.id}' was not found`);

  const matchType = input.matchType ?? existing.matchType;
  const fromPattern = input.fromPattern ?? existing.fromPattern;
  const toTarget = input.toTarget ?? existing.toTarget;
  const statusCode = input.statusCode ?? existing.statusCode;
  const priority = input.priority ?? existing.priority;
  const override = input.override ?? existing.override;
  const status = input.status ?? existing.status;

  const patternCheck = deps.matcher.validatePattern({ matchType, fromPattern });
  if (!patternCheck.ok) throw new RedirectValidationError(patternCheck.reason);
  validateToTargetLength(toTarget);
  validateStatusCode(statusCode);
  validatePriority(priority);

  await assertTargetAllowed(deps.originRegistry, input.workspaceId, toTarget);
  const finalTarget = await resolveCollapsedTarget(deps.repo, input.workspaceId, fromPattern, toTarget);
  if (finalTarget !== toTarget) {
    await assertTargetAllowed(deps.originRegistry, input.workspaceId, finalTarget);
  }
  await assertNoDuplicate(deps.repo, input.workspaceId, matchType, fromPattern, existing.id);

  const now = deps.clock.nowIso();
  const version = existing.version + 1;
  const record: RedirectRecord = {
    ...existing,
    matchType,
    fromPattern,
    toTarget: finalTarget,
    statusCode,
    status,
    override,
    priority,
    updatedAt: now,
    version,
  };
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
