import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Express, Router } from "express";
import type { RoutineRunHandler } from "@jini-ai/daemon";
import { openNativeSqlite } from "#src/platform/db/kernel/drivers/sqlite";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { holdsSiteOwnerAuthority } from "#src/server/inbound/admin-http/dev-auth";
import type { RoutineAccess } from "#src/features/routines/routine-commands";
import { installRoutineWakeReceiver, type RoutineWakeChannel } from "#src/features/routines/routine-wake-receiver";
import { createRoutineRunHandler } from "#src/features/routines/routine-run-handler";
import { listAssistantAgents } from "#src/assistant/agents";
import { ownerChatAcceptanceFor, type AssistantAcceptanceRouteDeps } from "./assistant-run-acceptance.js";
import { siteStoreHooksFor, type SiteStoreHooks } from "../site-deps/store-close-hooks.js";
import {
  composeAssistantRoutines, ROUTINE_ROUTE_BASE,
  type AssistantRoutinesHandle, type ComposeAssistantRoutinesOptional, type ComposeAssistantRoutinesRequired, type MountRoutineAdminRoute, type RoutineTimers,
} from "./assistant-routines.js";

/**
 * @file The serving process's production bindings for `composeAssistantRoutines` (P3-T1a.T) and the
 * child wake receiver (P3-T1b.T). `createServingApp` is the only caller.
 *
 * Why a separate module: `assistant-routines.ts` takes every edge injected and stays Express-free;
 * this is where the real edges are chosen once — live owner authority, the admin JSON mount with
 * session-credential-only gating, the not-ready run starter, Node timers, the atomic beacon write and
 * the parent IPC channel. Eligibility and the release flag arrive from the host root, never from env.
 */

export const ROUTINES_NOT_READY = "Routines are not ready yet.";

/** Until T2.T installs owner-chat acceptance, every run settles `failed` without launching a chat. */
export function createRoutinesNotReadyStarter(_optional: Record<string, never> = {}): RoutineRunHandler {
  return async ({ runId }) => ({ projectId: "routine-not-started", conversationId: "routine-not-started", agentRunId: `routine-not-started-${runId}`,
    completion: Promise.resolve({ status: "failed" as const, error: ROUTINES_NOT_READY, errorCode: "ROUTINES_NOT_READY" }) });
}

/** Tmp file + rename: the desktop reader never sees a half-written beacon. Private (0600) like the DB. */
export async function writeRoutineBeaconAtomically({ path, enabled, now }: { path: string; enabled: number; now: () => number }, _optional: Record<string, never> = {}): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify({ v: 1, enabled, updatedAt: now() }), { mode: 0o600 });
  await rename(tmp, path);
}

/** Node timers behind the scheduler port; unref'd so a pending slot never holds a stopping process open. */
const nodeRoutineTimers: RoutineTimers = { schedule: ({ delayMs, callback }) => {
  const handle = setTimeout(callback, delayMs);
  handle.unref?.();
  return () => clearTimeout(handle);
} };

const logRoutineEvent = ({ event, error }: { event: string; error: unknown }): void => { console.warn(`[routines] ${event}`, error); };

type OwnerAuthorityDeps = Parameters<typeof holdsSiteOwnerAuthority>[0]["deps"];
export type ServingRoutineDeps = OwnerAuthorityDeps & { workspaceId: string; adminAssistantEnabled: boolean; authorize: AdminJsonRoutePortDeps["authorize"] };

/** Mounted workspace + live `*` holder, re-read per command; any lookup failure denies. */
export function ownerAccessFor(routeDeps: ServingRoutineDeps): RoutineAccess {
  return async ({ actor }) => {
    if (actor.workspaceId !== routeDeps.workspaceId) return false;
    try {
      return await holdsSiteOwnerAuthority({ deps: routeDeps, workspaceId: routeDeps.workspaceId, principalId: actor.principalId });
    } catch {
      return false;
    }
  };
}

/** The parent's private channel exists only when the desktop spawned this child with an `ipc` slot. */
const parentChannel = (): RoutineWakeChannel | undefined => (typeof process.send === "function" ? (process as unknown as RoutineWakeChannel) : undefined);

export interface ServingRoutinesRequired {
  routeDeps: ServingRoutineDeps;
  /** The slot `mountAssistantRoutines` placed among the admin routes; behind `/api/admin`'s session gate. */
  router: Router;
  /** `LocalOwnerSignInPolicy.routineDesktopEligible`, read once at the host root. */
  desktopEligible: boolean;
  /** `ROUTINES_RELEASE_ENABLED`, bound once at the host root. */
  releaseEnabled: boolean;
  /** The site's composed reporter (the one `createApp` binds to `res.locals.failureReporter`). */
  reporter: ComposeAssistantRoutinesRequired["reporter"];
}

