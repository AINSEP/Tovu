import { registerAdminAssistantGetSettingsRoute } from "../../../inbound/admin-http/routes/assistant/get-settings.js";
import { registerAdminAssistantPutSettingsRoute } from "../../../inbound/admin-http/routes/assistant/put-settings.js";
import { registerAdminAssistantGetSiteCredentialRoute } from "../../../inbound/admin-http/routes/assistant/get-site-credential.js";
import { registerAdminAssistantPutSiteCredentialRoute } from "../../../inbound/admin-http/routes/assistant/put-site-credential.js";
import { registerAdminAssistantDeleteSiteCredentialRoute } from "../../../inbound/admin-http/routes/assistant/delete-site-credential.js";
import { registerAdminAssistantGetExecutionCredentialRoute } from "../../../inbound/admin-http/routes/assistant/get-execution-credential.js";
import { registerAdminAssistantPutExecutionCredentialRoute } from "../../../inbound/admin-http/routes/assistant/put-execution-credential.js";
import { registerAdminAssistantDeleteExecutionCredentialRoute } from "../../../inbound/admin-http/routes/assistant/delete-execution-credential.js";
import type { AssistantSettingsRouteDeps } from "../../../inbound/admin-http/routes/assistant/deps.js";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 / ADR-058 / admin-BYOK-keystore design — the `assistant-settings` server
 * module: the admin routes backing the AI Assistant section — the public on/off switch (2 routes),
 * the SITE's encrypted provider credential since ADR-058 (3 more: GET/PUT/DELETE
 * `.../assistant/site-credential`), and now the ADMIN's OWN encrypted BYOK credential (3 more:
 * GET/PUT/DELETE `.../assistant/execution-credential`, design:
 * `ADS-memory/reports/analysis/2026-08-05-admin-byok-keystore-design.md`, owner-approved). Folded
 * into this same module rather than a new one — see `routes/admin/assistant/deps.ts`'s header for
 * why (same "AI Assistant admin section" concern; the execution-credential trio's auth gate is
 * narrower — self-scoped by session identity rather than `ADMIN_ASSISTANT_PERMISSION` — but that is
 * a per-route difference, not a reason for a separate module).
 *
 * Distinct from `modules/assistant.ts`, which is the session-gated reverse proxy in front of the
 * agent-daemon process. The two share a word and nothing else: this one holds repos and serves
 * ordinary JSON CRUD, that one holds no repo and streams SSE from another process. See
 * `routes/admin/assistant/deps.ts` for the same note next to the dependency slice.
 *
 * All 8 routes live under `/api/admin/v1/...`, inside the `/api/admin` session gate
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
      registerAdminAssistantGetExecutionCredentialRoute(app, deps);
      registerAdminAssistantPutExecutionCredentialRoute(app, deps);
      registerAdminAssistantDeleteExecutionCredentialRoute(app, deps);
    },
  };
}
