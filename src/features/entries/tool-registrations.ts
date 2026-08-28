/**
 * @file Entries' agent-tool registrations — re-exported from `@jini-ai/cms/entries`.
 *
 * A shim rather than a rewrite of the one importer, deliberately, mirroring `identity/` and
 * `navigation/`'s own reasoning. `assistant/tool-registrations.ts` imports all 22 domains as a
 * single uniform block of `../<domain>/tool-registrations` lines. Pointing only entries somewhere
 * else would make the ported domain the odd line out, and would invite the next reader to "restore
 * consistency" by reaching past a barrel rather than through it. When more domains move, this file
 * and its siblings retire together.
 *
 * 2026-08-17 (Stage 2 batch 2 of the registry rollout): converted to
 * `assistant/tool-contribution-registry.ts`'s explicit-call registry, same as `widgets`/
 * `content-types`/`forms`/`menus`/`recovery`/`plugins` earlier in this batch — see that file's
 * header for why. Converted LAST in this batch, deliberately: `widgets` (converted first, domain #1
 * in this batch) imports `features/entries` internally
 * (`region-area-service.ts`/`read-service.ts`/`embed-service.ts`/`entry-payload.ts`/`deps.ts`/
 * `resolver-service.ts`/`write-service.ts`/`resolvers/{recent-entries,create-core-resolvers}.ts`),
 * so — same reasoning as `content-types`/`forms` — this could only convert safely once `widgets` was
 * already off the static `DOMAIN_SLICES` array. `comments` also imports `features/entries`
 * (`comments/index.ts`), but `comments` was already registry-converted in Stage 1, so that edge was
 * never a risk.
 */
import type { ToolContributor } from "#src/assistant/index";
import {
  buildEntriesRegistrations,
  entriesDerivedRisk,
  type EntriesToolDeps,
} from "@jini-ai/cms/entries";

export { buildEntriesRegistrations, entriesDerivedRisk, type EntriesToolDeps };

/**
 * Contributes Entries' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildEntriesRegistrations`/
 * `entriesDerivedRisk` by name; this is the seam that replaced it.
 */
export function contributeEntriesTools(): ToolContributor {
  return { domain: "entries", build: buildEntriesRegistrations, risk: entriesDerivedRisk };
}
