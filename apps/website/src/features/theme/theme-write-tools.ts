import { assertThemeFileWritable, findThemeOrThrow, reloadThemeInPlace, isShapeRejection, type ThemeToolDeps } from "./asset-operations.js";
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { describeHardcodedLinkList } from "./hardcoded-link-lists.js";
import { requireInputRecord, requireString, withSchemaOnRejection, type ToolHandler } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
import { THEME_WRITE_PERMISSION } from "./agent-tools.js";
import { readThemeFile } from "./theme-files.js";
import { writeThemeFile } from "./theme-file-writing.js";
import { CATALOG_BY_ID } from "./theme-tool-catalog.js";
import { assertCompiledWriteBoundaryUnchanged, applyThemeFileEdit, countOccurrences } from "./theme-tool-editing.js";
import { toThemeToolView } from "./theme-tool-view.js";


    export async function theme_write_file(routeDeps: ThemeToolDeps, ctx: Parameters<ToolHandler>[0]) {
      const input = requireInputRecord({ input: ctx.input });
      const themeId = requireString({ input: input, key: "themeId" });
      const relativePath = requireString({ input: input, key: "path" });
      const content = requireString({ input: input, key: "content" });
      // Only the boolean `true` opts in, the same way `theme_edit_file` reads `replaceAll`.
      const overwriteOversized = input.overwriteOversized === true;
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_WRITE_PERMISSION }, { entityType: "theme", entityId: themeId });

      return withSchemaOnRejection({ toolId: "theme_write_file", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isShapeRejection({ error }), fn: async () => {
        const theme = findThemeOrThrow({ routeDeps, themeId });

        // ADR-020 §5 generated-tree refusal + the `preview/` security-parity refusal —
        // both checked BEFORE any filesystem write, so a rejected write never touches disk. See
        // `assertThemeFileWritable`'s own doc; shared with `theme_edit_file` below.
        assertThemeFileWritable({ theme, relativePath });

        assertCompiledWriteBoundaryUnchanged({ theme, relativePath, content });
        let previousRevision: { trashedPath: string; note: string } | undefined;
        ctx.signal.throwIfAborted();
        writeThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath, content }, { overwriteOversized,
          onRevision: ({ trashedPath }) => { previousRevision = { trashedPath,
            note: `Read the previous bytes with theme_read_file at '${trashedPath}' and write them back to '${relativePath}' with theme_write_file to undo.` }; },
        });

        // Re-validate through the SAME `loadTheme()` a boot-time discovery uses — the whole point of
        // this domain's safety argument is that an agent-authored file is validated identically to a
        // human-authored one, so re-running the real loader (rather than a bespoke "check what we
        // just wrote" path) is what makes that true rather than merely claimed.
        const reloaded = reloadThemeInPlace({ routeDeps, theme, themeId });
        // A warning, not a refusal: a hard-coded link list in a header/footer partial is a fixable
        // mistake, but plain links can be deliberate (see `hardcoded-link-lists.ts`).
        const warning = describeHardcodedLinkList({ path: relativePath, content });

        return {
          themeId,
          path: relativePath,
          bytesWritten: Buffer.byteLength(content, "utf8"),
          status: reloaded.status,
          errors: reloaded.errors,
          theme: toThemeToolView(reloaded),
          ...(previousRevision ? { previousRevision } : {}),
          ...(warning ? { warning } : {}),
        };
      } });
    }

    export async function theme_edit_file(routeDeps: ThemeToolDeps, ctx: Parameters<ToolHandler>[0]) {
      const input = requireInputRecord({ input: ctx.input });
      const themeId = requireString({ input: input, key: "themeId" });
      const relativePath = requireString({ input: input, key: "path" });
      const oldString = requireString({ input: input, key: "oldString" });
      const newString = requireString({ input: input, key: "newString" }, { allowEmpty: true });
      const replaceAll = input.replaceAll === true;
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: THEME_WRITE_PERMISSION }, { entityType: "theme", entityId: themeId });

      return withSchemaOnRejection({ toolId: "theme_edit_file", catalog: CATALOG_BY_ID, isShapeRejection: ({ error }) => isShapeRejection({ error }), fn: async () => {
        const theme = findThemeOrThrow({ routeDeps, themeId });

        // Same two ADR-020/`preview/` refusals `theme_write_file` checks, and for the identical
        // reason — a partial edit is still a write, and must be refused BEFORE reading the file so
        // an agent gets one clear reason rather than a read that then turns out pointless.
        assertThemeFileWritable({ theme, relativePath });

        const currentContent = readThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath });
        const nextContent = applyThemeFileEdit({ currentContent, edit: { oldString, newString, replaceAll, ...(input.intent === "delete" ? { intent: "delete" as const } : {}) }, relativePath });
        const occurrencesReplaced = replaceAll ? countOccurrences({ haystack: currentContent, needle: oldString }) : 1;

        assertCompiledWriteBoundaryUnchanged({ theme, relativePath, content: nextContent });
        ctx.signal.throwIfAborted();
        writeThemeFile({ themeDir: theme.dir, themesRoot: routeDeps.themesDir, relativePath, content: nextContent });
        const reloaded = reloadThemeInPlace({ routeDeps, theme, themeId });
        // Checked against the whole file after the edit, the same warning `theme_write_file` returns.
        const warning = describeHardcodedLinkList({ path: relativePath, content: nextContent });

        return {
          themeId,
          path: relativePath,
          occurrencesReplaced,
          bytesWritten: Buffer.byteLength(nextContent, "utf8"),
          status: reloaded.status,
          errors: reloaded.errors,
          theme: toThemeToolView(reloaded),
          ...(warning ? { warning } : {}),
        };
      } });
    }
