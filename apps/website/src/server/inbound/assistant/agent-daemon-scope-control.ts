/** The shared daemon's inherited-channel control: initialize, reuse and withdraw site scopes (ADR-070). */
import { daemonControlRequest } from "../../runtime/lifecycle/assistant-daemon-connection.js";

/** The slice of a site scope the control path manages; the entry also mounts its `app`. */
export interface ControlledScope {
  hasExchanges(): boolean;
  dispose(required: Record<string, never>, optional?: Record<string, never>): Promise<void>;
}

/** The entry's scope tables: it mounts, drains and park-checks the same maps this control fills. */
export interface ScopeTables<S extends ControlledScope> {
  scopes: Map<string, Promise<S>>;
  scopeEnvironments: Map<string, string>;
  scopedExchanges: Map<string, () => boolean>;
}

/** The shared host's routing key. `siteId` is the workspace id and is shared by every local site
 * (`workspace-local`), so it can never route; only the desktop's per-launched-server key can.
 * @complexity O(1).
 */
function requireScopeKey({ scopeKey }: { scopeKey?: string }, _options = {}): string {
  if (!scopeKey) throw new Error("the shared agent daemon needs a site scope key to tell sites apart");
  return scopeKey;
}

/** Shared scope control cannot stop a site listener or accept parent-only lifecycle notices. */
function parseScopeControlRequest({ payload }: { payload: unknown }, _options = {}) {
  const request = daemonControlRequest.parse(payload);
  if (request.operation === "stopIfIdle") throw new Error("idle shutdown belongs to the site server");
  if (request.operation === "parking" || request.operation === "unavailable") throw new Error("lifecycle notices belong to the parent supervisor");
  return request;
}

/** Build the control handler over the entry's scope tables.
 * @param required Scope tables, the scope factory, the idle-park activity hold, and live listener facts.
 * @returns The handler for one parsed-on-entry control payload; it replies `{ url, pid }`.
 * @throws While stopping, on a lifecycle notice, or on a rebinding of a live scope.
 * @complexity O(1) indexed scope lookup; one in-flight initialization per scope key.
 */
export function createScopeControl<S extends ControlledScope>({ tables, createScope, hold, listenerUrl, pid, isExiting }: {
  tables: ScopeTables<S>;
  createScope: (input: { siteId: string; env: NodeJS.ProcessEnv; token: string }) => Promise<S>;
  hold: () => () => void;
  listenerUrl: () => string;
  pid: number;
  isExiting: () => boolean;
}, _optional = {}) {
  const { scopes, scopeEnvironments, scopedExchanges } = tables;
  /** Only the inherited parent channel can initialize/withdraw scopes. O(1) indexed scope lookup;
   * one in-flight initialization per scope key, with activity held through retained-client boot.
   * Scopes are keyed by `scopeKey`; the scope itself keeps `siteId` as its workspace id. */
  return async function control(payload: unknown) {
    if (isExiting()) throw new Error("daemon is stopping");
    const request = parseScopeControlRequest({ payload });
    if (request.operation === "ready") return { url: listenerUrl(), pid };
    const key = requireScopeKey(request);
    if (request.operation === "withdraw") {
      const scope = scopes.get(key);
      if (scope) await (await scope).dispose({}, {});
      scopes.delete(key); scopeEnvironments.delete(key); scopedExchanges.delete(key);
      return { url: listenerUrl(), pid };
    }
    const { siteId, env, token } = request;
    const binding = JSON.stringify([env.TOVU_SITE_DIR, env.TOVU_SITE_LISTENER_ORIGIN, env.TOVU_SITE_CALLBACK_ORIGIN, token, env.TOVU_AGENT_DAEMON_TOKEN]);
    if (scopes.has(key) && scopeEnvironments.get(key) !== binding) throw new Error("site scope already bound");
    const url = `${listenerUrl()}/s/${encodeURIComponent(key)}`;
    if (!scopes.has(key)) {
      const release = hold();
      const work = createScope({ siteId, env: { ...env, JINI_AGENT_DAEMON_URL: url }, token });
      scopes.set(key, work); scopeEnvironments.set(key, binding);
      void work.then(scope => { scopedExchanges.set(key, scope.hasExchanges); }, () => { scopes.delete(key); scopeEnvironments.delete(key); }).finally(release);
    }
    await scopes.get(key);
    return { url, pid };
  };
}
