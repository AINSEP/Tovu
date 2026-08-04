import type { Express } from "express";

import type { RouteDeps } from "../../types";

/**
 * @file ADR-046 Phase 3 — narrow `RouteDeps` slice for the `assistant-settings` server module.
 *
 * Covers the 2 public-switch registrars in this directory (`get-settings.ts`, `put-settings.ts`),
 * which await `deps.assistantSettingsReady`, read `deps.workspaceId`/`deps.settingsRepo`, and call
 * `deps.authorize`; the PUT additionally needs `deps.clock`/`deps.idGen`/`deps.principalRepo` to
 * drive the settings write chokepoint. A genuine narrowing (mirrors `routes/admin/seo/deps.ts`'s
 * identical rationale for the same settings shape), not a `RouteDeps` widening.
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
  | "principalRepo"
  | "assistantSettingsReady"
  | "siteAssistantCredentialRepo"
  | "siteAssistantSecretSealer"
  | "siteAssistantSecretKeyring"
>;

export type AssistantSettingsRouteRegistrar = (app: Express, deps: AssistantSettingsRouteDeps) => void;
