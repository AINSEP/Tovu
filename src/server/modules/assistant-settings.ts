import { registerAdminAssistantGetSettingsRoute } from "../routes/admin/assistant/get-settings";
import { registerAdminAssistantPutSettingsRoute } from "../routes/admin/assistant/put-settings";
import { registerAdminAssistantGetSiteCredentialRoute } from "../routes/admin/assistant/get-site-credential";
import { registerAdminAssistantPutSiteCredentialRoute } from "../routes/admin/assistant/put-site-credential";
import { registerAdminAssistantDeleteSiteCredentialRoute } from "../routes/admin/assistant/delete-site-credential";
import type { AssistantSettingsRouteDeps } from "../routes/admin/assistant/deps";
import type { ServerModuleHandle } from "./types";

/**
 * @file ADR-046 Phase 3 / ADR-058 — the `assistant-settings` server module: the admin routes
 * backing the AI Assistant section — the public on/off switch (2 routes) plus, since ADR-058, the
 * SITE's encrypted provider credential (3 more: GET/PUT/DELETE `.../assistant/site-credential`).
 * Folded into this same module rather than a new one — see `routes/admin/assistant/deps.ts`'s
 * header for why (same auth gate, same "AI Assistant admin section" concern).
 *
 * Distinct from `modules/assistant.ts`, which is the session-gated reverse proxy in front of the
 * agent-daemon process. The two share a word and nothing else: this one holds repos and serves
 * ordinary JSON CRUD, that one holds no repo and streams SSE from another process. See
 * `routes/admin/assistant/deps.ts` for the same note next to the dependency slice.
 *
 * All 5 routes live under `/api/admin/v1/...`, inside the `/api/admin` session gate
 * `createCoreModule` mounts, so registration order relative to the site's `GET /:slug` catch-all is
 * not load-bearing the way `modules/seo.ts`'s public sitemap/robots routes are.
 */
export function createAssistantSettingsModule(deps: AssistantSettingsRouteDeps): ServerModuleHandle {
  return {
    name: "assistant-settings",
    registerRoutes: (app) => {
      registerAdminAssistantGetSettingsRoute(app, deps);
      registerAdminAssistantPutSettingsRoute(app, deps);
      registerAdminAssistantGetSiteCredentialRoute(app, deps);
      registerAdminAssistantPutSiteCredentialRoute(app, deps);
      registerAdminAssistantDeleteSiteCredentialRoute(app, deps);
    },
  };
}
