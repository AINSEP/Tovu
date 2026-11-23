import { detectAgents } from "@jini-ai/agent-runtime";
import { testAgentRoute } from "@jini-ai/cms/admin-http/routes/assistant/test-agent";
import { ADMIN_ASSISTANT_PERMISSION } from "#src/assistant/index";
import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { registerAdminAssistantDetectAgentsRoute } from "#src/server/inbound/admin-http/routes/assistant/detect-agents";
import { registerAdminAssistantTestConnectionRoute } from "#src/server/inbound/admin-http/routes/assistant/test-connection";
import { registerAdminAssistantListModelsRoute } from "#src/server/inbound/admin-http/routes/assistant/list-models";
import type { AssistantExecutionRouteDeps, AssistantExecutionRouteRegistrar } from "#src/server/inbound/admin-http/routes/assistant/execution-deps";
import type { ServerModuleHandle } from "./types.js";

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
 *
 * The per-agent check is a Jini route spec (`@jini-ai/cms/admin-http/routes/assistant/test-agent`);
 * its registrar below binds the detection boundary: an injected `deps.detectAgents`, else the
 * assistant inventory's runtime, else Jini's PATH/process probe — resolved per request, as before.
 */
export const registerAdminAssistantTestAgentRoute: AssistantExecutionRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: testAgentRoute, deps: {
    workspaceId: deps.workspaceId,
    authorize: (params) => deps.authorize(params),
    adminAssistantPermission: ADMIN_ASSISTANT_PERMISSION,
    detectAgents: (required, optional) => (deps.detectAgents ?? deps.assistantAgentInventory?.runtime.detectAgents ?? detectAgents)(required, optional),
  } }, { authorization: "direct", failure: { operation: "routes/assistant/test-agent", code: "INTERNAL_ERROR" } });
};

export function createAssistantExecutionModule(deps: AssistantExecutionRouteDeps): ServerModuleHandle {
  return {
    name: "assistant-execution",
    registerRoutes: ({ app }, _options = {}) => {
      registerAdminAssistantDetectAgentsRoute({ app, deps });
      registerAdminAssistantTestConnectionRoute({ app, deps });
      registerAdminAssistantListModelsRoute({ app, deps });
      registerAdminAssistantTestAgentRoute({ app, deps });
    },
  };
}
