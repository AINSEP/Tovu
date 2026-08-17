/**
 * @file Menus' (navigation's) agent-tool registrations — re-exported from `@jini-ai/cms/navigation`.
 *
 * A shim rather than a rewrite of the one importer, deliberately, mirroring `identity/
 * tool-registrations.ts`'s own reasoning. `assistant/tool-registrations.ts` imports all 22 domains
 * as a single uniform block of `../<domain>/tool-registrations` lines. Pointing only navigation
 * somewhere else would make the ported domain the odd line out, and would invite the next reader to
 * "restore consistency" by reaching past a barrel rather than through it. When more domains move,
 * this file and its siblings retire together.
 *
 * 2026-08-17 (Stage 2 batch 2 of the registry rollout): converted to
 * `assistant/tool-contribution-registry.ts`'s explicit-call registry, same as `widgets`/
 * `content-types`/`forms` earlier in this batch — see that file's header for why. The one other
 * importer of `navigation` outside `server/*` is `features/theme/static-render.ts`, but `themes`'
 * own `DOMAIN_SLICES` entry points at `features/theme/tool-registrations.ts`, and that file's real
 * transitive import closure (`agent-tools.ts` -> `theme-files.ts` -> `theme.ts` ->
 * `build-conformance.ts`/`handlebars-allowlist.ts`/`liquid-allowlist.ts`) never reaches
 * `static-render.ts` or `index.ts` — confirmed by tracing every import in that closure, not just a
 * same-directory assumption. So `assistant -> themes -> navigation -> assistant` cannot close, unlike
 * the `themes -> export` cycle that blocked `themes`' own conversion.
 */
import { registerToolContributor } from "#src/assistant/index";
import { buildMenusRegistrations, menusDerivedRisk, type MenusToolDeps } from "@jini-ai/cms/navigation";

export { buildMenusRegistrations, menusDerivedRisk, type MenusToolDeps };

/**
 * Contributes Menus' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildMenusRegistrations`/
 * `menusDerivedRisk` by name; this is the seam that replaced it.
 */
export function contributeMenusTools(): void {
  registerToolContributor({ domain: "menus", build: buildMenusRegistrations, risk: menusDerivedRisk });
}
