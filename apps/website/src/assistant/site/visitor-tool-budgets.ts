/** Per-process visitor budgets. HTTP-kit owns counting/expiry; this adapter owns Tovu's two scopes. */
import type { Clock } from "@jini-ai/core/primitives";
import { createMemoryCounterStore, type CounterStore } from "@jini-ai/http-kit/rate-limit";
import { createRateLimiter, type RateLimiter } from "../../contracts/core/rate-limit/rate-limit.js";
import type { VisitorToolLimits } from "../../contracts/site-assistant/visitor-tools.js";

interface Bucket { readonly store: CounterStore; readonly max: number; readonly limiter: RateLimiter }
export interface VisitorToolBudgetTarget {
  readonly workspaceId: string; readonly toolId: string; readonly ip: string; readonly limits: VisitorToolLimits;
}
export interface VisitorToolBudgets {
  charge(required: VisitorToolBudgetTarget, optional?: Record<string, never>): Promise<boolean>;
}

/** Build once per serving process. Policy changes preserve the same window stores.
 * Checks serialize across profile changes because HTTP-kit's queue belongs to a limiter instance.
 * Check the IP allowance first, so rejected traffic cannot spend the shared site allowance.
 * Reservations are conservative: a later site refusal can still spend an IP slot, never overrun it.
 * No timer, background task, raw IP persistence or shared-machine guarantee.
 * @complexity Two amortized O(1) limiter checks; expiry sweeps belong to HTTP-kit.
 * @example createVisitorToolBudgets({ clock });
 */
export function createVisitorToolBudgets({ clock }: { clock: Clock }, _options = {}): VisitorToolBudgets {
  const buckets = new Map<string, Bucket>();
  let pending: Promise<unknown> = Promise.resolve();

  /** Rebind a changed maximum without changing the store that owns consumed windows. */
  function limiterFor({ key, max, windowSeconds }: { key: string; max: number; windowSeconds: number }, _optional = {}): RateLimiter {
    const previous = buckets.get(key);
    if (previous?.max === max) return previous.limiter;
    const store = previous?.store ?? createMemoryCounterStore({});
    const limiter = createRateLimiter({ profile: { max, windowSeconds, burst: 0 }, clock }, { store });
    buckets.set(key, { store, max, limiter });
    return limiter;
  }

  /** Only attempts within an IP's allowance may charge the shared site counter. */
  async function consume(target: VisitorToolBudgetTarget, _optional = {}): Promise<boolean> {
    const key = JSON.stringify([target.workspaceId, target.toolId]);
    const ip = limiterFor({ key: `${key}/ip`, max: target.limits.perIpPerHour, windowSeconds: 3600 });
    if (!(await ip.check({ key: JSON.stringify([target.workspaceId, target.toolId, target.ip]) })).allowed) return false;
    const site = limiterFor({ key: `${key}/site`, max: target.limits.perSitePerDay, windowSeconds: 86_400 });
    return (await site.check({ key })).allowed;
  }

  return {
    charge(target, _optional = {}) {
      const result = pending.then(() => consume(target));
      pending = result.catch(() => undefined);
      return result;
    },
  };
}
