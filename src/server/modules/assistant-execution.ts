import { registerAdminAssistantDetectAgentsRoute } from "../routes/admin/assistant/detect-agents";
import { registerAdminAssistantTestConnectionRoute } from "../routes/admin/assistant/test-connection";
import { registerAdminAssistantListModelsRoute } from "../routes/admin/assistant/list-models";
import { registerAdminAssistantTestAgentRoute } from "../routes/admin/assistant/test-agent";
import type { AssistantExecutionRouteDeps } from "../routes/admin/assistant/execution-deps";
import type { ServerModuleHandle } from "./types";

/**
 * @file The `assistant-execution` server module: the 4 admin routes backing
 * the "Execution mode" tab's `ExecutionPort` (Local CLI detection, per-agent
 * CLI check, BYOK connection test, BYOK model discovery — `@jini-ai/ui`'s
 * `ExecutionTab`, wired to these routes by
 * `apps/admin/src/lib/execution-settings.ts`).
 *
 * Distinct from `modules/assistant-settings.ts` (the public assistant
 * on/off-switch CRUD pair) for the reason `routes/admin/assistant/
 * execution-deps.ts` documents: these are stateless egress probes, not
 * settings reads/writes. Both modules happen to gate on the same
 * `ADMIN_ASSISTANT_PERMISSION` and live in the same route directory because
 * they are both part of the AI Assistant admin section, not because they
 * share dependencies.
 */
export function createAssistantExecutionModule(deps: AssistantExecutionRouteDeps): ServerModuleHandle {
  return {
    name: "assistant-execution",
    registerRoutes: (app) => {
      registerAdminAssistantDetectAgentsRoute(app, deps);
      registerAdminAssistantTestConnectionRoute(app, deps);
      registerAdminAssistantListModelsRoute(app, deps);
      registerAdminAssistantTestAgentRoute(app, deps);
    },
  };
}
