import { RoutineService, type RoutineDurablePersistence, type RoutineRunHandler, type RoutineStore } from "@jini-ai/daemon";
import { migrateJiniRoutines } from "@jini-ai/daemon/routines/sqlite";
import {
  createRoutineCreateRoute, createRoutineDeleteRoute, createRoutineGetRoute, createRoutineListRoute,
  createRoutineRunNowRoute, createRoutineRunsRoute, createRoutineUpdateRoute,
} from "@jini-ai/daemon/http";
import { runMigrations as defaultRunMigrations } from "@jini-ai/db/migrate";
import { ClientFacingError, err, type JsonRouteSpec, type RouteInputContext } from "@jini-ai/core/contracts/server";
import type { RoutineActor, RoutineAvailability, RoutineTarget } from "@tovu/contracts/routines";
import {
  ROUTINE_AVAILABILITY_REFUSALS, createRoutineCommands, toRunSummary,
  type RoutineAccess, type RoutineCommands, type RoutineRefusal,
} from "#src/features/routines/routine-commands";
import { closeRoutineHost, openRoutineSidecar } from "#src/features/routines/routine-host";
import { routinesPaths } from "#src/features/routines/routines-paths";
import { reportServerFailure } from "#src/server/inbound/shared/admin-failure";
import { createRoutineApprovalObserver, type RoutineApprovalObserver } from "#src/features/routines/routine-approval-observer";
import type { OpenRoutinesSqlite } from "#src/platform/db/sqlite/routines-db";
import type { StoreCloseRegistration } from "../site-deps/open-store.js";

/**
 * @file Composition of the serving-site routine host (P3-T1a.T): eligibility gate, sidecar open,
 * scheduler start/stop with the assistant switch, safe close, and the admin routes.
 *
 * Why every input is injected: the caller (W/index → createServingApp) reads the boot policy once;
 * this module never imports the local-owner singleton or rereads the scrubbed env, so each boot shape
 * (desktop, standalone, assistant off, passive window, open failure) is testable without Express.
 */

/** The parent's timer port (`SchedulerPort`): the scheduler, the drain bound and tests share one clock. */
export interface RoutineTimers { schedule(args: { readonly delayMs: number; readonly callback: () => void }): () => void }
type Log = (entry: { event: string; error: unknown }) => void;
/** What `authenticate` returns on an admin mount; only these two fields are read. */
type AdminPrincipal = Readonly<{ id: string; workspaceId: string }>;
type AnySpec = JsonRouteSpec<unknown, unknown, unknown, unknown>;
export type MountRoutineAdminRoute = (
  required: { spec: JsonRouteSpec<unknown, unknown, Record<string, never>, AdminPrincipal>; deps: { workspaceId: string } },
  optional: { sessionCredentialOnly: { message: string; permission: string } },
) => void;