export interface ServingRoutinesOptional {
  /** Test override for the run handler; production builds the owner-chat handler from `acceptanceDeps`. */
  runStarter?: RoutineRunHandler;
  /** The serving deps owner-chat acceptance needs (P3-T2.T); without a durable run store the not-ready fallback stays. */
  acceptanceDeps?: AssistantAcceptanceRouteDeps;
  channel?: RoutineWakeChannel;
  storeHooks?: SiteStoreHooks;
  /** Test seam for the clock, timers and opener; production uses the real ones. */
  composeOverrides?: Partial<ComposeAssistantRoutinesRequired>;
}

export interface ServingRoutines {
  /** Kept for T1b (wake) and T2 (boot-repair barrier). */
  ready: Promise<AssistantRoutinesHandle>;
  /** Removes the wake receiver; the sidecar itself closes through the store's own close hooks. */
  stop: () => Promise<void>;
}

/** Catch-up copy prepended to a late run's prompt; the slot time is the owner's locale time. */
export const routineCatchUpText = ({ localTime }: { localTime: string }, _optional = {}): string => `Tovu was closed or asleep at ${localTime}.`;

/**
 * The real owner-chat run handler (P3-T2.T) when the serving deps carry a durable run store; otherwise
 * nothing, so `runStarter` (the not-ready fallback) answers. Codex stays refused (`agentPolicy: {}`).
 */
export function ownerChatRunHandler({ routeDeps, access }: { routeDeps: ServingRoutineDeps; access: RoutineAccess },
  optional: Pick<ServingRoutinesOptional, "runStarter" | "acceptanceDeps"> = {}): Pick<ComposeAssistantRoutinesOptional, "createRunHandler"> {
  const deps = optional.acceptanceDeps;
  const runStarter = optional.runStarter === undefined && deps ? ownerChatAcceptanceFor({ deps }, {}) : undefined;
  if (!deps || !runStarter) return {};
  const workspaceId = routeDeps.workspaceId;
  return { createRunHandler: ({ approvals, updateRun }) => createRoutineRunHandler({
    owners: { resolveCurrentOwner: async ({ creatorId }) => {
      const actor = { principalId: creatorId, workspaceId };
      return (await access({ actor })) ? actor : null;
    } },
    agents: { list: () => listAssistantAgents() }, chatHistory: deps.chatHistory, runStarter, updateRun,
    now: Date.now, newId: randomUUID, localeTime: ({ at }) => new Date(at).toLocaleString(), catchUpText: routineCatchUpText,
    agentPolicy: {}, approvals,
  }) };
}

/** Composes routines for one serving boot. No owning store (in-memory/static) is never eligible. */
export function startServingRoutines(required: ServingRoutinesRequired, optional: ServingRoutinesOptional = {}): ServingRoutines {
  const { routeDeps, router, releaseEnabled } = required;
  const hooks = optional.storeHooks ?? siteStoreHooksFor({ routeDeps });
  const desktopEligible = required.desktopEligible && hooks !== undefined;
  let stopped = false;
  let removeReceiver = (): void => {};
  let settle: () => void = () => {};
  const settled = new Promise<void>((resolve) => { settle = resolve; });
  // Registered first: a request that lands while the sidecar opens waits for the routes, not a 404.
  router.use(ROUTINE_ROUTE_BASE, (_req, _res, next) => { void settled.then(() => next()); });
  const mountAdminRoute: MountRoutineAdminRoute = ({ spec, deps }, { sessionCredentialOnly }) =>
    mountAdminJsonRoute({ app: router as unknown as Express, spec: spec as never, deps: { ...deps, authorize: routeDeps.authorize } }, { sessionCredentialOnly });
  const ready = composeAssistantRoutines({
    launch: { desktopEligible }, workspaceId: routeDeps.workspaceId, contentDbPath: hooks?.dbPath ?? "", openSqlite: openNativeSqlite,
    beforeStoreClose: hooks?.beforeStoreClose ?? (() => {}), onStoreClose: hooks?.onStoreClose ?? (() => {}),
    assistantEnabled: routeDeps.adminAssistantEnabled, onAssistantToggle: () => () => {},
    runStarter: optional.runStarter ?? createRoutinesNotReadyStarter(),
    mountAdminRoute, now: Date.now, newId: randomUUID, timers: nodeRoutineTimers, log: logRoutineEvent, writeBeacon: writeRoutineBeaconAtomically,
    policy: { releaseEnabled, access: ownerAccessFor(routeDeps) }, reporter: required.reporter, ...optional.composeOverrides,
  }, ownerChatRunHandler({ routeDeps, access: ownerAccessFor(routeDeps) }, optional)).then((handle) => {
    if (!stopped) removeReceiver = installRoutineWakeReceiver({ channel: optional.channel ?? parentChannel(), reconcile: handle.reconcile,
      eligible: desktopEligible && releaseEnabled, log: ({ event, error }) => logRoutineEvent({ event, error }) });
    return handle;
  }).finally(settle);
  ready.catch((error: unknown) => logRoutineEvent({ event: "routine-compose-failed", error }));
  return { ready, stop: async () => { stopped = true; removeReceiver(); } };
}
