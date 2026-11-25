import type { RoutineRow, RoutineRunSummary } from "@jini-ai/core/contracts/site/routines";
import type { Routine, RoutineCreateInput, RoutineRun, RoutineService, RoutineStore, RoutineUpdateInput } from "@jini-ai/daemon";
import type { RoutineActor, RoutineAvailability, RoutineTarget } from "@tovu/contracts/routines";

/**
 * @file The owner command gate for routines: the one place admin routes (and later owner chat) change
 * routine state.
 *
 * Why commands re-check access themselves: a session is not proof of ownership, and a route guard
 * can be mis-mounted. Every command asks the injected `access` binding (mounted workspace + live
 * owner authority) with the trusted actor before doing anything, and a missing binding is a denial
 * by construction because the composition root must pass one.
 *
 * Why scheduling moves only after the store resolves: the store is the authority. Rescheduling first
 * would arm a timer for a write that may still be refused (stale revision, invalid schedule, full
 * disk), and the next fire would then act on a row that never changed.
 *
 * Store refusals (stale revision, invalid schedule, active run, busy) propagate unchanged so the
 * route layer keeps J2.J's status and reason mapping; this gate maps only what it decides itself:
 * permission, availability and a missing routine.
 */

export type RoutineAccess = (required: { actor: RoutineActor }, optional?: Record<string, never>) => Promise<boolean>;

export type RoutineCommandKind = "create" | "update" | "setEnabled" | "delete";

/** A plain refusal the route turns into a JSON error; `message` is shown to the owner as-is. */
export type RoutineRefusal = Readonly<{ ok: false; status: number; reason: string; message: string; availability?: RoutineAvailability }>;

type NotReady = Exclude<RoutineAvailability, "ready">;

/** The stable `details.reason` and plain sentence for each non-ready availability (sheet P3-T1a.T step 6). */
export const ROUTINE_AVAILABILITY_REFUSALS: Readonly<Record<NotReady, Readonly<{ reason: string; message: string }>>> = {
  "desktop-only": { reason: "ROUTINES_UNAVAILABLE", message: "Routines run only while the desktop app is open." },
  "assistant-off": { reason: "ROUTINES_ASSISTANT_OFF", message: "Turn on the AI assistant to run routines." },
  "other-window": { reason: "ROUTINES_LEASE_HELD", message: "Routines for this site are running in another Tovu window." },
  error: { reason: "ROUTINES_STORE_OPEN_FAILED", message: "Routines are unavailable because their data file could not be opened." },
};

const FORBIDDEN: RoutineRefusal = { ok: false, status: 403, reason: "ROUTINES_FORBIDDEN", message: "Only the site owner can manage routines." };
const NOT_FOUND: RoutineRefusal = { ok: false, status: 404, reason: "ROUTINE_NOT_FOUND", message: "That routine no longer exists." };

/** The routine fields a caller may set. Owner, creator, target and context-free identity fields are absent on purpose. */
const DRAFT_FIELDS = ["name", "prompt", "schedule", "skillId", "agentId", "model", "context", "enabled"] as const;
const PATCH_FIELDS = ["name", "prompt", "schedule", "skillId", "agentId", "model", "context"] as const;
const SUMMARY_FIELDS = ["runId", "trigger", "status", "startedAt", "completedAt", "projectId", "conversationId", "agentRunId",
  "assistantMessageId", "agentId", "model", "summary", "error", "errorCode", "catchUp", "slotAt", "approvalState", "approvalSince"] as const;

const ABSENT_WHEN_NULL = ["completedAt", "summary", "error", "errorCode"] as const;

export type RoutineDraft = Readonly<Partial<Record<(typeof DRAFT_FIELDS)[number], unknown>>>;
export type RoutinePatch = Readonly<Partial<Record<(typeof PATCH_FIELDS)[number], unknown>>>;

