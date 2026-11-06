import { normalizedCommerceOrigin } from '@jini-ai/commerce';
import { isDeployedApiHostname } from '@jini-ai/platform/net/endpoint-policy';

/** A configured deployed origin uses the generic HTTPS shape and shared literal-address policy.
 * DNS reachability belongs to deployment setup; no request Host or forwarded header selects it.
 * @complexity O(origin length), no DNS or HTTP I/O. */
export function commerceCheckoutOrigin({ publicOrigin }: { publicOrigin: string }, _optional = {}): string | null {
  const origin = normalizedCommerceOrigin({ publicOrigin });
  if (!origin) return null;
  return isDeployedApiHostname({ hostname: new URL(origin).hostname }) ? origin : null;
}
