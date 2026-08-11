import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Response } from "express";

import { findTheme, loadTheme, THEME_CATALOG_DIR } from "#src/features/theme/index";
import {
  listThemeFiles,
  readThemeFile,
  writeThemeFile,
  ThemePathError,
} from "#src/features/theme/theme-files";
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

/**
 * Re-read one theme from disk and swap it into the live `deps.themes` array.
 *
 * Mandatory after ANY write to a theme's files. `DiscoveredTheme.pages`/`partials` hold file
 * CONTENTS, `readFileSync`-ed once at discovery and then held for the life of the process — and the
 * preview renders out of those maps, not off disk. Skip this and a save changes disk and nothing
 * else: the operator saves, the preview redraws identically, and "saving is broken" is the only
 * honest reading. That is exactly the bug this screen shipped with.
 *
 * Reloads ONE theme rather than rescanning all of them, matching what the `theme_write_file` AGENT
 * tool has always done (`features/theme/tool-registrations.ts`) — that path had this right first,
 * and two surfaces onto the same capability should not refresh state two different ways.
 *
 * Re-validates through the same `loadTheme` boot-time discovery uses, so a file written here is
 * checked identically to one written by hand, and a theme edited into an invalid state reports
 * `status: "invalid"` rather than silently rendering stale-but-valid markup.
 */
function reloadTheme(deps: ContentRouteDeps, themeId: string): void {
  const index = deps.themes.findIndex((t) => t.manifest.id === themeId);
  if (index < 0) return;
  const current = deps.themes[index];
  deps.themes[index] = loadTheme({ themeDir: current.dir, id: themeId, source: current.source });
}

/**
 * Extensions safe to hand back as UTF-8 text, and therefore editable in a textarea.
 *
 * Everything NOT listed is treated as binary and is never read as text: `readFileSync(…, "utf8")` on
 * a PNG returns mojibake that looks like a corrupt file, and saving that back would actually corrupt
 * it. Binary files are still listed and still viewable — the Explore screen renders them straight
 * from `/theme-assets/{themeId}/{path}`, which already serves every theme's folder — just not
 * editable as source.
 *
 * `.svg` is deliberately on the TEXT side: it is markup, authors do hand-edit it, and it round-trips
 * through UTF-8 losslessly.
 */
const TEXT_EDITABLE_EXTENSIONS = new Set([
  ".html", ".css", ".js", ".mjs", ".cjs", ".json", ".md", ".txt", ".svg", ".webmanifest",
]);

function isTextEditable(relativePath: string): boolean {
  const dot = relativePath.lastIndexOf(".");
  return dot === -1 ? false : TEXT_EDITABLE_EXTENSIONS.has(relativePath.slice(dot).toLowerCase());
}

/**
 * Directories whose contents are GENERATED, and so are never shown as editable theme files.
 *
 * `preview/` is `build-preview.mjs`'s output: a full second copy of the theme's pages and scripts,
 * once per color mode. On `novice` that is 36 of 79 listed files — `js/main.js`,
 * `preview/dark/js/main.js` and `preview/light/js/main.js` all show as "main.js" with nothing to
 * distinguish them, which buried the ~30 real source files under three-way duplicates of themselves.
 *
 * Editing one of these would also be pointless-to-harmful: the next `build-preview.mjs` run
 * overwrites it, so the change silently disappears. (That script is itself a legacy spike predating
 * static-tier rendering — see `theme-preview-static.ts` — and retiring it would remove this folder
 * entirely.)
 *
 * `screenshots/` is deliberately NOT excluded: those are real assets an author may want to look at
 * or replace, and they are the theme's own marketing images rather than a copy of its source.
 */
const GENERATED_DIRS = ["preview/"];

function isGenerated(relativePath: string): boolean {
  return GENERATED_DIRS.some((dir) => relativePath.startsWith(dir));
}

/**
 * Coarse grouping for the Explore file list, derived from path/extension alone.
 *
 * Presentation-only: the server does not care what a file is FOR, but a flat 60-entry list of every
 * screenshot and vendor script buries the four files an author actually edits. Kept here rather than
 * in the client so the classification has one definition, and stays available to any other consumer.
 */
