import { DefaultMemberAccessResolver, resolvePostMemberAccess } from "@jini-ai/user-management/members/access-resolver";
import { InMemoryMemberSessionRepo, InMemoryMemberSubscriptionRepo, InMemoryMemberTierRepo } from "@jini-ai/user-management/members/repo.memory";

/** Real members policy, with empty DI repositories: no test can acquire an entitlement. */
export function anonymousMemberAccess(_required = {}, _options = {}) {
  const resolver = new DefaultMemberAccessResolver({
    sessions: new InMemoryMemberSessionRepo(),
    subscriptions: new InMemoryMemberSubscriptionRepo(),
    tiers: new InMemoryMemberTierRepo(),
  });
  return { resolvePostMemberAccess, decide: resolver.decide.bind(resolver) };
}
