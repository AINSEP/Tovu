import type { Clock } from "@jini-ai/core/primitives";
import {
  createConnectionBudgets as createJiniConnectionBudgets,
  type ConnectionBudgetLimiter,
} from "@jini-ai/integrations/api-connections";

import { createRateLimiter } from "../../contracts/core/rate-limit/rate-limit.js";

/**
 * @file Per-minute request budgets a plugin declares on one of its API connections (`budgets` in
 * `tovu-connections.json`), parsed, clamped and enforced by the host through the real http-kit
 * limiter.
 *
 * The parser, the clamp and the enforcer live in `@jini-ai/integrations/api-connections`; this keeps
 * the host's names and signatures and binds the enforcer's limiter port to the host's http-kit limiter.
 */

export {
  ConnectionBudgetExceededError, HOST_BUDGET_MAXIMUM, parseConnectionBudgets,
  type ConnectionBudget, type ConnectionBudgetScope, type ConnectionBudgetTarget,
} from "@jini-ai/integrations/api-connections";

/**
 * The host's budget enforcer. One limiter per distinct clamped profile (bounded by the maxima).
 * The per-account budget is checked first, so a busy account's refused calls never spend the
 * instance budget its siblings share.
 * @complexity O(b) limiter checks per charge.
 */
export function createConnectionBudgets(required: { readonly clock: Clock }, _optional: Record<string, never> = {}) {
  return createJiniConnectionBudgets({
    clock: required.clock,
    createLimiter: ({ profile, clock }): ConnectionBudgetLimiter => createRateLimiter({ profile, clock }),
  });
}

export type ConnectionBudgets = ReturnType<typeof createConnectionBudgets>;
