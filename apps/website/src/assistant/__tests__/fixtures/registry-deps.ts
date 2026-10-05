import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";

import type { AssistantToolRegistryDeps } from "../../tool-registrations.js";

/**
 * @file Completes a plain route-deps bag into the {@link AssistantToolRegistryDeps} that
 * `buildAssistantToolRegistrations` takes.
 *
 * `magicLinkPerEmailLimiter` is the one field the registry needs beyond `RouteDeps`
 * (`MembersToolDeps`' requirement). Neither `createRouteDeps()` nor `createSiteRouteDeps()` builds
 * it: both production roots (`byok-tool-surface.ts`, `agent-daemon-server.ts`) construct their own
 * limiter at that call site. Tests did the same with an unchecked cast, or not at all; this helper
 * mirrors the production construction instead, so the deps a test hands the registry are the
 * checked type, not an assertion that they are.
 */

/** Everything the registry needs except the limiter this helper builds. */
export type RegistryDepsWithoutLimiter = Omit<AssistantToolRegistryDeps, "magicLinkPerEmailLimiter">;

/**
 * Adds a fresh per-email magic-link limiter over `routeDeps.clock`, exactly as
 * `createByokToolSurface` does, unless the test already supplied one.
 *
 * @param required.routeDeps the test's route-deps bag (real or a typed fake). A
 *   `magicLinkPerEmailLimiter` already on it (a test's spy) is kept, not replaced.
 * @returns a new object; `routeDeps` is not mutated.
 * @complexity O(fields in routeDeps), one spread.
 */
export function toAssistantRegistryDeps({ routeDeps }: {
  routeDeps: RegistryDepsWithoutLimiter & Partial<Pick<AssistantToolRegistryDeps, "magicLinkPerEmailLimiter">>;
}): AssistantToolRegistryDeps {
  return {
    ...routeDeps,
    magicLinkPerEmailLimiter:
      routeDeps.magicLinkPerEmailLimiter ?? createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock }),
  };
}
