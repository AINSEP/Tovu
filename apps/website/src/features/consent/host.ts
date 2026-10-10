import { parse as parseCookie } from 'cookie';
import type { Request } from 'express';
import { resolveClientIp, type RateLimiter } from '#src/contracts/core/rate-limit/rate-limit';

/** Header trust is an operator/edge contract: no header is consumed unless explicitly configured.
 * A trusted proxy must strip visitor-supplied values and set ISO subdivision codes (US-CA).
 * Unknown/absent regions become opt-in in the package policy. @complexity O(1). */
export function createSiteConsentRequestPorts({ trustedRegionHeader, origin, rateLimiter, rateLimitKey = ({ address }) => address }: { trustedRegionHeader?: string; origin: (required: { request: Request }) => string; rateLimiter: RateLimiter; rateLimitKey?: (required: { address: string }) => string }, _options = {}) {
  return {
    allowWrite: async ({ request }: { request: Request }, _optional = {}) => (await rateLimiter.check({ key: rateLimitKey({ address: resolveClientIp(request) }) })).allowed,
    origin: (input: { request: Request }, _optional = {}) => new URL(origin(input)).origin,
    region: ({ request }: { request: Request }, _optional = {}): string | null => {
      if (!trustedRegionHeader) return null;
      return request.get(trustedRegionHeader) ?? null;
    },
    readReceiptId: ({ cookieHeader }: { cookieHeader: string }, _optional = {}): string | null => {
      const id = parseCookie(cookieHeader).jini_consent;
      return typeof id === 'string' && /^[a-zA-Z0-9_-]{16,128}$/.test(id) ? id : null;
    },
  };
}
