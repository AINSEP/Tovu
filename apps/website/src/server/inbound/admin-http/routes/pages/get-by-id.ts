import { getAdminPostByIdOrSlug, PostNotFoundError } from "#src/features/post/index";
import { toAdminPostResponse } from "#src/server/inbound/admin-http/http/posts";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps.js";
import { markersOfType } from "@jini-ai/cms/widgets/markers";
import type { PluginExportCatalogRow, PluginExportRuntime } from "#src/features/agent-plugins/exports/runtime";

/** Only describe exports already authored on this page; catalog discovery still belongs to
 * plugins_list. A failed catalog is unavailable, never a broken page editor or a ready button.
 * @complexity O(markers + exports), one catalog load; no templates or secret values returned.
 */
async function pagePluginEmbeds(required: { html: string; workspaceId: string; runtime: PluginExportRuntime | undefined }, _options = {}) {
  if (!required.runtime) return [];
  const markers = markersOfType({ html: required.html, type: "plugin" });
  if (!markers.length) return [];
  const catalog = await required.runtime.catalog({ workspaceId: required.workspaceId }).catch(() => new Map<string, readonly PluginExportCatalogRow[]>());
  const rows = new Map<string, PluginExportCatalogRow>([...catalog.values()].flat().map(row => [JSON.stringify([row.plugin, row.component]), row]));
  return markers.map(({ config }) => {
    const plugin = typeof config.plugin === "string" ? config.plugin : "";
    const component = typeof config.component === "string" ? config.component : "";
    const row = rows.get(JSON.stringify([plugin, component]));
    return { plugin, component, ...(row?.displayName ? { displayName: row.displayName } : {}), availability: row?.availability ?? "PLUGIN_UNAVAILABLE" };
  });
}

/**
 * GET one page (SPEC-002 api.spec.md `PAGE_GET`) — `getAdminPostByIdOrSlug` (same
 * `post` table, same repo `posts/get-by-id.ts` uses, but id-or-slug rather than
 * id-only: the Pages editor URL is slug-based, and this keeps an old id-based
 * bookmark resolving too), plus a `kind === "page"` guard: api.spec.md §6
 * documents `PAGE_GET`'s 404 as "unknown workspace / `ENTRY_NOT_FOUND` (incl.
 * kind mismatch)" — a `kind: "post"` row fetched through `/pages/:pageId` must
 * 404 exactly like an unknown id/slug, not leak the post's existence through
 * this route family ("kind-mismatch 404s are deliberately indistinguishable
 * from not-found", api.spec.md §7).
 *
 * Gated by `content.read` (mirrors `pages/list.ts`'s identical 2026-07-16 authz
 * sweep fix, and `posts/get-by-id.ts`'s own doc note).
 *
 * `code: "ENTRY_NOT_FOUND"` is included on both 404 branches — unlike the legacy
 * `posts/get-by-id.ts` (message-only 404, a modified not new endpoint),
 * errors.spec.md §1/§4 requires `code` on every new endpoint's error response,
 * and names `ENTRY_NOT_FOUND` as exactly this route's not-found/kind-mismatch code.
 */
export const registerAdminPageGetRoute: ContentRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/pages/:pageId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    // Route param kept as `pageId` (external URL shape, untouched) — the value it carries is
    // either the row's id or its slug, resolved below by `getAdminPostByIdOrSlug`.
    const idOrSlug = String(req.params.pageId ?? "");

    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "content.read",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

      const result = await getAdminPostByIdOrSlug({
        deps: { repo: deps.postRepo },
        input: { workspaceId: deps.workspaceId, idOrSlug },
      });

      if (result.post.kind !== "page") {
        // Kind mismatch — treated identically to not-found (api.spec.md §6/§7).
        res.status(404).json({ error: `page '${idOrSlug}' was not found`, code: "ENTRY_NOT_FOUND" });
        return;
      }

      const response = toAdminPostResponse(result.post);
      const pluginEmbeds = await pagePluginEmbeds({ html: result.post.bodyHtml ?? "", workspaceId: deps.workspaceId, runtime: deps.pluginExports });
      res.json(pluginEmbeds.length ? { ...response, pluginEmbeds } : response);
    } catch (err) {
      if (err instanceof PostNotFoundError) {
        res.status(404).json({ error: err.message, code: "ENTRY_NOT_FOUND" });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