export interface RoutineCommandsRequired {
  store: Pick<RoutineStore, "list" | "get" | "create" | "update" | "setEnabled" | "delete" | "listRuns">;
  service: Pick<RoutineService, "rescheduleOne" | "unschedule" | "runNow">;
  access: RoutineAccess;
  /** Runs after every committed config write (the beacon writer). Its failure is logged, never surfaced. */
  onCommandCommitted: (required: { kind: RoutineCommandKind; routineId: string }, optional?: Record<string, never>) => unknown;
  /** Read live on every command: the lease or the assistant switch can change while the site is up. */
  availability: () => RoutineAvailability;
  /** From host composition only; a request body can never override it. */
  target: RoutineTarget;
}

export interface RoutineCommandsOptional {
  log?: (entry: { event: string; error: unknown; routineId?: string }) => void;
}

function pick<K extends string>(source: unknown, keys: readonly K[]): Partial<Record<K, unknown>> {
  const record = (source ?? {}) as Record<string, unknown>;
  const out: Partial<Record<K, unknown>> = {};
  for (const key of keys) if (record[key] !== undefined) out[key] = record[key];
  return out;
}

/** Public run summary: an allowlist, so holder, approval exchange ref and anything added later stay private. */
export function toRunSummary(run: RoutineRun | Readonly<Record<string, unknown>>): RoutineRunSummary {
  const record = run as Record<string, unknown>;
  const summary = pick({ ...record, runId: record["runId"] ?? record["id"] }, SUMMARY_FIELDS);
  // The shared contract types these as optional non-null; a stored null means "absent".
  for (const key of ABSENT_WHEN_NULL) if (summary[key] === null) delete summary[key];
  return summary as unknown as RoutineRunSummary;
}

/** Public routine row: context selection (skills/plugins/MCP/connectors) is never exposed. */
export function toRoutineRow(routine: Routine): RoutineRow {
  const { context: _context, lastRun, ...rest } = routine;
  const row = pick(rest, ["id", "name", "prompt", "schedule", "target", "skillId", "agentId", "model", "creatorId", "enabled",
    "nextRunAt", "revision", "createdAt", "updatedAt"]);
  return { ...row, lastRun: lastRun ? toRunSummary(lastRun as Record<string, unknown>) : null } as unknown as RoutineRow;
}

type CommandLog = NonNullable<RoutineCommandsOptional["log"]>;

/** Permission first (a non-owner learns nothing about availability), then readiness. */
function makeGate({ access, availability }: Pick<RoutineCommandsRequired, "access" | "availability">) {
  return async function gate(actor: RoutineActor): Promise<RoutineRefusal | null> {
    if (!(await access({ actor }, {}))) return FORBIDDEN;
    const state = availability();
    if (state === "ready") return null;
    return { ok: false, status: 503, ...ROUTINE_AVAILABILITY_REFUSALS[state], availability: state };
  };
}

/** Post-commit effects: each isolated, so a timer or beacon failure cannot misreport the committed write. */
function makeAfterCommit({ service, onCommandCommitted, log }: Pick<RoutineCommandsRequired, "service" | "onCommandCommitted"> & { log: CommandLog }) {
  return function afterCommit(kind: RoutineCommandKind, routineId: string, schedule: "reschedule" | "unschedule"): void {
    try {
      if (schedule === "reschedule") service.rescheduleOne({ routineId }, {}); else service.unschedule({ routineId });
    } catch (error) { log({ event: "routine-schedule-after-commit-failed", error, routineId }); }
    try {
      const result = onCommandCommitted({ kind, routineId }, {});
      if (result instanceof Promise) result.catch((error: unknown) => log({ event: "routine-commit-hook-failed", error, routineId }));
    } catch (error) { log({ event: "routine-commit-hook-failed", error, routineId }); }
  };
}

