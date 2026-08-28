import { toInstalledSkillsResponse } from "#src/server/inbound/admin-http/http/skills";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { loadInstalledSkillToolSources } from "#src/features/skills/tool-registrations";
import type { SkillsRouteRegistrar } from "./deps.js";

/**
 * @file C-001 `GET /api/admin/v1/workspaces/:workspaceId/skills` — implementation-outline.md
 * (skills-composer-typeahead), §Q1/§Contract Map.
 *
 * A plain read, same path grammar/workspace guard/authorize-then-project shape as
 * `routes/admin/plugins/list.ts`'s `PLUGINS_LIST`. Reads `infra/skills/` fresh on every request via
 * `loadInstalledSkillToolSources` — the SAME function the agent daemon calls once at boot
 * (`agent-daemon-server.ts:887`) to register `skill_*` tools, so this route and the agent's tool
 * registry can never disagree about which skills exist or what their ids are (Q1). Permission is
 * `admin.assistant.use` (D-3): the same permission the skill tools themselves declare
 * (`tool-registrations.ts:333`), granted to the seeded owner's wildcard policy.
 *
 * One deliberate divergence from `plugins/list.ts`'s catch block: that route collapses every throw
 * into a generic `"internal error"` string. This route's contract (C-001) requires the duplicate-
 * frontmatter-name throw's message (`tool-registrations.ts:280-289`, naming both offending skill
 * folders) to reach the response VERBATIM — it is the operator's only actionable signal, and
 * swallowing it would turn a one-line fix into a blind guess.
 */
export const registerSkillsListRoute: SkillsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/skills", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.assistant.use",
        workspaceId: deps.workspaceId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.assistant.use' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.assistant.use", reason: authResult.reason },
        });
        return;
      }

      const sources = await loadInstalledSkillToolSources({ workspaceId: deps.workspaceId });
      res.json({ skills: toInstalledSkillsResponse(sources) });
    } catch (error) {
      // Verbatim surfacing is the contract (C-001) — see this file's header for why this diverges
      // from the generic "internal error" string `plugins/list.ts`'s own catch block uses.
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    }
  });
};
