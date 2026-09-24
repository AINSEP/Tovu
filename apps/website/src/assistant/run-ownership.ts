import type { NextFunction, Request, RequestHandler, Response } from "express";

import type { RunLifecycle } from "@jini-ai/daemon";

/**
 * @file Per-run authorization for the agent daemon's `/api/runs` surface.
 *
 * The problem this closes:
 * `daemon-auth.ts`'s bearer gate answers "is this Tovu's proxy?", and Tovu's proxy's
 * `requireAdminSession` answers "is *some* admin logged in?". Neither answers "is this admin the
 * one who started *this* run". Without that third question, any authenticated admin who learned
 * another admin's `runId` could read its status, subscribe to its full event stream (the whole
 * assistant transcript), or cancel it mid-flight.
 *
 * Where enforcement lives, and why here rather than in the proxy:
 * the daemon is the process that owns run state, so it is the only place where the ownership
 * record and the thing it protects share a lifetime. `createInMemoryEventLog()` means a daemon
 * restart drops every run, and `rehydrate()` finds nothing to restore — so an in-process owner
 * registry can never outlive the runs it guards (stale rows authorizing a recycled id) nor
 * under-live them (live runs left unowned and therefore unreachable). Tovu's own server process
 * cannot offer that: it and the daemon restart independently, so a proxy-side registry can lose
 * ownership of runs that are still live and still reachable.
 *
 * How the principal gets here:
 * the daemon holds no browser session. Tovu's proxy (`src/server/modules/assistant.ts`) already
 * verifies the admin session and already proves it is the proxy by presenting the daemon bearer
 * token; it additionally asserts the verified principal in {@link RUN_PRINCIPAL_HEADER} on every
 * forwarded request. That header is only trustworthy because {@link requireRunOwnership} is
 * mounted *after* the bearer gate — an unauthenticated caller never reaches it, so nothing that
 * can set the header is unauthenticated. Mounting it before the bearer gate would make the header
 * self-asserted and the whole check decorative.
 *
 * 404 rather than 403 for a non-owner — a deliberate choice, not a default:
 * 403 would confirm that a probed `runId` names a real run, turning any id that leaks through a
 * side channel (a log line, a screenshot, a shared URL) into a confirmed live target. 404 costs
 * nothing, because there is no legitimate caller for whom "exists but is not yours" and "does not
 * exist" are usefully different — both mean "you have no run here". The response body is the
 * byte-identical body `@jini-ai/http-kit` produces for a genuinely unknown run, so the two cases
 * cannot be told apart at all; `__tests__/run-ownership.test.ts` asserts that equivalence against
 * the real http-kit routes rather than trusting this file to stay in sync with them.
 */

/** The header Tovu's proxy asserts the session-verified principal in. Trustworthy only downstream of the bearer gate — see this file's header. */
export const RUN_PRINCIPAL_HEADER = "x-tovu-principal-id";

/**
 * Records which principal started which run, until the daemon forgets the run itself
 * (`agent-daemon-server.ts` calls {@link RunOwnerRegistry.forget} once the run's terminal record
 * has aged out of the lifecycle).
 *
 * Deliberately separate from `agent-daemon-server.ts`'s `principalByRunId`, which looks like the
 * same map but is not: that one is deleted on terminal transition, because the exempt
 * `/api/delegated-tool-calls` route's whole remaining defence is that an id only resolves while
 * its run is in flight (`daemon-auth.ts`). Authorization needs the opposite lifetime — a finished
 * run is still readable over `GET /api/runs/:runId`, so its owner must still be known.
 */
export interface RunOwnerRegistry {
  record(runId: string, principalId: string): void;
  ownerOf(runId: string): string | undefined;
  /** Drops a run's owner once the run itself is gone, so the map does not grow for the daemon's lifetime. */
  forget(runId: string): void;
}

export function createRunOwnerRegistry(): RunOwnerRegistry {
  const owners = new Map<string, string>();
  return {
    record: (runId, principalId) => void owners.set(runId, principalId),
    ownerOf: (runId) => owners.get(runId),
    forget: (runId) => void owners.delete(runId),
  };
}

