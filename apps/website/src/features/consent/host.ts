import { parse as parseCookie } from 'cookie';

import { resolveClientIp, type ClientIpSource, type RateLimiter } from '#src/contracts/core/rate-limit/rate-limit';

/** Only the trusted IP source and configured header lookup belong to the consent request port. */
interface ConsentRequest extends ClientIpSource {
  get(name: string): string | undefined;
}

/** Only an explicitly configured country header is trusted; the host must overwrite it.
 * Missing/invalid country data stays strict. Client IP comes only from the existing
 * trust-proxy resolver for rate limiting. @complexity O(1). */
export function createSiteConsentRequestPorts({ trustedRegionHeader, origin, rateLimiter, rateLimitKey = ({ address }) => address }: { trustedRegionHeader?: string; origin: (required: { request: ConsentRequest }) => string; rateLimiter: RateLimiter; rateLimitKey?: (required: { address: string }) => string }, _options = {}) {
  return {
    allowWrite: async ({ request }: { request: ConsentRequest }, _optional = {}) => (await rateLimiter.check({ key: rateLimitKey({ address: resolveClientIp(request) }) })).allowed,
    origin: (input: { request: ConsentRequest }, _optional = {}) => new URL(origin(input)).origin,
    region: ({ request }: { request: ConsentRequest }, _optional = {}): string | null => {
      if (!trustedRegionHeader) return null;
      const region = request.get(trustedRegionHeader);
      if (region === undefined) return null;
      return /^[A-Z]{2}(?:-[A-Z0-9]{1,3})?$/i.test(region) && region.toUpperCase() !== 'XX' ? region.toUpperCase() : null;
    },
    readReceiptId: ({ cookieHeader }: { cookieHeader: string }, _optional = {}): string | null => {
      const id = parseCookie(cookieHeader).jini_consent;
      return typeof id === 'string' && /^[a-zA-Z0-9_-]{16,128}$/.test(id) ? id : null;
    },
  };
}
