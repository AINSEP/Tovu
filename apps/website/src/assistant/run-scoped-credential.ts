import { createHash, randomBytes } from "node:crypto";

/**
 * @file The per-run bearer credential the agent daemon hands each run's spawned `jini-mcp` bridge
 * (`mcp-injection.ts` -> `@jini-ai/daemon`'s `McpJsonInjectionOptions.credential(runId)` ->
 * the bridge's `JINI_DAEMON_TOKEN`).
 *
 * The problem this closes (2026-10-01):
 * the bridge used to receive `TOVU_AGENT_DAEMON_TOKEN`, the proxy's own boot-wide token. That let
 * it past `daemon-auth.ts`'s gate, but `run-ownership.ts` only learns *which admin* is calling from
 * the `x-tovu-principal-id` header the proxy asserts — so the bridge's `get_run`/`cancel_run` all
 * answered `401 x-tovu-principal-id is required`. Sending that header from the bridge would have
 * been the wrong fix: a header is whatever the caller says it is. Worse, the boot-wide token is what
 * makes that header trusted, so any holder of it — including the spawned CLI, whose `.mcp.json`
 * carries it — could assert any principal, and `start_run` let the model start a run under any
 * principal id it wrote into `contextRef`.
 *
 * What a run credential is:
 * 32 random bytes minted per run, valid only while the run that minted it is live. The daemon
 * resolves it server-side to *that run's* principal ({@link RunScopedCredentials.resolvePrincipal});
 * the gate then overwrites `x-tovu-principal-id` with that value, so the ownership checks downstream
 * see a principal the caller cannot choose. Which routes such a caller may reach at all is decided
 * by the gate (`daemon-auth.ts`'s `isRunScopedRoute`), not here.
 *
 * Liveness, not just revocation:
 * `resolvePrincipal` asks the host for the run's *live* principal on every call, so a credential
 * stops working the moment its run is no longer tracked, even if {@link RunScopedCredentials.revoke}
 * never runs (the host's terminal hook is best-effort). `revoke` only keeps the map from growing.
 *
 * Tokens are stored by SHA-256 digest, not as raw map keys, so a lookup compares hashes of the
 * presented value rather than the secret itself.
 */

export interface RunScopedCredentials {
  /** Mints (or returns the already-minted) credential for a live run. Throws for a run that is not live. */
  mint(runId: string): string;
  /** The principal of the live run this token was minted for; `undefined` for an unknown, revoked, or no-longer-live one. */
  resolvePrincipal(token: string): string | undefined;
  /** Forgets a run's credential. Safe for a run that never minted one. */
  revoke(runId: string): void;
}

export interface RunScopedCredentialDeps {
  /** The principal a run is executing as while it is live, `undefined` once it is not (`agent-daemon-server.ts`'s `principalByRunId`). */
  principalOfLiveRun(runId: string): string | undefined;
}

function digest(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Creates the daemon's in-memory run credential store. In-process on purpose: the daemon is the
 * process that mints, checks, and outlives these credentials, and a daemon restart drops every run
 * (and so every bridge) along with them.
 *
 * @complexity O(1) per mint/resolve/revoke; O(live runs) space.
 */
export function createRunScopedCredentials(deps: RunScopedCredentialDeps): RunScopedCredentials {
  const runIdByDigest = new Map<string, string>();
  const tokenByRunId = new Map<string, string>();

  return {
    mint(runId) {
      if (deps.principalOfLiveRun(runId) === undefined) {
        throw new Error(`cannot mint a credential for run "${runId}": it is not live`);
      }
      const existing = tokenByRunId.get(runId);
      if (existing !== undefined) return existing;
      const token = randomBytes(32).toString("hex");
      tokenByRunId.set(runId, token);
      runIdByDigest.set(digest(token), runId);
      return token;
    },
    resolvePrincipal(token) {
      const runId = runIdByDigest.get(digest(token));
      return runId === undefined ? undefined : deps.principalOfLiveRun(runId);
    },
    revoke(runId) {
      const token = tokenByRunId.get(runId);
      if (token === undefined) return;
      tokenByRunId.delete(runId);
      runIdByDigest.delete(digest(token));
    },
  };
}
