import {
  DefaultMemberAccessResolver, resolvePostMemberAccess,
  InMemoryMemberSessionRepo, InMemoryMemberSubscriptionRepo, InMemoryMemberTierRepo,
} from "#src/features/members/index";

/** Real members policy, with empty DI repositories: no test can acquire an entitlement. */
export function anonymousMemberAccess(_required = {}, _options = {}) {
  const resolver = new DefaultMemberAccessResolver({
    sessions: new InMemoryMemberSessionRepo(),
    subscriptions: new InMemoryMemberSubscriptionRepo(),
    tiers: new InMemoryMemberTierRepo(),
  });
  return { resolvePostMemberAccess, decide: resolver.decide.bind(resolver) };
}
