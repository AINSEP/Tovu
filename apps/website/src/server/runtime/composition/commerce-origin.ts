import { trimCharsEnd } from '@jini-ai/core/primitives';
import { normalizedCommerceOrigin } from '@jini-ai/commerce';
import { isBlockedExternalApiHostname, isLoopbackApiHost } from '@jini-ai/platform/net/endpoint-policy';

/** A configured deployed origin uses the generic HTTPS shape and shared literal-address policy.
 * DNS reachability belongs to deployment setup; no request Host or forwarded header selects it.
 * @complexity O(origin length), no DNS or HTTP I/O. */
export function commerceCheckoutOrigin({ publicOrigin }: { publicOrigin: string }, _optional = {}): string | null {
  const origin = normalizedCommerceOrigin({ publicOrigin });
  if (!origin) return null;
  const hostname = new URL(origin).hostname;
  if (isLoopbackApiHost({ hostname }) || isBlockedExternalApiHostname({ hostname })) return null;
  const normalized = trimCharsEnd({ text: hostname.toLowerCase(), chars: '.' });
  if (normalized.endsWith('.localhost') || normalized.endsWith('.local')) return null;
  return origin;
}
