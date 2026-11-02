import type { Request } from 'express';
import { normalizeOriginCandidate } from '@jini-ai/http-kit/verified-origin';
import { resolveProtocol } from '#src/server/inbound/public-http/routes/oauth/public-origin';

/** Shared site visitor policy for confirmations and frontend control.
 * Fetch metadata alone is spoofable; every request must match a validated origin.
 * It can still only narrow: when a browser reports not same-origin
 * (cross-site, same-site, none, empty), refuse even if Origin matches. Metadata never grants.
 * Browsers omit Origin on same-origin GET/HEAD, so only those methods may use Referer.
 * State-changing requests require Origin; Referer must never replace it (F3b/F3c).
 * @param req - Visitor request; serving scheme/host follow frontend-control's existing derivation.
 * @param method - HTTP request method; only GET/HEAD permit missing-Origin fallback.
 * @param allowsOrigin - Canonical site origin check, called only after serving-host comparison.
 * @returns Permission to proceed; canonical-check failures propagate to the route's refusal handler.
 * @complexity O(header length) time/space; at most one canonical-origin lookup, no mutation.
 * @example await allowsVisitorRequestOrigin({ req, method: req.method, allowsOrigin });
 */
export async function allowsVisitorRequestOrigin({ req, method, allowsOrigin }: {
  req: Request; method: string; allowsOrigin: (required: { origin: string }) => Promise<boolean>;
}, _options = {}): Promise<boolean> {
  const site = req.get('sec-fetch-site');
  if (site !== undefined && site !== 'same-origin') return false;
  const raw = req.get('origin') ?? (['GET', 'HEAD'].includes(method) ? req.get('referer') : undefined);
  if (!raw || !normalizeOriginCandidate({ rawUrl: raw })) return false;
  const origin = new URL(raw).origin;
  if (origin === `${resolveProtocol(req)}://${req.get('host')}`) return true;
  return allowsOrigin({ origin });
}
