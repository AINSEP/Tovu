import type { FrontendHookInput } from '@jini-ai/daemon/http';
import { normalizeOriginCandidate } from '@jini-ai/core/contracts/server/verified-origin';
import { readRequestFacts } from '@jini-ai/core/contracts/site/request-facts';

/** Shared site visitor policy for confirmations and frontend control.
 * Fetch metadata alone is spoofable; every request must match a validated origin.
 * It can still only narrow: when a browser reports not same-origin
 * (cross-site, same-site, none, empty), refuse even if Origin matches. Metadata never grants.
 * Browsers omit Origin on same-origin GET/HEAD, so only those methods may use Referer.
 * State-changing requests require Origin; Referer must never replace it (F3b/F3c).
 * @param request - Visitor request's method and headers; only GET/HEAD permit missing-Origin fallback.
 * @param locals - The host adapter's per-request values; the serving scheme is `servingProtocol` from the request facts (frontend-control's existing derivation).
 * @param allowsOrigin - Canonical site origin check, called only after serving-host comparison.
 * @returns Permission to proceed; canonical-check failures propagate to the route's refusal handler.
 * @complexity O(header length) time/space; at most one canonical-origin lookup, no mutation.
 * @example await allowsVisitorRequestOrigin({ ...requestHookInput({ req }), allowsOrigin });
 */
export async function allowsVisitorRequestOrigin({ request, locals, allowsOrigin }: FrontendHookInput & {
  allowsOrigin: (required: { origin: string }) => Promise<boolean>;
}, _options = {}): Promise<boolean> {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') return false;
  const raw = request.headers.get('origin') ?? (['GET', 'HEAD'].includes(request.method) ? referrer({ request }) : null);
  if (!raw || !normalizeOriginCandidate({ rawUrl: raw })) return false;
  const origin = new URL(raw).origin;
  const serving = servingOrigin({ request, locals });
  // Serialize both sides alike: Host case and explicit default ports do not change an origin.
  if (normalizeOriginCandidate({ rawUrl: serving }) && origin === new URL(serving).origin) return true;
  return allowsOrigin({ origin });
}

/** The `Referrer` spelling wins over `Referer` (and an empty one falls through), as Express's `req.get('referer')` answered. */
function referrer({ request }: { request: FrontendHookInput['request'] }): string | null {
  return request.headers.get('referrer') || request.headers.get('referer');
}

/** Scheme from the request facts, host from the `Host` header. An absent Host prints as the word "undefined", as it did when Express's `req.get('host')` answered it. */
function servingOrigin({ request, locals }: FrontendHookInput): string {
  return `${readRequestFacts({ locals }).servingProtocol}://${request.headers.get('host') ?? 'undefined'}`;
}