export interface ComposeAssistantRoutinesRequired {
  /** Only `desktopEligible` from `LocalOwnerSignInPolicy.routineDesktopEligible`; env presence never counts. */
  launch: { desktopEligible: boolean };
  workspaceId: string;
  contentDbPath: string;
  openSqlite: OpenRoutinesSqlite;
  beforeStoreClose: (required: { drain: () => Promise<void> }, optional?: Record<string, never>) => void;
  onStoreClose: (required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void;
  assistantEnabled: boolean;
  onAssistantToggle: (listener: (enabled: boolean) => void) => () => void;
  runStarter: RoutineRunHandler;
  mountAdminRoute: MountRoutineAdminRoute;
  now: () => number;
  newId: () => string;
  timers: RoutineTimers;
  log: Log;
  writeBeacon: (required: { path: string; enabled: number; now: () => number }) => Promise<unknown>;
  policy: { releaseEnabled: boolean; access: RoutineAccess; target?: RoutineTarget };
}

export interface ComposeAssistantRoutinesOptional {
  holderId?: string;
  monotonicNow?: () => number;
  migrate?: (required: { kernel: unknown; runMigrations: unknown }, optional: Record<string, never>) => Promise<unknown>;
  runMigrations?: unknown;
  createService?: (required: { persistence: RoutineDurablePersistence; holderId: string }) => RoutineService;
  /** Builds the run handler once the approval observer exists (P3-T3.T), so every accepted run can be tracked; wins over `runStarter`. */
  createRunHandler?: (ports: { approvals: Pick<RoutineApprovalObserver, "track" | "untrack">; updateRun: RoutineDurablePersistence["updateRun"] }) => RoutineRunHandler;
  /** Reports the store-open failure under an admin `ERR-` id; defaults to the admin failure sink (`reportServerFailure`). */
  reportFailure?: (required: { error: unknown; operation: string }) => { errorId: string };
}

export interface AssistantRoutinesHandle {
  availability: () => RoutineAvailability;
  /** For the desktop wake relay (T1b.T); a no-op when routines never started. */
  reconcile: (input: { reason: "wake" }, optional?: Record<string, never>) => Promise<void>;
  /** Boot handoff for chat repair (`assistant-chats` `routineBoot`): only the lease owner waits for `whenInterrupted`. */
  bootInterruption: { isLeaseOwner: () => boolean; whenInterrupted: () => Promise<void> };
  /** Human-confirm's optional receipt port: trusted routine context for a tracked run, else undefined. */
  approvalBindingFor: RoutineApprovalObserver["bindingFor"];
}

export const ROUTINE_ROUTE_BASE = "/api/admin/assistant/routines";
const SESSION_ONLY = { message: "Use the owner's session to manage routines.", permission: "assistant.routines" };
const COPY: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.values(ROUTINE_AVAILABILITY_REFUSALS).map(({ reason, message }) => [reason, message])),
  ROUTINE_NOT_FOUND: "That routine no longer exists.",
  ROUTINE_RUN_ACTIVE: "This routine is already running. Wait for it to finish.",
  ROUTINES_FORBIDDEN: "Only the site owner can manage routines.",
  INVALID_SCHEDULE: "That schedule is not valid. Pick a time and try again.",
  STALE_REVISION: "This routine changed in another window. Reload and try again.",
  ROUTINES_BUSY: "Routines are busy right now. Try again in a moment.",
  ROUTINES_DISK_FULL: "Routines could not be saved because the disk is full.",
  UNAUTHORIZED: "Sign in as the site owner to manage routines.",
};

/** Turns a command refusal into the error the Jini factories already map (copy by `details.reason`). */
function refusalError(refusal: RoutineRefusal): ClientFacingError {
  const code = refusal.status === 403 ? "FORBIDDEN" : refusal.status === 404 ? "NOT_FOUND" : "SERVICE_UNAVAILABLE";
  return new ClientFacingError({ apiError: { code, message: refusal.message,
    details: { reason: refusal.reason, ...(refusal.availability ? { availability: refusal.availability } : {}) } } });
}

function unwrap<T extends { ok: true }>(result: T | RoutineRefusal): T {
  if (result.ok) return result;
  throw refusalError(result);
}

/** A missing routine is `null`/`false` to the factories (their own 404 + copy); every other refusal throws. */
function unlessMissing<T extends { ok: true }>(result: T | RoutineRefusal): T | null {
  return !result.ok && result.status === 404 ? null : unwrap(result);
}

/**
 * The Jini factories' `store`/`scheduler` ports, served by the owner command gate for ONE actor.
 * Why route through the commands rather than the raw store: the gate rechecks owner access and live
 * availability on every call and owns the post-commit reschedule and beacon; the factories keep only
 * parsing, copy and status mapping. Their own `rescheduleOne`/`unschedule` calls are therefore no-ops.
 */
