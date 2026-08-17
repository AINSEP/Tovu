/**
 * @file Identity's agent-tool registrations — re-exported from `@jini-ai/cms/identity`.
 *
 * A shim rather than a rewrite of the one importer, deliberately.
 * `assistant/tool-registrations.ts` imports every not-yet-converted domain as a single uniform block
 * of `../<domain>/tool-registrations` lines. Pointing only identity somewhere else would make the
 * one ported domain the odd line out, and would invite the next reader to "restore consistency" by
 * reaching past a barrel rather than through it. When more domains move, this file and its
 * siblings retire together.
 *
 * 2026-08-17 (Stage 2 of the registry rollout): converted to `assistant/tool-contribution-registry.ts`'s
 * explicit-call registry, same as `comments`/`newsletter` — see that file's header for why. Safe to
 * convert first among Stage 2's batch: nothing outside `server/*` imports `identity/tool-registrations`
 * by name, so there is no sibling domain still statically wired through `assistant` that could route
 * back through identity and close a new cycle.
 */
import { registerToolContributor } from "#src/assistant/index";
import { buildIdentityRegistrations, identityDerivedRisk, type IdentityToolDeps } from "@jini-ai/cms/identity";

export { buildIdentityRegistrations, identityDerivedRisk, type IdentityToolDeps };

/**
 * Contributes Identity's AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildIdentityRegistrations`/
 * `identityDerivedRisk` by name; this is the seam that replaced it.
 */
export function contributeIdentityTools(): void {
  registerToolContributor({ domain: "identity", build: buildIdentityRegistrations, risk: identityDerivedRisk });
}
