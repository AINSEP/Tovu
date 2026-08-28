import type { Express } from "express";

import type { RouteDeps } from "../../../../routes/types.js";

/**
 * @file ADR-046 Phase 3 — narrow `RouteDeps` slice for the `assistant-settings` server module.
 *
 * Covers the 2 public-switch registrars in this directory (`get-settings.ts`, `put-settings.ts`),
 * which await `deps.assistantSettingsReady`, read `deps.workspaceId`/`deps.settingsRepo`, call
 * `deps.getEffective` (GET), and call `deps.authorize`; the PUT additionally needs
 * `deps.clock`/`deps.idGen`/`deps.principalRepo`/`deps.set` to drive the settings write chokepoint.
 * `getEffective`/`set` are here because `assistant/public-assistant-settings.ts`'s deps bags now take
 * them by injection rather than static import (module-cycle avoidance, see that file's header) — this
 * Pick is how the real functions reach these 2 routes without either route importing
 * `features/settings` itself. A genuine narrowing (mirrors `routes/admin/seo/deps.ts`'s identical
 * rationale for the same settings shape), not a `RouteDeps` widening.
 *
 * ADR-058 folded the 3 site-credential registrars (`get-site-credential.ts`,
 * `put-site-credential.ts`, `delete-site-credential.ts`) into this SAME deps slice and module rather
 * than a new one: they share the identical auth gate (`ADMIN_ASSISTANT_PERMISSION`) and workspace
 * scoping, and both concerns are "the AI Assistant admin section's server surface" — the same reason
 * this file gives, one paragraph up, for not sharing with `modules/assistant.ts`'s proxy instead.
 * The 3 new fields (`siteAssistantCredentialRepo`/`siteAssistantSecretSealer`/
 * `siteAssistantSecretKeyring`) need no matching `*Ready` promise — see their own doc comments on
 * `RouteDeps` for why.
 *
 * The admin-BYOK-keystore design (`ADS-memory/reports/analysis/2026-08-05-admin-byok-keystore-
 * design.md`, owner-approved) folds its own 3 registrars (`get-execution-credential.ts`,
 * `put-execution-credential.ts`, `delete-execution-credential.ts`) in here too, for the identical
 * reason. Those 3 routes need no `authorize()`/`ADMIN_ASSISTANT_PERMISSION` check — the row is
 * scoped to `(workspaceId, getAuthedPrincipal(res).id)`, so there is no OTHER admin's data a session
 * could reach even without an extra permission gate — but they still need `adminExecutionCredentialRepo`
 * for the same reason the site-credential trio needs `siteAssistantCredentialRepo`.
 *
 * Deliberately NOT folded into `server/modules/assistant.ts`. That module is the session-gated
 * reverse proxy in front of the agent-daemon process and shares none of these dependencies — it
 * holds no repo at all. Sharing a module would couple a settings CRUD pair to a streaming proxy's
 * lifetime for no reason beyond both having "assistant" in the name.
 */
export type AssistantSettingsRouteDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "authorize"
  | "clock"
  | "idGen"
  | "settingsRepo"
  | "getEffective"
  | "set"
  | "principalRepo"
  | "assistantSettingsReady"
  | "siteAssistantCredentialRepo"
  | "siteAssistantSecretSealer"
  | "siteAssistantSecretKeyring"
  | "adminExecutionCredentialRepo"
>;

export type AssistantSettingsRouteRegistrar = (app: Express, deps: AssistantSettingsRouteDeps) => void;