function commandPortsFor(commands: RoutineCommands, actor: RoutineActor, service: Pick<RoutineService, "nextRunAt"> | null, store: Pick<RoutineStore, "getLatestRun"> | null) {
  type Revision = { expectedRevision?: number };
  const routineStore = {
    list: async () => unwrap(await commands.list({ actor })).routines,
    get: async ({ id }: { id: string }) => unlessMissing(await commands.get({ actor, id }))?.routine ?? null,
    // `input` may carry a body `target`/`creatorId`; the commands read neither (target and creator come from composition and the session).
    create: async (input: Record<string, unknown>) => unwrap(await commands.create({ actor, draft: input })).routine,
    update: async ({ id, patch }: { id: string; patch: Record<string, unknown> }, { expectedRevision }: Revision = {}) =>
      unlessMissing(await commands.update({ actor, id, patch }, { expectedRevision }))?.routine ?? null,
    delete: async ({ id }: { id: string }, { expectedRevision }: Revision = {}) =>
      unlessMissing(await commands.delete({ actor, id }, { expectedRevision })) !== null,
    listRuns: async ({ routineId }: { routineId: string }, page: { cursor?: string | null; limit?: number } = {}) => {
      const { runs, nextCursor } = unwrap(await commands.listRuns({ actor, id: routineId }, page));
      return { items: runs, nextCursor };
    },
    // Projected: the raw run row carries the lease holder and the approval exchange ref.
    getLatestRun: async ({ routineId }: { routineId: string }) => {
      const run = store ? await store.getLatestRun({ routineId }) : null;
      return run ? toRunSummary(run) : null;
    },
  };
  const scheduler = {
    nextRunAt: ({ routineId }: { routineId: string }) => service?.nextRunAt({ routineId }) ?? null,
    runNow: async ({ routineId }: { routineId: string }) => unwrap(await commands.runNow({ actor, id: routineId })).run,
    rescheduleOne: () => {}, unschedule: () => {},
  };
  return { store: routineStore, scheduler, resolveCreator: () => actor.principalId };
}

/** Wraps a factory spec so its deps are built per request from the AUTHENTICATED principal only. */
function bindForPrincipal(spec: AnySpec, portsFor: (actor: RoutineActor) => unknown, withAvailability: boolean, { errorId }: { errorId?: string } = {}) {
  return { ...spec, handle: async (args: { input: unknown; context?: AdminPrincipal; deps: unknown }, optional?: { signal?: AbortSignal }) => {
    const principal = args.context;
    if (!principal) return err({ error: { code: "UNAUTHORIZED", message: COPY.UNAUTHORIZED! } });
    const actor: RoutineActor = { principalId: principal.id, workspaceId: principal.workspaceId };
    const result = await spec.handle({ input: args.input, context: args.context, deps: portsFor(actor) }, optional);
    if (!result.ok && errorId) return withIncidentId(result, errorId);
    // GET ready answers `{ routines, availability }` (sheet step 6); only reached when the gate said ready.
    return withAvailability && result.ok ? { ...result, value: { ...(result.value as object), availability: "ready" } } : result;
  } } as unknown as JsonRouteSpec<unknown, unknown, Record<string, never>, AdminPrincipal>;
}

/** The store-open refusal names the boot's admin `ERR-` incident, so the owner's screen and the server log
 *  point at one failure. Only that refusal: it is reached after the owner check, so a non-owner's 403 never carries it. */
function withIncidentId<R extends { ok: false; error: { details?: unknown } }>(result: R, errorId: string): R {
  const details = result.error.details as { reason?: string } | undefined;
  if (details?.reason !== ROUTINE_AVAILABILITY_REFUSALS.error.reason) return result;
  return { ...result, error: { ...result.error, details: { ...details, errorId } } };
}

/** The create factory requires a body `target`, but the commands never read one: composition supplies it
 *  (sheet P3-T1a.T Defaults) and the admin form sends none. Parse is handed the composed target, so a body
 *  is not refused over a field nobody uses; a non-object body still reaches the factory's own 400. */
function withComposedTarget(spec: AnySpec, target: RoutineTarget): AnySpec {
  return { ...spec, parse: (raw: RouteInputContext) => {
    const { body } = raw;
    const isObject = typeof body === "object" && body !== null && !Array.isArray(body);
    return spec.parse(isObject ? { ...raw, body: { ...body, target } } : raw);
  } } as AnySpec;
}

type MountRoutineRoutesArgs = { mountAdminRoute: MountRoutineAdminRoute; workspaceId: string; portsFor: (actor: RoutineActor) => unknown; target: RoutineTarget; errorId?: string };

