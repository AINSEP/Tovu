import type { Express } from "express";

import type { RouteDeps } from "../../types";

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
 */
export type AssistantExecutionRouteDeps = Pick<RouteDeps, "workspaceId" | "authorize">;

export type AssistantExecutionRouteRegistrar = (app: Express, deps: AssistantExecutionRouteDeps) => void;
