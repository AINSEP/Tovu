import type { Express } from "express";

import type { RouteDeps } from "../../types";

/**
 * @file ADR-046 Phase 3 — narrow `RouteDeps` slice for the `assistant-settings` server module.
 *
 * Covers exactly the 2 registrars in this directory (`get-settings.ts`, `put-settings.ts`). Both
 * await `deps.assistantSettingsReady`, read `deps.workspaceId`/`deps.settingsRepo`, and call
 * `deps.authorize`; the PUT additionally needs `deps.clock`/`deps.idGen`/`deps.principalRepo` to
 * drive the settings write chokepoint. A genuine narrowing (mirrors `routes/admin/seo/deps.ts`'s
 * identical rationale for the same 2-route settings shape), not a `RouteDeps` widening.
 *
 * Deliberately NOT folded into `server/modules/assistant.ts`. That module is the session-gated
 * reverse proxy in front of the agent-daemon process and shares none of these dependencies — it
 * holds no repo at all. Sharing a module would couple a settings CRUD pair to a streaming proxy's
 * lifetime for no reason beyond both having "assistant" in the name.
 */
export type AssistantSettingsRouteDeps = Pick<
  RouteDeps,
  "workspaceId" | "authorize" | "clock" | "idGen" | "settingsRepo" | "principalRepo" | "assistantSettingsReady"
>;

export type AssistantSettingsRouteRegistrar = (app: Express, deps: AssistantSettingsRouteDeps) => void;