/** Mounts the seven routes. Writes are same-origin by their factory; every route is session-credential only. */
function mountRoutineRoutes({ mountAdminRoute, workspaceId, portsFor, target, errorId }: MountRoutineRoutesArgs) {
  const id = `${ROUTINE_ROUTE_BASE}/:id`;
  const specs: Array<[AnySpec, boolean]> = [
    [createRoutineListRoute({ path: ROUTINE_ROUTE_BASE, copy: COPY }) as unknown as AnySpec, true],
    [withComposedTarget(createRoutineCreateRoute({ path: ROUTINE_ROUTE_BASE, copy: COPY }) as unknown as AnySpec, target), false],
    [createRoutineGetRoute({ path: id, copy: COPY }) as unknown as AnySpec, false],
    [createRoutineUpdateRoute({ path: id, copy: COPY }) as unknown as AnySpec, false],
    [createRoutineDeleteRoute({ path: id, copy: COPY }) as unknown as AnySpec, false],
    [createRoutineRunNowRoute({ path: `${id}/run`, copy: COPY }) as unknown as AnySpec, false],
    [createRoutineRunsRoute({ path: `${id}/runs`, copy: COPY }) as unknown as AnySpec, false],
  ];
  for (const [spec, withAvailability] of specs) {
    mountAdminRoute({ spec: bindForPrincipal(spec, portsFor, withAvailability, { errorId }), deps: { workspaceId } }, { sessionCredentialOnly: SESSION_ONLY });
  }
}

/** A store no command reaches: the gate refuses every non-ready availability before touching the store. */
const UNOPENED_STORE = new Proxy({}, { get: () => () => { throw new Error("The routine store is not open."); } }) as RoutineStore;

/** Mounts routes that refuse with a fixed availability (desktop-only or error), after the owner check. */
function mountRefusal(required: ComposeAssistantRoutinesRequired, availability: Exclude<RoutineAvailability, "ready">, { errorId }: { errorId?: string } = {}): AssistantRoutinesHandle {
  const target = required.policy.target ?? { mode: "create_each_run" };
  const commands = createRoutineCommands({ store: UNOPENED_STORE, service: UNOPENED_STORE as never, access: required.policy.access,
    onCommandCommitted: () => {}, availability: () => availability, target }, { log: required.log });
  mountRoutineRoutes({ mountAdminRoute: required.mountAdminRoute, workspaceId: required.workspaceId, portsFor: (actor) => commandPortsFor(commands, actor, null, null), target, errorId });
  return { availability: () => availability, reconcile: async () => {}, bootInterruption: { isLeaseOwner: () => false, whenInterrupted: async () => {} },
    approvalBindingFor: () => undefined };
}

/** Adapts the scheduler port to `closeRoutineHost`'s setTimeout/clearTimeout pair. */
const drainTimers = (timers: RoutineTimers) => ({
  setTimeout: (callback: () => void, ms: number) => timers.schedule({ delayMs: ms, callback }),
  clearTimeout: (cancel: unknown) => { (cancel as () => void)(); },
});

/**
 * Composes the routine host. Ineligible launch or release flag off: no DB, no timers, refusal routes.
 * Assistant off at first boot: the DB opens (the admin screen can still list) but timers never arm.
 */
export async function composeAssistantRoutines(required: ComposeAssistantRoutinesRequired, optional: ComposeAssistantRoutinesOptional = {}): Promise<AssistantRoutinesHandle> {
  const { launch, policy, contentDbPath, openSqlite, workspaceId, now, newId, timers, log } = required;
  if (!policy.releaseEnabled || !launch.desktopEligible) return mountRefusal(required, "desktop-only");
  const holderId = optional.holderId ?? `boot-${newId()}`;
  let openError: unknown;
  const sidecar = await openRoutineSidecar({ contentDbPath, openSqlite, runMigrations: optional.runMigrations ?? defaultRunMigrations,
    migrate: optional.migrate ?? (migrateJiniRoutines as never), scope: workspaceId, holderId, now, newId },
  { log: (entry) => { if (entry.event === "routine-sidecar-open-failed") openError = entry.error; log(entry); } });
  // Store-open failure keeps the site up; routines answer `error` (with this boot's `ERR-` id) until the next boot.
  if (!sidecar.ok) {
    const { errorId } = (optional.reportFailure ?? reportServerFailure)({ error: openError, operation: "routines:store-open" });
    return mountRefusal(required, "error", { errorId });
  }
  const { monotonicNow = () => performance.now() } = optional;
  const createService = optional.createService ?? (({ persistence, holderId: holder }) => new RoutineService({ persistence },
    { now, monotonicNow, newId, timers, holderId: holder, log: (code, detail) => log({ event: code, error: detail }) }));
  const service = createService({ persistence: sidecar.persistence, holderId });
  // In-process projection: receipts arrive through `onReceipt`, so the watcher read hook has nothing to add.
  const approvals = createRoutineApprovalObserver({ persistence: sidecar.store, now, readRunEvents: async () => [], policy: { workspaceId } }, { log });
  service.setRunHandler({ handler: optional.createRunHandler?.({ approvals, updateRun: (args) => sidecar.persistence.updateRun(args) }) ?? required.runStarter });
  const handle = await startRoutineHost(required, { service, sidecar, holderId });
  return { ...handle, approvalBindingFor: approvals.bindingFor };
}

