import type { Express } from "express";

import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Narrow `RouteDeps` slice for the 3 "Execution mode" probe routes
 * (`detect-agents.ts`, `test-connection.ts`, `list-models.ts`).
 *
 * Deliberately separate from `deps.ts`'s `AssistantSettingsRouteDeps` in this
 * same directory, even though both live under `routes/admin/assistant/` and
 * both gate on `ADMIN_ASSISTANT_PERMISSION`: these three routes hold no
 * settings repo and await no settings-ready promise. They are stateless
 * egress probes — detect local agent CLIs on the server host, or make a
 * single outbound smoke-test/model-list request to a BYOK provider the
 * caller names in the request body — not settings CRUD. The API key these
 * routes receive is passed straight through to `@jini-ai/agent-runtime` and
 * is never written to `settingsRepo` or any other store (ADR-028 §6; see
 * `assistant/execution-mode-settings.ts`'s header for the full rationale).
 *
 * ## The one read this slice now carries, and why it does not break the above
 *
 * `siteAssistantCredentialRepo` + `siteAssistantSecretSealer` were added so a probe can OPTIONALLY
 * run against the workspace's stored site credential (`useStoredCredential: true`) instead of a key
 * in the request body. That is still not settings CRUD and still writes nothing — it is a read of
 * the credential the probe is about to use, in the one case where the caller genuinely cannot
 * supply it: the AI Assistant tab's key is encrypted server-side and write-only, so an operator
 * returning to a screen with a saved key has an empty field and no way to discover models or test
 * the connection. Before this, both controls sat permanently disabled next to a working key.
 *
 * The "never persisted" contract is untouched — nothing here writes — and the fallback is opt-in
 * per request, never implicit, so Settings → Execution mode (which sends the ADMIN's own
 * browser-local key) can never silently probe with the SITE's key. See `list-models.ts`'s own note
 * on why that opt-in must not be relaxed to "empty key ⇒ use the stored one".
 */
export type AssistantExecutionRouteDeps = Pick<
  RouteDeps,
  "workspaceId" | "authorize" | "siteAssistantCredentialRepo" | "siteAssistantSecretSealer"
>;

export type AssistantExecutionRouteRegistrar = (app: Express, deps: AssistantExecutionRouteDeps) => void;