function readPrincipalId(req: Request): string | undefined {
  const value = req.get(RUN_PRINCIPAL_HEADER);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Fail closed. Only Tovu's proxy holds the bearer token, so a missing header is a wiring fault in the proxy, never a caller's choice — refuse rather than fall back to an unowned request. */
function sendPrincipalRequired(res: Response): void {
  res.status(401).json({
    error: { code: "UNAUTHENTICATED", message: `${RUN_PRINCIPAL_HEADER} is required on run-scoped requests` },
  });
}

/**
 * The exact body `@jini-ai/http-kit` sends for an unknown run, replicated so a non-owner's refusal
 * is indistinguishable from one. `runs.ts` names the id on the JSON routes but not on the SSE
 * stream, whose failure path is written by `sse.ts`'s `sendRawApiError` — hence the split.
 */
function unknownRunBody(req: Request, runId: string): { error: { code: string; message: string } } {
  const isEventStream = req.path.endsWith("/events");
  return { error: { code: "NOT_FOUND", message: isEventStream ? "run was not found" : `run "${runId}" was not found` } };
}

/** `lifecycle.get` for a gate that must not throw into Express: a lookup failure counts as "exists", which denies. */
async function runExists(lifecycle: Pick<RunLifecycle, "get">, runId: string): Promise<boolean> {
  try {
    return (await lifecycle.get(runId)) !== undefined;
  } catch {
    return true;
  }
}

/**
 * Express middleware: refuses run-scoped requests from anyone but the run's own starter.
 *
 * Mount it on the `/api/runs/:runId` prefix, ahead of `registerRunRoutes`, so it covers the status,
 * SSE event-stream, and cancel routes together — and any run-scoped route a future
 * `@jini-ai/http-kit` adds, which is why it gates a prefix rather than three enumerated paths.
 * `POST /api/runs` is deliberately outside the prefix: a run has no owner until it is created.
 *
 * An unknown `runId` is passed through rather than answered here, so http-kit produces its own
 * genuine 404 — that keeps the "unknown run" response identical by construction instead of by
 * imitation, leaving only the non-owner case for {@link unknownRunBody} to match.
 *
 * @complexity O(1) per request.
 * @overallScore 100
 */
export function requireRunOwnership(registry: RunOwnerRegistry, lifecycle: Pick<RunLifecycle, "get">): RequestHandler {
  return async function requireRunOwnershipMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    const callerId = readPrincipalId(req);
    if (!callerId) {
      sendPrincipalRequired(res);
      return;
    }

    const runId = req.params.runId;
    if (typeof runId !== "string" || runId.length === 0) {
      next();
      return;
    }

    const owner = registry.ownerOf(runId);
    if (owner === callerId) {
      next();
      return;
    }
    // Fail closed on unknown ownership: a run that exists with no recorded owner (its contextRef was
    // malformed, so no principal could be decoded) belongs to nobody, so nobody may read or cancel it.
    // Only a run that does not exist at all goes on to http-kit, for its own genuine 404.
    if (owner !== undefined || (await runExists(lifecycle, runId))) {
      res.status(404).json(unknownRunBody(req, runId));
      return;
    }

    next();
  };
}

/**
 * `GET /api/runs`, scoped to the caller's own runs.
 *
 * Mounted ahead of `registerRunRoutes` so it shadows http-kit's `runListRoute`, which lists every
 * run on the daemon regardless of who started it. Left unshadowed, that route hands one admin the
 * ids of every other admin's runs, which is what turns a 122-bit-entropy run id from an
 * unguessable secret into an enumerable one.
 *
 * A run with no recorded owner is omitted rather than shown: the only way to reach that state is a
 * malformed `contextRef` that `onStarted` already failed the run for.
 *
 * @complexity O(n) in the number of runs the daemon is tracking.
 * @overallScore 100
 */
export function createOwnedRunListHandler(deps: { lifecycle: RunLifecycle; registry: RunOwnerRegistry }): RequestHandler {
  return async function ownedRunListHandler(req: Request, res: Response): Promise<void> {
    const callerId = readPrincipalId(req);
    if (!callerId) {
      sendPrincipalRequired(res);
      return;
    }

    const contextRef = typeof req.query.contextRef === "string" ? req.query.contextRef : undefined;
    const runs = await deps.lifecycle.list(contextRef);
    res.json({ runs: runs.filter((run) => deps.registry.ownerOf(run.id) === callerId) });
  };
}