type OpenSidecar = Extract<Awaited<ReturnType<typeof openRoutineSidecar>>, { ok: true }>;

/** Wires the open host: close hooks first (so a later throw still closes), commands, routes, then the switch. */
async function startRoutineHost(required: ComposeAssistantRoutinesRequired, { service, sidecar, holderId }: { service: RoutineService; sidecar: OpenSidecar; holderId: string }) {
  const { policy, now, timers, log, beforeStoreClose, onStoreClose } = required;
  let enabled = required.assistantEnabled;
  let closed = false;
  const availability = (): RoutineAvailability => (closed ? "error" : !enabled ? "assistant-off" : service.leaseState({}, {}) === "owner" ? "ready" : "other-window");
  const beacon = async () => {
    const live = enabled ? (await sidecar.store.list({}, {})).filter((routine) => routine.enabled).length : 0;
    await required.writeBeacon({ path: routinesPaths({ contentDbPath: required.contentDbPath }).beacon, enabled: live, now });
  };
  const safeBeacon = () => beacon().catch((error: unknown) => log({ event: "routine-beacon-failed", error }));
  const unsubscribe = required.onAssistantToggle((next) => { void applyToggle(next); });
  // Drain-before-close: the drain fences timers, interrupts this boot's runs and releases the lease;
  // only the later close registration closes the borrowed connection, which every earlier step still uses.
  beforeStoreClose({ drain: async () => {
    closed = true;
    unsubscribe();
    await closeRoutineHost({ service, persistence: sidecar.persistence, holderId, now, close: () => {} }, { timers: drainTimers(timers), log });
  } });
  onStoreClose({ registration: () => sidecar.close() });
  const commands = createRoutineCommands({ store: sidecar.store, service, access: policy.access, onCommandCommitted: safeBeacon,
    availability, target: policy.target ?? { mode: "create_each_run" } }, { log });
  mountRoutineRoutes({ mountAdminRoute: required.mountAdminRoute, workspaceId: required.workspaceId, portsFor: (actor) => commandPortsFor(commands, actor, service, sidecar.store),
    target: policy.target ?? { mode: "create_each_run" } });

  let bootRepaired: Promise<void> = Promise.resolve();
  const enable = async (reason: "start" | "assistant-enabled") => {
    service.start({}, { reason } as never);
    // Only the lease owner waits for boot repair; a passive window must not block boot on its retry.
    if (service.leaseState({}, {}) === "owner") { bootRepaired = service.whenReady({}, {}); await bootRepaired; }
  };
  async function applyToggle(next: boolean) {
    if (closed || next === enabled) return;
    enabled = next;
    try {
      if (next) await enable("assistant-enabled");
      else {
        service.quiesce({}, {});
        await service.drainActive({}, { timeoutMs: 2_000 });
        // Re-enabled during the drain: keep the lease and the timers.
        if (!enabled || closed) service.stop({}, { releaseLease: true });
      }
    } catch (error) { log({ event: "routine-toggle-failed", error }); }
    await safeBeacon();
  }
  if (enabled) await enable("start");
  await safeBeacon();
  return { availability, reconcile: (input: { reason: "wake" }) => (enabled && !closed ? service.reconcile(input, {}) : Promise.resolve()),
    bootInterruption: { isLeaseOwner: () => !closed && service.leaseState({}, {}) === "owner", whenInterrupted: () => bootRepaired } };
}
