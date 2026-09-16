/**
 * @file The one error type the `http` core primitive publishes through its barrel (ADR-038).
 *
 * Everything else in `index.ts` is an interface or a type, deliberately — a consumer must not be
 * able to construct an unguarded client. A thrown class is the one exception, and it is exported
 * for the opposite reason: a consumer needs to be able to RECOGNISE a refusal it did not cause a
 * crash with. `instanceof` is the only shape that survives being re-thrown, wrapped, and re-read at
 * a tool boundary; message matching is not, and a refusal that cannot be recognised is a refusal
 * that gets reported as an internal failure.
 */

/**
 * A request the egress policy refused BEFORE any connection was attempted — a disallowed scheme,
 * credentials embedded in the URL, or a hostname that resolved to a non-public address
 * (`client.ts`'s `assertAllowedTarget`/`assertNoPrivateAddress`, including on every re-verified
 * redirect hop).
 *
 * Distinct from every other failure `HttpClientPort.send` can raise (DNS failure, connect timeout,
 * transport error), and that distinction is the whole point: a refusal is a DECISION this process
 * made about the caller's target, and the caller can act on it by supplying a different URL. A
 * timeout or a DNS failure is not. Consumers at a tool/HTTP boundary map this class to a
 * caller-visible refusal carrying `callerSafeMessage` — see `features/media-import/tool-registrations.ts`,
 * whose `media_import_from_url` handler is the first agent-supplied-URL consumer of this port and
 * where surfacing an SSRF block as a redacted `INTERNAL_ERROR` was a real operator-facing defect
 * (2026-09-07, SEC-05).
 *
 * Two messages, because they have two audiences (2026-09-16):
 * - `message` is the FULL refusal, for server-side logs and audit. For a non-public target it names
 *   the address the hostname resolved to.
 * - `callerSafeMessage` is what a boundary may show a caller outside this process — an agent's model
 *   above all. It keeps the refusal, the hostname the request named, and the classification, and
 *   drops the resolved address. A caller who can name any host and read back what it resolved to can
 *   map internal DNS one request at a time (`internal-db.corp` -> `10.0.4.7`). The classification
 *   stays: it is the actionable reason, and it is derived from public IANA ranges, not from anything
 *   about this deployment.
 *
 * `callerSafeMessage` defaults to a generic refusal rather than to `message`, so a future throw site
 * that forgets to supply one says less, never more.
 */
export class EgressRefusedError extends Error {
  /** The refusal as a caller outside this process may see it. See the class doc. */
  readonly callerSafeMessage: string;

  constructor(message: string, options: { callerSafeMessage?: string } = {}) {
    super(message);
    this.name = "EgressRefusedError";
    this.callerSafeMessage = options.callerSafeMessage ?? "egress to the requested host was refused by this site's outbound network policy";
  }
}
