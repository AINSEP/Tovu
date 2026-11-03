import { createBatchApprovalHandler, requireInputRecord, requireString, withSchemaOnRejection, ToolInputError, type AgentToolDefinition, type ToolRegistration } from '@jini-ai/core';
import { adaptLegacyAuthorize, requireToolPermission } from '@jini-ai/cms/core';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import { requireHumanConfirm, notConfirmedResult, type HumanConfirmSpec } from '../../contracts/core/human-confirm.js';
import { assertThemeFileWritable, findThemeOrThrow, isShapeRejection, type ThemeToolDeps } from './asset-operations.js';
import { readThemeFileVersion, validateThemeFileWrite, withReviewedThemeFileWrite } from './theme-files.js';
import { THEME_WRITE_PERMISSION } from './agent-tools.js';
import { syncThemeRoster } from './theme-roster-sync.js';
import { THEME_CONTENT_REPLACEMENT_TOOL_IDS } from '../../contracts/core/tool-metadata/theme.js';

const CONTENT_TOOLS: ReadonlySet<string> = new Set(THEME_CONTENT_REPLACEMENT_TOOL_IDS);

type PreparedThemeFile = {
  file: { themeDir: string; themesRoot: string; relativePath: string };
  target: string; version: string | null; themeId: string;
};

/** Theme replacements use the existing Jini prepare/approve/run owner, with one card per batch.
 * Paths and permission are checked before the card; the original handler rechecks all its domain
 * rules after approval. New files run directly. No remembered permission widens a later batch.
 * @param required - Domain registrations, current theme registry and the host's exchange transport.
 * @returns Registrations retaining their single-call results and one combined batch plan.
 * @throws Input/permission/I/O failures before effects, including a destination changed during review.
 * @complexity O(registrations) setup; each call reads selected destination bytes twice in O(1) space.
 */
export function protectThemeFileTools(
  { registrations, deps, surfaces, catalog }: { registrations: ToolRegistration[]; deps: ThemeToolDeps; surfaces: AssistantSurfaceDeps; catalog: ReadonlyMap<string, AgentToolDefinition> },
  _options = {},
): ToolRegistration[] {
  return registrations.map(registration => {
    const toolId = registration.descriptor.id;
    if (!CONTENT_TOOLS.has(toolId)) return registration;
    return { ...registration, handler: createBatchApprovalHandler<PreparedThemeFile, HumanConfirmSpec>({
      steps: {
        prepare: async ({ ctx }) => {
          const input = requireInputRecord({ input: ctx.input });
          // These five catalog contracts require string fields. Reuse their declared requirements
          // so an invalid payload cannot reach authorization or open a pointless review card.
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
            return { file, ...readThemeFileVersion(file), themeId };
          } });
        },
        describe: ({ prepared }) => ({ ask: prepared.version !== null, description: {
          toolId, errorCode: 'THEME_REPLACE', title: 'Replace theme file content?',
          details: [{ label: 'Theme', value: prepared.themeId }, { label: 'File', value: prepared.file.relativePath },
            { label: 'Proposed change', value: toolId }],
          warning: 'Previous bytes are kept in .trash/revisions. The latest 20 revisions per theme are retained.',
          confirmLabel: 'Apply changes',
        } satisfies HumanConfirmSpec }),
        askHuman: ({ ctx, description }, options) => requireHumanConfirm({ ctx, surfaces, spec: description }, options),
        run: async ({ ctx, prepared }, options) => {
          const current = readThemeFileVersion(prepared.file);
          if (current.target !== prepared.target || current.version !== prepared.version) {
            throw new ToolInputError({ message: 'The theme file changed during review. Read it again and retry; this file was not replaced.' });
          }
          return withReviewedThemeFileWrite({ prepared, run: () => registration.handler(ctx, options) });
        },
        notConfirmed: ({ reason }) => ({ executed: false, ...notConfirmedResult({ confirmed: false, reason }) }),
      },
      combineDescriptions: ({ descriptions }) => ({ ...descriptions[0]!, title: `Apply ${descriptions.length} theme file changes?`,
        description: 'One confirmation approves this batch. Changes run in order; a failure stops later files, and earlier changes remain restorable.',
        details: descriptions.flatMap((description, index) => [{ label: `Change ${index + 1}`, value: description.details }]),
      }),
    }) };
  });
}
