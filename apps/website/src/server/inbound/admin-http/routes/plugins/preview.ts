import { PluginHookFailedError } from "#src/features/plugin-runtime/hook-registry";
import { pluginHookFailedBody } from "#src/server/inbound/admin-http/http/plugin-hook-error";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { Response } from "express";
import type { PluginsRouteRegistrar } from "./deps.js";

/** One previewable draft, as the admin editor sends it. */
interface PreviewDraft {
  readonly postId?: string;
  readonly title: string;
  readonly slug?: string;
  readonly bodyJson: Readonly<Record<string, unknown>>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isOptionalString = (value: unknown): boolean => value === undefined || typeof value === "string";

/** The body's draft, or `null` when it is not one. `metaDescription` is accepted for the editor's
 *  sake but not forwarded: the SDK's `ContentEntryDraft` has no such field yet (AW-7 DX log A1/B6),
 *  so a filter could only read it by cast. @complexity O(1). */
function parsePreviewDraft(body: unknown): PreviewDraft | null {
  if (!isPlainObject(body)) return null;
  const { postId, title, slug, bodyJson, metaDescription } = body;
  if (typeof title !== "string" || !isPlainObject(bodyJson)) return null;
  if (!isOptionalString(postId) || !isOptionalString(slug) || !isOptionalString(metaDescription)) return null;
  return {
    title,
    bodyJson,
    ...(postId === undefined ? {} : { postId: postId as string }),
    ...(slug === undefined ? {} : { slug: slug as string }),
  };
}

/** Maps this route's thrown errors onto the admin error envelope. A hook failure is the plugin's
 *  (422 — the draft could not be processed), in the save routes' `PLUGIN_HOOK_FAILED` envelope with
 *  fixed preview text — never the plugin's own error; anything else names no internals.
 *  @complexity O(1). */
function sendPluginPreviewError(res: Response, err: unknown): void {
  if (err instanceof PluginHookFailedError) {
    res.status(422).json(pluginHookFailedBody(err, { publicText: `a site plugin (${err.pluginId}) failed on this draft; nothing was saved` }));
    return;
  }
  res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
}

/**
 * @file `PLUGIN_PREVIEW` — `POST /api/admin/v1/workspaces/:workspaceId/plugins/:pluginId/preview`
 * (AW-7 Tier 2, 2026-10-04). Runs ONE enabled plugin's `content.entry.beforeSave` filter on a draft
 * and returns that plugin's validated fields, without saving anything: the post editor's "Analyze
 * now" (`apps/admin/src/features/content-analysis/`). Generic — any plugin with an attached filter.
 *
 * Structured like `files.ts`: authorize, run discovery, call a pre-bound mechanism, map its typed
 * error. Gated on `content.write`, the permission editing a post needs, and authorized BEFORE the id
 * is looked up so a caller without it learns nothing about which plugin ids exist.
 *
 * The mechanism is `deps.previewPluginBeforeSave` (`HookRegistry.previewBeforeSave`): same snapshot
 * and declared-field validation as a save, but a failure never counts toward quarantine, so an
 * editor trying drafts cannot switch a plugin off. A tier-2 plugin's filter runs in a fresh worker.
 * Workspace-scoped like every sibling route (the original design brief named an unscoped path).
 */
export const registerPluginPreviewRoute: PluginsRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/plugins/:pluginId/preview", async (req, res) => {
    if (req.params.workspaceId !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const pluginId = req.params.pluginId;

    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "content.write",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

      const draft = parsePreviewDraft(req.body);
      if (!draft) {
        res.status(400).json({
          error: "title (string) and bodyJson (object) are required; postId, slug and metaDescription must be strings",
          code: "VALIDATION_ERROR",
        });
        return;
      }

      if (!(await deps.discoverPlugins()).some((candidate) => candidate.id === pluginId)) {
        res.status(404).json({ error: "plugin was not found", code: "PLUGIN_NOT_FOUND" });
        return;
      }

      const fields = await deps.previewPluginBeforeSave(pluginId, {
        id: draft.postId ?? "preview",
        workspaceId: deps.workspaceId,
        title: draft.title,
        slug: draft.slug ?? "",
        status: "draft",
        bodyJson: draft.bodyJson,
        ext: {},
      });
      if (fields === null) {
        res.status(409).json({ error: "plugin is not enabled", code: "PLUGIN_NOT_ENABLED" });
        return;
      }
      res.json({ pluginId, fields });
    } catch (err) {
      sendPluginPreviewError(res, err);
    }
  });
};
