import type { Express } from "express";

import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file C-003a `SkillsRouteDeps` — narrow `RouteDeps` slice for the `skills` admin HTTP surface
 * (implementation-outline.md, skills-composer-typeahead).
 *
 * A genuine narrowing, mirroring `routes/admin/system/module-status.ts`'s
 * `AdminModuleStatusDeps` — the registrars this module owns read `workspaceId`
 * (the path-param guard, and the input to `loadInstalledSkillToolSources`) and `authorize`
 * (the `admin.assistant.use` gate, D-3), plus the booted `skillLayout` and `siteBinding`.
 * No repo, no clock, no id-gen: C-001 is a pure read of `<site>/skills/` through
 * `loadInstalledSkillToolSources`, using the same binding as installation and tool registration.
 */
export type SkillsRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "skillLayout" | "siteBinding">;

export type SkillsRouteRegistrar = (app: Express, deps: SkillsRouteDeps) => void;
