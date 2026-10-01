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
 * resolves it server-side to *that run's* id and principal ({@link RunScopedCredentials.resolveCaller});
 * the gate then overwrites `x-tovu-principal-id` with that value, so the ownership checks downstream
 * see a principal the caller cannot choose. The gate also binds run-addressed routes and delegated
 * request bodies to that run id, before applying its route allowlist.
 *
 * Liveness, not just revocation:
 * `resolveCaller` asks the host for the run's *live* principal on every call, so a credential
 * stops working the moment its run is no longer tracked, even if {@link RunScopedCredentials.revoke}
 * never runs (the host's terminal hook is best-effort). `revoke` only keeps the map from growing.
 *
 * Tokens are stored by SHA-256 digest, not as raw map keys, so a lookup compares hashes of the
 * presented value rather than the secret itself.
 */

/** Server-derived identity of one live run's bridge, never taken from caller headers or bodies. */
export interface RunScopedCaller {
  readonly runId: string;
  readonly principalId: string;
}

export interface RunScopedCredentials {
  /** Mints (or returns the already-minted) credential for a live run. Throws for a run that is not live. */
  mint(runId: string): string;
  /** The live run and principal this token was minted for; undefined for unknown, revoked or ended runs. */
  resolveCaller(token: string): RunScopedCaller | undefined;
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

  function resolveCaller(token: string): RunScopedCaller | undefined {
    const runId = runIdByDigest.get(digest(token));
    if (runId === undefined) return undefined;
    const principalId = deps.principalOfLiveRun(runId);
    return principalId === undefined ? undefined : { runId, principalId };
  }

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
    resolveCaller,
    resolvePrincipal: (token) => resolveCaller(token)?.principalId,
    revoke(runId) {
      const token = tokenByRunId.get(runId);
      if (token === undefined) return;
      tokenByRunId.delete(runId);
      runIdByDigest.delete(digest(token));
    },
  };
}
