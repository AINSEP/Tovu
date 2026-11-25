/**
 * Why: routines (recurring AI jobs, P3) span three Tovu processes: the serving site (scheduler,
 * sidecar DB, admin routes), the desktop main process (boot of sites with enabled routines, wake
 * relay) and the admin bundle (screen). None of them may import another's code, so the shared host
 * shapes live here. Row/summary contracts are Jini core's (`@jini-ai/core/contracts/site/routines`);
 * this file holds only Tovu host shapes: the rollout flag, the actor, the beacon and the private IPC.
 */

/**
 * The one Tovu rollout switch for routines, shared by the server, desktop and admin builds. Default
 * false: the feature stays dark in production until the combined release gate passes; tests opt in
 * by injecting `true` at a host root. Never read from env or a public setting.
 */
export const ROUTINES_RELEASE_ENABLED = false;

/** Who a routine command runs as: always resolved from the authenticated session, never a request body. */
export type RoutineActor = Readonly<{ principalId: string; workspaceId: string }>;

/** Where each run's conversation goes. Host composition fixes it; a caller body cannot override it. */
export type RoutineTarget = Readonly<{ mode: "create_each_run" } | { mode: "reuse"; projectId: string }>;

/** Why routines are not ready on this boot; each maps to one stable `details.reason` and one plain sentence. */
/** `starting`: the routines handle is still composing (not ready, and not a failure); `error`: the store really failed to open. */
export type RoutineAvailability = "ready" | "starting" | "desktop-only" | "assistant-off" | "other-window" | "error";

/**
 * `<dirname(contentDbPath)>/ops/routines-beacon.json`: a hint the desktop main process reads (bounded
 * to {@link ROUTINE_BEACON_MAX_BYTES}) to decide whether to start a site in the background. Written by
 * the site after commit; never authority (the site re-checks everything when it boots).
 */
export type RoutineBeacon = Readonly<{ v: 1; enabled: number; updatedAt: number }>;

/** The desktop reader refuses a beacon larger than this; a real one is about 50 bytes. */
export const ROUTINE_BEACON_MAX_BYTES = 4096;

/**
 * The only message the desktop main process sends a site child over its private `ipc` channel for
 * routines: the machine resumed from sleep, so re-check slots now. An accelerator, never a consent or
 * ownership signal; a late timer still classifies the catch-up if the message never arrives.
 */
export type RoutineReconcileMessage = Readonly<{ type: "routines.reconcile"; reason: "wake" }>;

/** Exact-shape check for {@link RoutineReconcileMessage}: any other key or value is ignored by the child. */
export function isRoutineReconcileMessage(value: unknown): value is RoutineReconcileMessage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2 && record["type"] === "routines.reconcile" && record["reason"] === "wake";
}

/** Parses a beacon file's text; null for anything malformed, oversize or of an unknown version. */
export function parseRoutineBeacon({ text }: { text: string }): RoutineBeacon | null {
  if (text.length > ROUTINE_BEACON_MAX_BYTES) return null;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (typeof value !== "object" || value === null) return null;
  const { v, enabled, updatedAt } = value as Record<string, unknown>;
  if (v !== 1 || !Number.isSafeInteger(enabled) || (enabled as number) < 0 || !Number.isSafeInteger(updatedAt)) return null;
  return { v: 1, enabled: enabled as number, updatedAt: updatedAt as number };
}

/**
 * The trusted routine marker carried inside an accepted run's context envelope (`context.routine`).
 * Why one shared shape: the host writes it only from the routine handler's trusted option, the
 * daemon decoder and tool access validate it strictly, and recovery admission reads it back from the
 * durable request. A browser can never supply it.
 */
export type RoutineRunMarker = Readonly<{ routineId: string; runId: string; catchUp: boolean; slotAt: number | null }>;

/**
 * The id of the user turn the routine handler persists for one run and slot. Why minted from the
 * marker: recovery admission must see the SAME run and slot in the persisted chat history, not only in
 * the durable envelope, before it reserves a turn; a browser send gets a random id and never matches.
 */
export function routineUserTurnId({ marker }: { marker: Pick<RoutineRunMarker, "runId" | "slotAt"> }, _optional = {}): string {
  return `routine-${marker.runId}-user-${marker.slotAt === null ? "now" : String(marker.slotAt)}`;
}

/** Strict decode of an untrusted marker: exact keys and types, or null (never a partial marker). */
export function parseRoutineRunMarker({ value }: { value: unknown }, _optional = {}): RoutineRunMarker | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const marker = value as Record<string, unknown>;
  const keys = Object.keys(marker).sort().join(",");
  if (keys !== "catchUp,routineId,runId,slotAt") return null;
  const { routineId, runId, catchUp, slotAt } = marker;
  const slotOk = slotAt === null || (typeof slotAt === "number" && Number.isFinite(slotAt));
  if (typeof routineId !== "string" || routineId === "" || typeof runId !== "string" || runId === "" || typeof catchUp !== "boolean" || !slotOk) return null;
  return { routineId, runId, catchUp, slotAt: slotAt as number | null };
}
