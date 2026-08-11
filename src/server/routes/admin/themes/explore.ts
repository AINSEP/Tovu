import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Response } from "express";

import { findTheme, THEME_CATALOG_DIR } from "#src/features/theme/index";
import { readThemeFile, writeThemeFile, ThemePathError } from "#src/features/theme/theme-files";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { ContentRouteDeps } from "../content/deps";
import type { ContentRouteRegistrar } from "../content/deps";

/**
 * @file The Explore screen's backend: one theme's editable surface, plus read/write of its files.
 *
 * Theme file access already existed — but only as AGENT tools (`features/theme/tool-registrations.ts`),
 * reachable by an assistant and by nothing else. These are the same three operations over HTTP so a
 * human can do them too, sharing `theme-files.ts`'s containment helpers rather than re-deriving path
 * safety per surface.
 *
 * Both mutating and reading routes are gated on `theme.set`, matching every other route on this
 * resource. There is no separate read permission in the catalog, and `presentation/get.ts` already
 * documents that same reuse.
 */

/** `theme.set` gate + workspace check, shared by all three routes below. */
async function authorizeThemeAccess(
  deps: ContentRouteDeps,
  req: { params: Record<string, unknown> },
  res: Response
): Promise<boolean> {
  if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
    res.status(404).json({ error: "workspace was not found" });
    return false;
  }
  const principal = getAuthedPrincipal(res);
  const authResult = await deps.authorize({
    principalId: principal.id,
    permission: "theme.set",
    workspaceId: deps.workspaceId,
    entityType: "presentation",
  });
  if (!authResult.allowed) {
    res.status(403).json({
      error: `principal '${principal.id}' is not authorized for 'theme.set' (${authResult.reason})`,
      code: "FORBIDDEN",
      details: { permission: "theme.set", reason: authResult.reason },
    });
    return false;
  }
  return true;
}

/**
 * Map a containment/size failure to 400 and everything else to 500.
 *
 * `ThemePathError` is the one error class here that reflects bad INPUT — a path escaping the theme
 * root, a missing file, an oversized body. Collapsing it into 500 would tell the admin "the server
 * broke" when the honest answer is "that path is not editable", which is the difference between a
 * user fixing their own mistake and filing a bug.
 */
function sendThemeFileError(res: Response, err: unknown): void {
  if (err instanceof ThemePathError) {
    res.status(400).json({ error: err.message, code: "INVALID_THEME_PATH" });
    return;
  }
  res.status(500).json({ error: "internal error" });
}

/** GET one theme's detail — what the Explore screen lists and what its banner says. */
export const registerAdminThemeDetailRoute: ContentRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/themes/:themeId", async (req, res) => {
    try {
      if (!(await authorizeThemeAccess(deps, req, res))) return;

      const themeId = String(req.params.themeId ?? "");
      const theme = findTheme({ themes: deps.themes, id: themeId });
      if (!theme) {
        res.status(404).json({ error: `theme '${themeId}' was not found` });
        return;
      }

      // `lineage` is written by the copy/download flows but deliberately NOT parsed into
      // `ThemeManifest` — it is metadata about where a copy came from, never anything the renderer
      // resolves, and putting it on the manifest would invite exactly the runtime-inheritance
      // reading the copy model exists to remove. Read from the raw manifest here instead.
      let lineage: unknown = null;
      try {
        const raw = JSON.parse(
          readThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: "theme.json" })
        ) as Record<string, unknown>;
        lineage = raw.lineage ?? null;
      } catch {
        lineage = null;
      }

      // An untouched original to reset back to. Checked on disk rather than inferred from `lineage`,
      // because a manifest can claim an origin whose folder was since deleted — and the banner's
      // promise ("you can always get back to what you started from") must reflect what is actually
      // recoverable, not what a copy remembers being told.
      const hasOriginal = existsSync(
        join(deps.themesDir, THEME_CATALOG_DIR, theme.manifest.tier, theme.manifest.id)
      );

      res.json({
        id: theme.manifest.id,
        name: theme.manifest.name,
        tier: theme.manifest.tier,
        status: theme.status,
        errors: theme.errors,
        pages: Object.keys(theme.pages).sort(),
        partials: Object.keys(theme.partials).sort(),
        lineage,
        hasOriginal,
      });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

/** GET the raw source of one file inside a theme. */
export const registerAdminThemeFileGetRoute: ContentRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/themes/:themeId/file", async (req, res) => {
    try {
      if (!(await authorizeThemeAccess(deps, req, res))) return;

      const themeId = String(req.params.themeId ?? "");
      const theme = findTheme({ themes: deps.themes, id: themeId });
      if (!theme) {
        res.status(404).json({ error: `theme '${themeId}' was not found` });
        return;
      }

      const path = String((req.query as Record<string, unknown>).path ?? "");
      const content = readThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: path });
      res.json({ path, content });
    } catch (err) {
      sendThemeFileError(res, err);
    }
  });
};

/**
 * PUT one file inside a theme.
 *
 * Reachable only for themes DISCOVERY returned — which structurally excludes the originals catalog
 * and the marketplace fixture, since neither is discovered. That is the invariant the whole copy
 * model rests on: an original cannot be edited, so a copy always has something intact to reset to,
 * and it holds here because of where the theme list comes from rather than because of a check
 * somebody has to remember to write.
 */
export const registerAdminThemeFilePutRoute: ContentRouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/themes/:themeId/file", async (req, res) => {
    try {
      if (!(await authorizeThemeAccess(deps, req, res))) return;

      const themeId = String(req.params.themeId ?? "");
      const theme = findTheme({ themes: deps.themes, id: themeId });
      if (!theme) {
        res.status(404).json({ error: `theme '${themeId}' was not found` });
        return;
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const path = String(body.path ?? "");
      const content = body.content;
      if (typeof content !== "string") {
        res.status(400).json({ error: "content must be a string", code: "INVALID_BODY" });
        return;
      }

      writeThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: path, content });
      res.json({ path, bytes: Buffer.byteLength(content, "utf8") });
    } catch (err) {
      sendThemeFileError(res, err);
    }
  });
};
