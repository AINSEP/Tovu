/**
 * @file Workspace's agent-tool registrations — re-exported from `@jini-ai/cms/workspace`.
 *
 * A shim rather than a rewrite of the one importer, deliberately.
 * `assistant/tool-registrations.ts` imports every not-yet-converted domain as a single uniform block
 * of `../<domain>/tool-registrations` lines. Pointing only workspace somewhere else would make one
 * ported domain the odd line out, and would invite the next reader to "restore consistency" by
 * reaching past a barrel rather than through it. When more domains move, this file and its
 * siblings retire together.
 *
 * 2026-08-17 (Stage 2 batch 2 of the registry rollout): converted to
 * `assistant/tool-contribution-registry.ts`'s explicit-call registry, same as `identity`. Safe: the
 * only importer of this file (relative or `#src/*` subpath) is `assistant/tool-registrations.ts`
 * itself, and every OTHER importer of `features/workspace` at large is either `server/*` (never
 * reachable from `assistant`) or a `import type` from `site-dir/*` (erased at compile time, no
 * runtime edge either way).
 */
import type { ToolContributor } from "#src/assistant/index";
import { buildWorkspaceRegistrations, workspaceDerivedRisk, type WorkspaceToolDeps } from "@jini-ai/cms/workspace";

export { buildWorkspaceRegistrations, workspaceDerivedRisk, type WorkspaceToolDeps };

/**
 * Contributes Workspace's AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildWorkspaceRegistrations`/
 * `workspaceDerivedRisk` by name; this is the seam that replaced it.
 */
export function contributeWorkspaceTools(): ToolContributor {
  return { domain: "workspace", build: buildWorkspaceRegistrations, risk: workspaceDerivedRisk };
}
