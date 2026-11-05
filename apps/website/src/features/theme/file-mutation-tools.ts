import { createPreparedBatchHandler, requireInputRecord, requireString, withSchemaOnRejection, ToolInputError, type AgentToolDefinition, type ToolRegistration } from '@jini-ai/core';
import { adaptLegacyAuthorize, requireToolPermission } from '@jini-ai/cms/core';
import { assertThemeFileWritable, findThemeOrThrow, isShapeRejection, type ThemeToolDeps } from './asset-operations.js';
import { readThemeFileVersion, validateThemeFileWrite, withReviewedThemeFileWrite } from './theme-files.js';
import { THEME_WRITE_PERMISSION } from './agent-tools.js';
import { syncThemeRoster } from './theme-roster-sync.js';
import { THEME_CONTENT_REPLACEMENT_TOOL_IDS } from '../../contracts/core/tool-metadata/theme.js';

const CONTENT_TOOLS: ReadonlySet<string> = new Set(THEME_CONTENT_REPLACEMENT_TOOL_IDS);

type PreparedThemeFile = {
  file: { themeDir: string; themesRoot: string; relativePath: string };
  target: string; version: string | null;
};

/** Theme replacements reuse Jini's prepare/run lifecycle for single calls and complete batches.
 * Paths and permission are checked before effects; the original handler rechecks its domain rules.
 * New and byte-identical writes run directly too. The persistence owner's SHA-256 version pins
 * the destination without buffering it; no remembered permission widens a later batch.
 * @param required - Domain registrations, current theme registry and schema catalog.
 * @returns Registrations retaining their single-call results and one combined batch preflight.
 * @throws Input/permission/I/O failures before effects, including a destination changed since preparation.
 * @complexity O(registrations) setup; each call reads selected destination bytes twice in O(1) space.
 */
export function protectThemeFileTools(
  { registrations, deps, catalog }: { registrations: ToolRegistration[]; deps: ThemeToolDeps; catalog: ReadonlyMap<string, AgentToolDefinition> },
  _options = {},
): ToolRegistration[] {
  return registrations.map(registration => {
    const toolId = registration.descriptor.id;
    if (!CONTENT_TOOLS.has(toolId)) return registration;
    return { ...registration, handler: createPreparedBatchHandler<PreparedThemeFile>({
        prepare: async ({ ctx }) => {
          const input = requireInputRecord({ input: ctx.input });
          // These five catalog contracts require string fields. Reuse their declared requirements
          // so an invalid payload cannot reach authorization or any replacement effect.
          const schema = registration.descriptor.inputSchema as { required: readonly string[] };
          for (const key of schema.required) requireString({ input, key }, { allowEmpty: key === 'newString' });
          const themeId = requireString({ input, key: 'themeId' });
          const relativePath = requireString({ input, key: 'path' });
          await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId,
            principalId: ctx.principal.id, permission: THEME_WRITE_PERMISSION }, { entityType: 'theme', entityId: themeId });
          return withSchemaOnRejection({ toolId, catalog, isShapeRejection: ({ error }) => isShapeRejection(error), fn: async () => {
            syncThemeRoster({ themes: deps.themes, themesDir: deps.themesDir });
            const theme = findThemeOrThrow(deps, themeId);
            assertThemeFileWritable(theme, relativePath);
            const file = { themeDir: theme.dir, themesRoot: deps.themesDir, relativePath };
            if (toolId === 'theme_write_file') validateThemeFileWrite({ ...file, content: requireString({ input, key: 'content' }) }, { overwriteOversized: input.overwriteOversized === true });
            return { file, ...readThemeFileVersion(file) };
          } });
        },
        // Revisions keep the old bytes; owner rule: only permanent deletes confirm.
        // The version pin still matters without a review gap: batch preparation and asynchronous
        // import downloads can yield before persistence. Never overwrite an intervening change.
        run: async ({ ctx, prepared }, options) => {
          const current = readThemeFileVersion(prepared.file);
          if (current.target !== prepared.target || current.version !== prepared.version) {
            throw new ToolInputError({ message: 'The theme file changed during review. Read it again and retry; this file was not replaced.' });
          }
          return withReviewedThemeFileWrite({ prepared, run: () => registration.handler(ctx, options) });
        },
    }) };
  });
}
