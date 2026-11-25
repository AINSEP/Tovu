import { buildDomainRegistrations, indexCatalogById, ToolInputError, type DerivedRiskByToolId, type ToolContributor, type ToolExecutionContext, type ToolExecutionOptions, type ToolRegistration } from "@jini-ai/core";
import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import type { RoutineActor, RoutineAvailability } from "@tovu/contracts/routines";

import { notConfirmedResult, type requireHumanConfirm as RequireHumanConfirm } from "../../contracts/core/human-confirm.js";
import { type HumanConfirmOutcome } from "@jini-ai/daemon/surface-exchanges/human-confirm";
import { toolMetadata } from "../../contracts/core/tool-metadata/routines.js";
import type { ChatDeleteSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { ROUTINE_AVAILABILITY_REFUSALS, type RoutineCommands } from "./routine-commands.js";

/**
 * @file The four routine tools, thin wrappers over the serving site's own `RoutineCommands`.
 *
 * Why thin: the site owns the one routine store and the owner gate; the daemon only transports the
 * authorized call. These handlers add exactly three things the commands do not know about a chat:
 * the tool-facing schemas, the human-confirm card (opened INSIDE each writer because the metadata is
 * `direct`, so no remembered grant can stand in for it), and a stale-row guard so what the owner
 * sees on the card is what gets written (the store's transactional `expectedRevision`).
 */

export const ROUTINE_LIST_TOOL_ID = "routine_list";
export const ROUTINE_CREATE_TOOL_ID = "routine_create";
export const ROUTINE_SET_ENABLED_TOOL_ID = "routine_set_enabled";
export const ROUTINE_DELETE_TOOL_ID = "routine_delete";
const DOMAIN = "routines";
const PERMISSION = "admin.assistant.use";

/** The English keys double as the copy lookup keys; the host binds them to the operator's locale (`approvalText`). */
export type RoutineCopyKey = "Create routine" | "Pause routine" | "Resume routine" | "Delete routine" | "Schedule" | "Prompt" | "Agent" | "Model"
  | "This routine runs only while Tovu is open and your computer is awake";
export type RoutineCopy = (required: { key: RoutineCopyKey }, optional?: Record<string, never>) => string;
/** Default copy: the English keys themselves. */
export const ROUTINE_TOOL_COPY: RoutineCopy = ({ key }) => key;

const NOTHING_CHANGED = "Nothing was changed.";
const STALE = "This routine changed since you looked. List routines again.";
const NOT_OWNER = "Only the site owner can manage routines.";

const ROUTINE_BLURB = "A routine is a recurring AI job that runs only while Tovu desktop is open and the computer is awake.";
const SCHEDULE_SCHEMA = {
  type: "object",
  description: "hourly needs `minute` (0-59, a minute past the hour). daily and weekdays need `time` (HH:MM) and an IANA `timezone`. weekly also needs `weekday`.",
  properties: {
    kind: { enum: ["hourly", "daily", "weekdays", "weekly"] }, minute: { type: "integer" }, time: { type: "string" },
    timezone: { type: "string" }, weekday: { type: "string" },
  },
  required: ["kind"],
} as const;
const DETAIL = { sideEffects: "mutates-durable-state" as const, authorization: { permission: PERMISSION } };

const catalog = indexCatalogById({ catalog: [
  { name: ROUTINE_LIST_TOOL_ID, description: `Lists the owner's routines with their current revision. ${ROUTINE_BLURB}`,
    sideEffects: "none" as const, authorization: { permission: PERMISSION }, inputSchema: { type: "object", additionalProperties: false, properties: {} } },
  { name: ROUTINE_CREATE_TOOL_ID, ...DETAIL, description: `Creates a routine after the owner confirms a card. ${ROUTINE_BLURB} Hourly schedules pick a minute past the hour; daily, weekdays and weekly schedules require a timezone.`,
    inputSchema: { type: "object", additionalProperties: false, required: ["name", "prompt", "schedule"],
      properties: { name: { type: "string" }, prompt: { type: "string" }, schedule: SCHEDULE_SCHEMA, agentId: { type: "string" }, model: { type: "string" } } } },
  { name: ROUTINE_SET_ENABLED_TOOL_ID, ...DETAIL, description: "Pauses or resumes a routine after the owner confirms a card. Pass the `revision` from routine_list.",
    inputSchema: { type: "object", additionalProperties: false, required: ["id", "enabled", "revision"],
      properties: { id: { type: "string" }, enabled: { type: "boolean" }, revision: { type: "integer" } } } },
  { name: ROUTINE_DELETE_TOOL_ID, ...DETAIL, description: "Deletes a routine after the owner confirms a card. Pass the `revision` from routine_list. An already running run is not stopped.",
    inputSchema: { type: "object", additionalProperties: false, required: ["id", "revision"], properties: { id: { type: "string" }, revision: { type: "integer" } } } },
] });
export const routineDerivedRisk: DerivedRiskByToolId = new Map([
  [ROUTINE_LIST_TOOL_ID, "none"], [ROUTINE_CREATE_TOOL_ID, "mutates-durable-state"],
  [ROUTINE_SET_ENABLED_TOOL_ID, "mutates-durable-state"], [ROUTINE_DELETE_TOOL_ID, "mutates-durable-state"],
]);

type ScheduleValidator = (required: { schedule: never }, optional?: Record<string, never>) => void;
/** Who may see and use the tools: the live owner of this mounted workspace, resolved from the trusted principal only. */
type OwnerResolver = (required: { principalId: string }, optional?: Record<string, never>) => Promise<RoutineActor | null>;

export interface RoutineToolHost {
  commands: Pick<RoutineCommands, "list" | "get" | "create" | "setEnabled" | "delete">;
  /** Jini's `validateSchedule` (throws a plain Error); wrapped so the owner gets the sentence, not a stack. */
  validateSchedule: ScheduleValidator;
  resolveOwnerActor: OwnerResolver;
  /** Read live on every call: the lease or assistant switch can change while a card is open. */
  availability: () => RoutineAvailability;
  copy: RoutineCopy;
}
export interface RoutineToolsRequired extends RoutineToolHost {
  requireHumanConfirm: typeof RequireHumanConfirm;
}
export interface RoutineToolDeps { workspaceId: string; authorize: AuthorizeFn }

type Refusal = { error: string };
type Input = Record<string, unknown>;

const asText = (value: unknown): string | null => typeof value === "string" && value.trim() !== "" ? value : null;
const optionalText = (value: unknown): string | undefined => asText(value) ?? undefined;
const isStale = (error: unknown): boolean =>
  (error as { apiError?: { details?: { reason?: string } } } | null)?.apiError?.details?.reason === "ROUTINE_CHANGED";

/** The shared guards every handler runs before disclosing or writing anything. */
function makeGuards({ resolveOwnerActor, availability }: Pick<RoutineToolHost, "resolveOwnerActor" | "availability">) {
  /** Owner first (a non-owner learns nothing, not even readiness), then readiness. */
  return async function guard(ctx: ToolExecutionContext): Promise<{ actor: RoutineActor } | Refusal> {
    const actor = await resolveOwnerActor({ principalId: ctx.principal.id }, {});
    if (!actor) return { error: NOT_OWNER };
    const state = availability();
    if (state !== "ready") return { error: ROUTINE_AVAILABILITY_REFUSALS[state].message };
    return { actor };
  };
}
type Guard = ReturnType<typeof makeGuards>;
const refused = (value: { actor: RoutineActor } | Refusal): value is Refusal => "error" in value;

type Flag = "created" | "changed" | "deleted";
type Answer = HumanConfirmOutcome | { confirmed: false; reason: "no-channel" };
/** A run with no card channel can ask no one: that is a no-change answer, not an error. Anything else propagates. */
function noChannelAnswer(error: unknown): Answer {
  if (error instanceof Error && error.message.includes("_NO_CONFIRMATION_CHANNEL")) return { confirmed: false, reason: "no-channel" };
  throw error;
}

/** Scheduling errors come back as one plain sentence; the card is never opened for an invalid schedule. */
function checkSchedule(host: Pick<RoutineToolHost, "validateSchedule">, schedule: unknown): string | null {
  try { host.validateSchedule({ schedule: schedule as never }, {}); return null; }
  catch (error) { return `That schedule is not valid: ${error instanceof Error ? error.message : "check the time and timezone"}.`; }
}

function describeSchedule(schedule: unknown): string {
  const s = (schedule ?? {}) as Record<string, unknown>;
  if (s.kind === "hourly") return `Every hour at ${String(s.minute).padStart(2, "0")} minutes past`;
  const days = s.kind === "weekdays" ? "weekdays" : s.kind === "weekly" ? `every ${String(s.weekday)}` : "every day";
  return `${days} at ${String(s.time)} (${String(s.timezone)})`;
}

type CardFields = Pick<import("@jini-ai/core/contracts/site/human-confirm").HumanConfirmSpec, "errorCode" | "title" | "description" | "details" | "confirmLabel" | "danger">;
type Row = { id?: string; name?: string; prompt?: string; schedule?: unknown; agentId?: string | null; model?: string | null; enabled?: boolean; revision?: number };

/** Card body: the facts the owner is approving, in their language through `copy`. */
function cardFields({ copy, title, row, danger = false }: { copy: RoutineCopy; title: RoutineCopyKey; row: Row; danger?: boolean }): CardFields {
  const label = (key: RoutineCopyKey) => copy({ key }, {});
  return {
    errorCode: "ROUTINES", title: label(title), confirmLabel: label(title), danger,
    description: `${row.name ?? ""}\n${label("This routine runs only while Tovu is open and your computer is awake")}`.trim(),
    details: [
      { label: label("Schedule"), value: describeSchedule(row.schedule) }, { label: label("Prompt"), value: row.prompt ?? "" },
      { label: label("Agent"), value: row.agentId ?? "Default" }, { label: label("Model"), value: row.model ?? "Default" },
    ],
  };
}

/** Read the exact row the owner will see; a revision that already moved is refused before any card. */
async function readShownRow({ host, actor, id, revision }: { host: RoutineToolHost; actor: RoutineActor; id: string; revision: number }): Promise<{ row: Row } | Refusal> {
  const found = await host.commands.get({ actor, id }, {});
  if (!found.ok) return { error: found.message };
  const row = found.routine as unknown as Row;
  return row.revision === revision ? { row } : { error: STALE };
}

type Tools = { host: RoutineToolHost; requireHumanConfirm: typeof RequireHumanConfirm; guard: Guard; surfaces: ChatDeleteSurfaceDeps };
type Call = { ctx: ToolExecutionContext; options: ToolExecutionOptions };

/**
 * After the card: not confirmed means nothing changed; confirmed means the owner must STILL be the
 * owner and the site still ready (revoked or parked while the card was open) before the write.
 */
async function settle({ guard }: Pick<Tools, "guard">, { ctx, answer, flag }: { ctx: ToolExecutionContext; answer: Answer; flag: Flag }): Promise<{ actor: RoutineActor } | Record<string, unknown>> {
  if (!answer.confirmed) {
    if (answer.reason === "no-channel") return { [flag]: false, cancelled: false, note: `No confirmation card could be shown here. ${NOTHING_CHANGED}` };
    return { [flag]: false, ...notConfirmedResult(answer) };
  }
  const again = await guard(ctx);
  return refused(again) ? { [flag]: false, cancelled: false, note: `${again.error} ${NOTHING_CHANGED}` } : again;
}
const proceed = (value: object): value is { actor: RoutineActor } => "actor" in value;

/** Store refusals: stale is one plain sentence and is never retried; everything else propagates unchanged. */
function writeFailure(error: unknown): Refusal {
  if (isStale(error)) return { error: STALE };
  throw error;
}

async function listHandler({ host, guard }: Tools, { ctx }: Call) {
  const checked = await guard(ctx);
  if (refused(checked)) return checked;
  const result = await host.commands.list({ actor: checked.actor }, {});
  return result.ok ? { routines: result.routines, availability: result.availability } : { error: result.message };
}

async function createHandler({ host, requireHumanConfirm, guard, surfaces }: Tools, { ctx, options }: Call) {
  const checked = await guard(ctx);
  if (refused(checked)) return { created: false, ...checked };
  const input = ctx.input as Input;
  const name = asText(input.name); const prompt = asText(input.prompt);
  if (!name || !prompt) return { created: false, error: "A routine needs a name and a prompt." };
  const invalid = checkSchedule(host, input.schedule);
  if (invalid) return { created: false, error: invalid };
  const draft = { name, prompt, schedule: input.schedule, agentId: optionalText(input.agentId), model: optionalText(input.model) };
  const answer = await requireHumanConfirm({ ctx, surfaces, spec: { toolId: ROUTINE_CREATE_TOOL_ID, ...cardFields({ copy: host.copy, title: "Create routine", row: draft }) } }, options).catch(noChannelAnswer);
  const allowed = await settle({ guard }, { ctx, answer, flag: "created" });
  if (!proceed(allowed)) return allowed;
  const result = await host.commands.create({ actor: allowed.actor, draft }, {});
  return result.ok ? { created: true, routine: result.routine } : { created: false, error: result.message };
}

/** The id and revision a pause/resume/delete names, or null when the model left either out. */
function readTarget(input: Input): { id: string; revision: number } | null {
  const id = asText(input.id);
  return id && typeof input.revision === "number" ? { id, revision: input.revision } : null;
}

async function setEnabledHandler({ host, requireHumanConfirm, guard, surfaces }: Tools, { ctx, options }: Call) {
  const checked = await guard(ctx);
  if (refused(checked)) return { changed: false, ...checked };
  const input = ctx.input as Input; const target = readTarget(input);
  if (!target || typeof input.enabled !== "boolean") return { changed: false, error: "Pass the routine id, enabled and the revision from routine_list." };
  const shown = await readShownRow({ host, actor: checked.actor, ...target });
  if ("error" in shown) return { changed: false, ...shown };
  const title = input.enabled ? "Resume routine" : "Pause routine";
  const answer = await requireHumanConfirm({ ctx, surfaces, spec: { toolId: ROUTINE_SET_ENABLED_TOOL_ID, ...cardFields({ copy: host.copy, title, row: shown.row }) } }, options).catch(noChannelAnswer);
  const allowed = await settle({ guard }, { ctx, answer, flag: "changed" });
  if (!proceed(allowed)) return allowed;
  try {
    const result = await host.commands.setEnabled({ actor: allowed.actor, id: target.id, enabled: input.enabled }, { expectedRevision: target.revision });
    return result.ok ? { changed: true, routine: result.routine } : { changed: false, error: result.message };
  } catch (error) { return { changed: false, ...writeFailure(error) }; }
}

async function deleteHandler({ host, requireHumanConfirm, guard, surfaces }: Tools, { ctx, options }: Call) {
  const checked = await guard(ctx);
  if (refused(checked)) return { deleted: false, ...checked };
  const target = readTarget(ctx.input as Input);
  if (!target) return { deleted: false, error: "Pass the routine id and the revision from routine_list." };
  const shown = await readShownRow({ host, actor: checked.actor, ...target });
  if ("error" in shown) return { deleted: false, ...shown };
  const answer = await requireHumanConfirm({ ctx, surfaces, spec: { toolId: ROUTINE_DELETE_TOOL_ID, ...cardFields({ copy: host.copy, title: "Delete routine", row: shown.row, danger: true }) } }, options).catch(noChannelAnswer);
  const allowed = await settle({ guard }, { ctx, answer, flag: "deleted" });
  if (!proceed(allowed)) return allowed;
  try {
    const result = await host.commands.delete({ actor: allowed.actor, id: target.id }, { expectedRevision: target.revision });
    return result.ok ? { deleted: true } : { deleted: false, error: result.message };
  } catch (error) { return { deleted: false, ...writeFailure(error) }; }
}

/** The discovery rule the BYOK surface applies per principal: the live owner of a ready site, and no one else. */
export function createRoutineToolDiscovery({ resolveOwnerActor, availability }: Pick<RoutineToolHost, "resolveOwnerActor" | "availability">, _optional = {}) {
  return {
    isVisible: async ({ principalId }: { principalId: string }, _inner: Record<string, never> = {}): Promise<boolean> =>
      availability() === "ready" && (await resolveOwnerActor({ principalId }, {})) !== null,
  };
}
export type RoutineToolDiscovery = ReturnType<typeof createRoutineToolDiscovery>;

/**
 * The `routines` domain contributor. Installed only when the host supplies the bound commands, so a
 * site without the routines host (web-only, flag off) never registers these four ids at all.
 * `surfaces` arrive at `build` (the guarded surfaces that include `assertAccessApprover`), exactly
 * like every other contributor, rather than at construction.
 */
export function contributeRoutineTools(required: RoutineToolsRequired, _optional = {}): ToolContributor<RoutineToolDeps, ChatDeleteSurfaceDeps> {
  const { requireHumanConfirm, ...host } = required;
  const guard = makeGuards(host);
  return {
    domain: DOMAIN, risk: routineDerivedRisk,
    build: (_deps, surfaces): ToolRegistration[] => {
      const tools: Tools = { host, requireHumanConfirm, guard, surfaces };
      const handlers = { [ROUTINE_LIST_TOOL_ID]: listHandler, [ROUTINE_CREATE_TOOL_ID]: createHandler,
        [ROUTINE_SET_ENABLED_TOOL_ID]: setEnabledHandler, [ROUTINE_DELETE_TOOL_ID]: deleteHandler };
      return buildDomainRegistrations({
        domain: DOMAIN, catalogModule: "features/routines/routine-tool-registrations.ts", catalog, derivedRisk: routineDerivedRisk, metadata: toolMetadata,
        handlers: Object.fromEntries(Object.entries(handlers).map(([id, handler]) =>
          [id, async (ctx: ToolExecutionContext, options: ToolExecutionOptions = {}) => {
            if (!ctx.principal?.id) throw new ToolInputError({ message: `${id}: no signed-in principal.` });
            return handler(tools, { ctx, options });
          }])),
      });
    },
  };
}
