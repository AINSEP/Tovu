import net from "node:net";

import { ValidationError } from "../../../platform/site-dir/index.js";

/**
 * @file The pure `--host`/`TOVU_HOST` resolver shared by `tovu serve` (`cli/commands/serve.ts`) and
 * the container entry point (`index.ts`) — see
 * `ADS-memory/.local-artifacts/lan-bind-plan-2026-09-23.md`'s Decision.
 *
 * Purpose:
 * Both boot paths call `app.listen(port, host)` with a HOST that used to be implicit — Node's own
 * default when no host argument is passed is `::` (dual-stack, every interface), so every listener
 * in the product was LAN-reachable unless it opted out individually (see the plan's Findings
 * table). This is the one place that turns an operator's already-picked raw value into the second
 * argument `.listen()` actually wants, so both entry points agree on what that value means.
 *
 * Why this takes the already-picked `raw` value, not an env object: `serve.ts` has a `--host` flag
 * that must win over `TOVU_HOST` (same precedence shape as `resolveServePort`'s `--port`), so it
 * computes `input.host ?? process.env.TOVU_HOST` itself before calling in; `index.ts` has no
 * `--host` flag, so it passes `process.env.TOVU_HOST` directly. Keeping that precedence decision at
 * each call site — rather than inside this resolver — is what lets `index.ts` stay a one-input
 * caller instead of also depending on a CLI flag it does not have.
 *
 * Why `"::"` resolves to `undefined`, not the literal string: Node's `.listen(port, host)` already
 * falls back to `::` (with an IPv4 fallback to `0.0.0.0` on hosts without IPv6) when `host` is
 * `undefined` — that is its own documented default, not this module's. Passing the literal string
 * `"::"` through would work identically on a dual-stack machine, but `resolveBindHost` returning
 * `undefined` for "no host restriction" lets a caller's OWN default (`index.ts` passes `undefined`
 * as its fallback) and an explicit `TOVU_HOST=::` collapse onto the exact same code path, rather
 * than two paths that happen to behave the same.
 *
 * Why a hostname (`localhost`, `my host`) is REJECTED rather than resolved: `localhost` resolves to
 * `::1` before `127.0.0.1` on this machine (`apps/desktop/vite.config.mts:32-36`, Unknown 4 in the
 * plan). A server bound to the IP literal `127.0.0.1` refuses a Node client that dials the hostname
 * `localhost` and gets `::1` first — browsers and curl fall back to IPv4 and never notice, but
 * every desktop and test client here already dials `127.0.0.1` literally. Accepting `localhost` as
 * a `--host`/`TOVU_HOST` value would look like it works (a browser hitting it would connect fine)
 * while quietly breaking every one of those literal-IP clients. Restricting this to `net.isIP`
 * literals makes that trap unreachable instead of documenting around it.
 *
 * Architectural role:
 * Pure — no `process.env` or `process.argv` read inside the resolver itself, and no side effect.
 * Both call sites resolve their own raw value and pass it in explicitly, so this stays directly
 * testable and never disagrees with a caller that injects a different value (as `serve.ts`'s own
 * `resolveServePort` already does for `PORT`).
 */

/** `tovu serve`'s own default: loopback-only, so a locally run or desktop-spawned site is never
 *  reachable from another machine on the network unless `--host`/`TOVU_HOST` opts in. */
export const DEFAULT_LOCAL_BIND_HOST = "127.0.0.1";

/**
 * Resolves the host argument for `.listen(port, host)` from the already-picked raw value, falling
 * back to `fallback` when that value is absent or blank.
 *
 * @param raw - the `--host` flag value if present, else the `TOVU_HOST` env value, else `undefined`
 *   — precedence is the caller's job (see this file's header). Always a plain string or `undefined`;
 *   never an env object.
 * @param fallback - what to return when `raw` is absent: `serve.ts` passes `DEFAULT_LOCAL_BIND_HOST`,
 *   `index.ts` passes `undefined` (its own existing all-interfaces default, unchanged).
 * @throws {ValidationError} when `raw` is set to something that is not an IP literal and not
 *   blank — exact wording: `--host/TOVU_HOST must be an IP address such as 127.0.0.1 or 0.0.0.0
 *   (got "<value>")`.
 * @complexity O(1) — one `net.isIP` check.
 */
export function resolveBindHost(raw: string | undefined, fallback: string | undefined): string | undefined {
  if (raw === undefined) return fallback;

  const trimmed = raw.trim();
  if (trimmed === "") return fallback;

  // Node's own `.listen()` default for "no host restriction" — see this file's header for why this
  // collapses onto the same path as an absent raw value rather than being passed through as a string.
  if (trimmed === "::") return undefined;

  if (net.isIP(trimmed) === 0) {
    throw new ValidationError(`--host/TOVU_HOST must be an IP address such as 127.0.0.1 or 0.0.0.0 (got "${trimmed}")`);
  }

  return trimmed;
}

/**
 * Whether a resolved bind host is loopback-only (never reachable from another machine).
 *
 * Backs the non-loopback stderr warning `tovu serve` prints when `--host`/`TOVU_HOST` widens
 * exposure — every OTHER value, including `undefined` (all interfaces) and `0.0.0.0`, is treated as
 * network-reachable and worth warning about.
 *
 * @complexity O(1).
 */
export function isLoopbackHost(host: string | undefined): boolean {
  if (host === undefined) return false;
  return host === "::1" || host.startsWith("127.");
}
