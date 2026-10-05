import { listenServer, type ServerListenerPort } from "@jini-ai/devops/local-dev";

/**
 * @file Binds `src/index.ts`'s one boot listener (HTTP or dev-TLS HTTPS — the same `server` either
 * way) to the operator's resolved `TOVU_HOST`. Extracted from `index.ts` (2026-10-04) because that
 * file binds a real port the moment it is imported, so no test can run it; the bind itself — host
 * and retry range — is now exercised here against a real socket instead of by grepping
 * `index.ts`'s source (the grep went stale silently when bebc5736f replaced `app.listen(port,
 * bindHost, ...)` with `listenServer`).
 *
 * `bindHost === undefined` omits `host` entirely, so Node keeps its own all-interfaces default
 * (`::`, or `0.0.0.0` without IPv6) — the container default the LAN-bind plan keeps for `index.ts`
 * (see `bind-host.ts`). Only `npm start` (`autoStartPort`) opts into direct-bind retries; every
 * other entry point gets one attempt, so a held port fails loudly instead of two dev processes
 * racing for it (see the EADDRINUSE comment at `index.ts`'s call site).
 */

/** Ports `npm start` tries, starting at the requested one, before giving up. */
export const AUTO_START_PORT_ATTEMPTS = 20;

/**
 * Listens `server` on `port` (and `bindHost`, when set); resolves the port actually bound.
 *
 * @param required.bindHost - `resolveBindHost(process.env.TOVU_HOST, undefined)`'s result.
 * @param optional.autoStartPort - true only for `npm start`: on EADDRINUSE try the next port, up to
 *   `AUTO_START_PORT_ATTEMPTS` ports in all.
 * @throws whatever `listenServer` rejects with (EADDRINUSE once the range is exhausted).
 * @complexity O(attempts) listen calls.
 */
export async function reserveBootListener(
  required: { server: ServerListenerPort; port: number; bindHost: string | undefined },
  optional: { autoStartPort?: boolean } = {},
): Promise<number> {
  const { server, port, bindHost } = required;
  return listenServer(
    { server, port },
    { ...(bindHost === undefined ? {} : { host: bindHost }), attempts: optional.autoStartPort ? AUTO_START_PORT_ATTEMPTS : 1 },
  );
}
