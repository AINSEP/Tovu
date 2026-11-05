import type { ToolAccessChange } from '@jini-ai/daemon';
/**
 * @file A keyed, last-wins fan-out for "the external-MCP roster changed" — the seam that lets every
 * process holding a live federated-tool registry (the agent daemon's own, and BYOK's per-request
 * `FederationRuntime`) hear about a roster write without the three call sites (`put.ts`,
 * `oauth-callback.ts`, `features/external-mcp/tool-registrations.ts`) each having to know how many
 * runtimes exist or what each one's reload method is called.
 *
 * Same shape as `mcp-federation/presets.ts`: a module-level `Map` plus a typed `register*` function,
 * a `notify*`, and a `reset*ForTests`. Keyed rather than a plain list for the identical reason
 * `presets.ts` gives — a composition root that calls its own registration twice (a hot-reloaded
 * module, a test that rebuilds the app) must replace its own listener, not accumulate a second one
 * that fires the same reload twice per roster change.
 *
 * Ordinary discovery refreshes never reject or wait past `waitMs` for a stuck listener:
 * both call sites that await it (`oauth-callback.ts`) do so to let an operator return to the chat and
 * find a newly authorized connection already usable, not to gate their own response's correctness on
 * every registered runtime's reload succeeding — a listener that never resolves must not turn into a
 * request that never resolves either. Lowering tool access is different: callers await Stop and
 * cleanup, and a failure or deadline rejects with a safe, actionable error.
 *
 * Architectural role:
 * In-module registry. No I/O of its own; every listener performs its own.
 */

/** A registered reaction to a roster change. Return shape varies by runtime (`FederationReloadResult`,
 *  `triggerFederationReload`'s `{ok}` shape, or nothing at all) — `notifyExternalMcpRosterChanged`
 *  only needs to know when each one settles, never what it settled with. */
/** A durable OFF decision stands even when cleanup fails; never report an unconfirmed stop. */
export class ToolAccessLoweringError extends Error {
  readonly code = 'TOOL_ACCESS_STOP_FAILED';
  constructor() { super("Tool access changed, but affected answers could not be confirmed stopped."); }
}

export type ExternalMcpRosterChangeListener = (lowered?: ToolAccessChange) => unknown;

/** Bounds one `notifyExternalMcpRosterChanged()` call. Matches
 *  `assistant-daemon-client.ts`'s `FEDERATION_RELOAD_FETCH_TIMEOUT_MS` — the same "one on-demand,
 *  idempotent attempt should fail fast rather than hold a caller's response open" reasoning, now
 *  applied across every registered listener at once rather than one daemon fetch. */
const DEFAULT_WAIT_MS = 5_000;

let listenersByKey = new Map<string, ExternalMcpRosterChangeListener>();

/**
 * Registers a reaction to a roster change, called once per runtime at composition-root boot
 * (`app.ts`'s `"agent-daemon"`/`"byok"` keys, `agent-daemon-server.ts`'s `"agent-daemon-local"`).
 *
 * Re-registering the same `key` REPLACES the earlier listener rather than appending — see this
 * file's header for why a second listener under the same key would be a bug (the same runtime's
 * reload firing twice), not a second runtime to notify.
 */
export function onExternalMcpRosterChanged(key: string, listener: ExternalMcpRosterChangeListener): void {
  listenersByKey.set(key, listener);
}

/** Invokes a listener without letting a synchronous throw escape before `Promise.allSettled` ever
 *  sees it — `Array.prototype.map` would otherwise abort the whole fan-out on the first offender. */
function invokeSafely(listener: ExternalMcpRosterChangeListener, lowered?: ToolAccessChange): Promise<unknown> {
  try {
    return Promise.resolve(listener(lowered));
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * Fans a roster change out to every registered listener and waits for all of them to settle —
 * `allSettled`, so one throwing or rejecting listener never stops the rest from running — capped at
 * `waitMs` so a listener cannot hold a caller open indefinitely. Lowering rejects on failure.
 *
 * @complexity O(1) plus the cost of every registered listener, in parallel, once.
 */
export async function notifyExternalMcpRosterChanged(options: { readonly waitMs?: number; readonly lowered?: ToolAccessChange } = {}): Promise<void> {
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS;
  const listeners = [...listenersByKey.values()];
  if (listeners.length === 0) return;

  // Lowering is a correctness boundary, unlike a best-effort discovery refresh: the serving
  // listener awaits the authenticated daemon Stop/cleanup control and failures reach the writer.
  if (options.lowered) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new ToolAccessLoweringError()), waitMs);
      void Promise.all(listeners.map(listener => invokeSafely(listener, options.lowered))).then(() => { clearTimeout(timer); resolve(); }, () => { clearTimeout(timer); reject(new ToolAccessLoweringError()); });
    });
    return;
  }

  await new Promise<void>((resolve) => {
    let timer: NodeJS.Timeout | undefined = setTimeout(() => {
      timer = undefined;
      resolve();
    }, waitMs);

    void Promise.allSettled(listeners.map(listener => invokeSafely(listener))).then(() => {
      if (timer !== undefined) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

/** Test-only reset of the module-level registry (mirrors `presets.ts`'s
 *  `resetFederatedMcpPresetsForTests`). */
export function resetExternalMcpRosterChangeListenersForTests(): void {
  listenersByKey = new Map();
}
