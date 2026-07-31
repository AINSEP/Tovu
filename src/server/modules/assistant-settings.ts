import { registerAdminAssistantGetSettingsRoute } from "../routes/admin/assistant/get-settings";
import { registerAdminAssistantPutSettingsRoute } from "../routes/admin/assistant/put-settings";
import type { AssistantSettingsRouteDeps } from "../routes/admin/assistant/deps";
import type { ServerModuleHandle } from "./types";

/**
 * @file ADR-046 Phase 3 — the `assistant-settings` server module: the 2 admin routes backing the
 * AI Assistant section's public on/off switch.
 *
 * Distinct from `modules/assistant.ts`, which is the session-gated reverse proxy in front of the
 * agent-daemon process. The two share a word and nothing else: this one holds a settings repo and
 * serves ordinary JSON CRUD, that one holds no repo and streams SSE from another process. See
 * `routes/admin/assistant/deps.ts` for the same note next to the dependency slice.
 *
 * Both routes live under `/api/admin/v1/...`, inside the `/api/admin` session gate
 * `createCoreModule` mounts, so registration order relative to the site's `GET /:slug` catch-all is
 * not load-bearing the way `modules/seo.ts`'s public sitemap/robots routes are.
 */
export function createAssistantSettingsModule(deps: AssistantSettingsRouteDeps): ServerModuleHandle {
  return {
    name: "assistant-settings",
    registerRoutes: (app) => {
      registerAdminAssistantGetSettingsRoute(app, deps);
      registerAdminAssistantPutSettingsRoute(app, deps);
    },
  };
}