function fileGroup(relativePath: string): "page" | "partial" | "style" | "script" | "asset" | "config" {
  if (relativePath.startsWith("pages/")) return "page";
  if (relativePath.endsWith(".css")) return "style";
  if (/\.(m|c)?js$/.test(relativePath)) return "script";
  if (/^(theme|tokens|tokens\.light)\.json$/.test(relativePath)) return "config";
  if (!relativePath.includes("/") && relativePath.endsWith(".html")) return "partial";
  return "asset";
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

      // Every file in the theme folder, not just the pages/partials the RENDERER knows about — CSS,
      // JS, tokens, images. Those are the files an author most often actually needs to change to
      // make a downloaded theme theirs, and until now the screen hid all of them.
      const catalogDir = join(deps.themesDir, THEME_CATALOG_DIR, theme.manifest.tier, theme.manifest.id);
      const files = listThemeFiles({ themeDir: theme.dir, themesRoot: deps.themesDir })
        .filter((path) => !isGenerated(path))
        .map((path) => ({
          path,
          group: fileGroup(path),
          editable: isTextEditable(path),
          // Whether THIS file can be reset — a file the author added themselves has no original to
          // go back to, and offering a Reset that would fail is worse than not offering one.
          resettable: hasOriginal && existsSync(join(catalogDir, path)),
        }));

      res.json({
        id: theme.manifest.id,
        name: theme.manifest.name,
        tier: theme.manifest.tier,
        status: theme.status,
        errors: theme.errors,
        pages: Object.keys(theme.pages).sort(),
        partials: Object.keys(theme.partials).sort(),
        files,
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


      // Re-read from disk after writing, or the save is invisible. See `reloadTheme`.
      reloadTheme(deps, theme.manifest.id);

      res.json({ path, bytes: Buffer.byteLength(content, "utf8") });
    } catch (err) {
      sendThemeFileError(res, err);
    }
  });
};

/**
 * POST — restore ONE file to the pristine copy in the originals catalog.
 *
 * This is the payoff for the whole copy-not-inherit model, and the reason the catalog has to be
 * genuinely untouched rather than a hash or a manifest note: "put it back" is a file copy, needing
 * no diff, no history, and no tooling anybody has to build. It is only possible because the original
 * still exists byte-for-byte.
 *
 * Refuses in two distinct cases, kept distinct because they mean opposite things to the operator:
 * the theme has NO stored original at all (nothing anywhere to restore from — a hand-made theme), or
 * the theme has one but this particular file is not in it (a file the AUTHOR added; restoring it
 * would mean deleting their file, which is a different and more destructive operation than "reset",
 * and is not what a button labelled Reset should silently do).
 *
 * DESTRUCTIVE and deliberately not undoable here: it overwrites the working copy with no backup.
 * The confirmation belongs in the UI, where the operator can be told what they are about to lose in
 * words — a server-side "are you sure" flag would just be a second thing to get wrong.
 */
export const registerAdminThemeFileResetRoute: ContentRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/themes/:themeId/file/reset", async (req, res) => {
    try {
      if (!(await authorizeThemeAccess(deps, req, res))) return;

      const themeId = String(req.params.themeId ?? "");
      const theme = findTheme({ themes: deps.themes, id: themeId });
      if (!theme) {
        res.status(404).json({ error: `theme '${themeId}' was not found` });
        return;
      }

      const path = String(((req.body ?? {}) as Record<string, unknown>).path ?? "");
      const catalogDir = join(deps.themesDir, THEME_CATALOG_DIR, theme.manifest.tier, theme.manifest.id);
      if (!existsSync(catalogDir)) {
        res.status(409).json({
          error: `theme '${themeId}' has no stored original, so nothing can be reset`,
          code: "NO_ORIGINAL",
        });
        return;
      }

      // Read through the containment helper against the CATALOG root rather than joining paths by
      // hand: `path` is operator input, and this is the one place in the file that resolves it
      // against a directory outside the theme's own folder.
      let original: string;
      try {
        original = readThemeFile({ themeDir: catalogDir, themesRoot: join(deps.themesDir, THEME_CATALOG_DIR), relativePath: path });
      } catch (err) {
        if (err instanceof ThemePathError) {
          res.status(409).json({
            error: `'${path}' is not in this theme's original, so there is nothing to reset it to`,
            code: "NOT_IN_ORIGINAL",
          });
          return;
        }
        throw err;
      }

      writeThemeFile({ themeDir: theme.dir, themesRoot: deps.themesDir, relativePath: path, content: original });
      reloadTheme(deps, theme.manifest.id);

      res.json({ path, bytes: Buffer.byteLength(original, "utf8"), content: original });
    } catch (err) {
      sendThemeFileError(res, err);
    }
  });
};
