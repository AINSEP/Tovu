import type { Express } from "express";
import { ADMIN_ASSISTANT_PERMISSION } from "#src/assistant/index";
import { getAuthedCredentialKind, getAuthedPrincipal, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";
import { renderSiteChatComparisonFrame, renderSiteChatComparisonPage } from "./chat-comparison-html.js";

/**
 * Development sandbox only. Each document requires the existing browser-session and permission
 * gates; iframe URLs are never a way around the parent page's access check. The public assistant
 * endpoint retains its own master switch, credentials and rate limits.
 */
export function registerSiteChatComparisonRoutes({ app, deps }: { app: Express; deps: RouteDeps },
  options: { production?: boolean } = {}): void {
  const base = "/__compare/site-chat";
  app.use(base, (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    // Check on every request too: a server that changes environment must not retain this surface.
    if (options.production ?? process.env.NODE_ENV === "production") { res.sendStatus(404); return; }
    next();
  }, requireAdminSession(deps), async (_req, res, next) => {
    try {
      if (getAuthedCredentialKind(res) !== "session") { res.sendStatus(403); return; }
      const principal = getAuthedPrincipal(res);
      const permission = await deps.authorize({
        principalId: principal.id, permission: ADMIN_ASSISTANT_PERMISSION,
        workspaceId: deps.workspaceId, entityType: "assistant-settings",
      });
      if (!permission.allowed) { res.sendStatus(403); return; }
      next();
    } catch (error) { next(error); }
  });
  app.get(base, (_req, res) => res.type("html").send(renderSiteChatComparisonPage({})));
  for (const variant of ["react", "vanilla"] as const) {
    app.get(`${base}/${variant}`, (_req, res) => res.type("html").send(renderSiteChatComparisonFrame({ variant })));
  }
}