export function createRoutineCommands(required: RoutineCommandsRequired, optional: RoutineCommandsOptional = {}) {
  const { store, service, access, onCommandCommitted, availability, target } = required;
  const { log = (entry: Parameters<CommandLog>[0]) => console.warn("[routines]", entry.event, entry.error) } = optional;

  const gate = makeGate({ access, availability });
  const afterCommit = makeAfterCommit({ service, onCommandCommitted, log });

  const settled = (kind: RoutineCommandKind, routine: Routine | null) => {
    if (!routine) return NOT_FOUND;
    afterCommit(kind, routine.id, routine.enabled ? "reschedule" : "unschedule");
    return { ok: true as const, routine: toRoutineRow(routine) };
  };

  return {
    async list({ actor }: { actor: RoutineActor }, _optional = {}) {
      const refusal = await gate(actor);
      if (refusal) return refusal;
      const routines = (await store.list({}, {})).map(toRoutineRow);
      return { ok: true as const, routines, availability: "ready" as const };
    },
    async get({ actor, id }: { actor: RoutineActor; id: string }, _optional = {}) {
      const refusal = await gate(actor);
      if (refusal) return refusal;
      const routine = await store.get({ id }, {});
      return routine ? { ok: true as const, routine: toRoutineRow(routine) } : NOT_FOUND;
    },
    async create({ actor, draft }: { actor: RoutineActor; draft: RoutineDraft }, _optional = {}) {
      const refusal = await gate(actor);
      if (refusal) return refusal;
      const { name, prompt, schedule, ...rest } = pick(draft, DRAFT_FIELDS);
      // Creator is stamped once, here, from the authenticated actor; the body's owner/creator/target are never read.
      const input = { name, prompt, schedule, target } as RoutineCreateInput;
      const routine = await store.create(input, { ...(rest as object), creatorId: actor.principalId });
      return settled("create", routine);
    },
    async update({ actor, id, patch }: { actor: RoutineActor; id: string; patch: RoutinePatch }, { expectedRevision }: { expectedRevision?: number } = {}) {
      const refusal = await gate(actor);
      if (refusal) return refusal;
      const routine = await store.update({ id, patch: pick(patch, PATCH_FIELDS) as RoutineUpdateInput }, { expectedRevision });
      return settled("update", routine);
    },
    async setEnabled({ actor, id, enabled }: { actor: RoutineActor; id: string; enabled: boolean }, { expectedRevision }: { expectedRevision?: number } = {}) {
      const refusal = await gate(actor);
      if (refusal) return refusal;
      return settled("setEnabled", await store.setEnabled({ id, enabled }, { expectedRevision }));
    },
    async delete({ actor, id }: { actor: RoutineActor; id: string }, { expectedRevision }: { expectedRevision?: number } = {}) {
      const refusal = await gate(actor);
      if (refusal) return refusal;
      // Deleting stops future slots only; an already active run finishes on its own.
      if (!(await store.delete({ id }, { expectedRevision }))) return NOT_FOUND;
      afterCommit("delete", id, "unschedule");
      return { ok: true as const };
    },
    async runNow({ actor, id }: { actor: RoutineActor; id: string }, _optional = {}) {
      const refusal = await gate(actor);
      if (refusal) return refusal;
      if (!(await store.get({ id }, {}))) return NOT_FOUND;
      const { projectId, conversationId, agentRunId } = await service.runNow({ routineId: id });
      return { ok: true as const, run: { projectId, conversationId, agentRunId } };
    },
    async listRuns({ actor, id }: { actor: RoutineActor; id: string }, { cursor, limit }: { cursor?: string | null; limit?: number } = {}) {
      const refusal = await gate(actor);
      if (refusal) return refusal;
      if (!(await store.get({ id }, {}))) return NOT_FOUND;
      const page = await store.listRuns({ routineId: id }, { cursor, limit });
      return { ok: true as const, runs: page.items.map(toRunSummary), nextCursor: page.nextCursor };
    },
  };
}

export type RoutineCommands = ReturnType<typeof createRoutineCommands>;
