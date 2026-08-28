import type { Express } from "express";

import type { RouteDeps } from "../../../../routes/types.js";

/**
 * @file C-003a `SkillsRouteDeps` — narrow `RouteDeps` slice for the `skills` admin HTTP surface
 * (implementation-outline.md, skills-composer-typeahead).
 *
 * A genuine narrowing, mirroring `routes/admin/system/module-status.ts`'s
 * `AdminModuleStatusDeps` — the one registrar this module owns reads only `workspaceId`
 * (the path-param guard, and the input to `loadInstalledSkillToolSources`) and `authorize`
 * (the `admin.assistant.use` gate, D-3). No repo, no clock, no id-gen: C-001 is a pure read of
 * `infra/skills/` via the existing `loadInstalledSkillToolSources`, so this module needs nothing
 * else off `RouteDeps`.
 */
export type SkillsRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize">;

export type SkillsRouteRegistrar = (app: Express, deps: SkillsRouteDeps) => void;
