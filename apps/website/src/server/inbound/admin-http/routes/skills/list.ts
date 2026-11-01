import { ToolInputError } from "@jini-ai/core";
import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import { createHash } from "node:crypto";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { listManagedSkills } from "#src/features/skills/install-service";
import type { SkillsRouteRegistrar } from "./deps.js";

/**
 * @file C-001 `GET /api/admin/v1/workspaces/:workspaceId/skills` — implementation-outline.md
 * (skills-composer-typeahead), §Q1/§Contract Map.
 *
 * A plain read, same path grammar/workspace guard/authorize-then-project shape as
 * `routes/admin/plugins/list.ts`'s `PLUGINS_LIST`. Reads `<site>/skills/` fresh on every request via
 * `loadInstalledSkillToolSources` — the SAME function the agent daemon calls once at boot
 * (`agent-daemon-server.ts:887`) to register `skill_*` tools, while the agent registries refresh before discovery and execution. Permission is
 * `admin.assistant.use` (D-3): the same permission the skill tools themselves declare
 * (`tool-registrations.ts:333`), granted to the seeded owner's wildcard policy.
 *
 * Unexpected discovery failures are logged with a public error ID. Raw filesystem or provider
 * exceptions must never be returned verbatim.
 */
export const registerSkillsListRoute: SkillsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/skills", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "admin.assistant.use",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

      const body = JSON.stringify({ skills: await listManagedSkills(deps) });
      const etag = `W/"${createHash("sha256").update(body).digest("base64url")}"`;
      res.set({ "Cache-Control": "private, no-cache", ETag: etag });
      res.vary("Cookie");
      // Not Express's req.fresh: fetch adds `Cache-Control: no-cache` to any request that carries
      // If-None-Match (Fetch spec), and `fresh` reads that as a reload, so it would never send 304.
      if (req.get("If-None-Match")?.split(",").some(tag => tag.trim() === etag)) {
        res.status(304).end();
        return;
      }
      res.type("json").send(body);
    } catch (error) {
      // C-001 requires the named duplicate folders; only the discovery owner marks this safe.
      if (error instanceof ToolInputError) { res.status(500).json({ error: error.message, code: "INTERNAL_ERROR" }); return; }
      sendAdminFailure({ res, error }, { operation: "routes/skills/list", code: "INTERNAL_ERROR" });
    }
  });
};
