/** Chat adapters for Jini's bounded draft owner; no filesystem or installation lifecycle here. */
import { adaptLegacyAuthorize, requireToolPermission } from '@jini-ai/cms/core';
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, ToolInputError, type AgentToolDefinition, type DerivedRiskByToolId, type ToolExecutionContext, type ToolHandler, type ToolRegistration } from '@jini-ai/core';
import { PluginInstallError, PluginSourceError, type PluginSourcePort } from '@jini-ai/plugins/host/node';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import type { ToolContributor } from '#src/assistant/index';
import { approvalToolHandler } from '../../contracts/core/human-confirm.js';
import { toolMetadata } from '../../contracts/core/tool-metadata/plugin-runtime.js';
import type { PluginsToolDeps } from './tool-registrations.js';

const WORKFLOW = ' Site-local workflow: plugin_source_create (scaffold) or plugin_source_open (latest installed working copy) → list/read/write/edit draft files → plugin_source_seal → plugins_set_enabled (family site-runtime). Drafts never run. Site plugins support content filters, declarative content types and fields. Use sdk.routes.add with capability http.route.register and contributes.routes (e.g. GET /items); routes mount at /api/p/<plugin-id><path> and declare public/member/admin access. Use sdk.tools.add with tools.register and contributes.tools; assistant ids are p_<plugin-id with hyphens replaced by underscores>__<name>. Use sdk.widgets.add with render.contribute and contributes.widgets for public SSR partials. Every registration must match its manifest declaration. Tier-3 runs with full server access; sandboxing is deferred by owner decision.';
const id = { type: 'string', pattern: '^[a-z0-9-]+$', minLength: 1, maxLength: 50, description: 'Site plugin id; not an Agent Plugin id.' };
const file = { type: 'string', minLength: 1, description: 'Path relative to this plugin draft, e.g. server/index.mjs. Absolute paths, .. and links are refused.' };
const text = { type: 'string' };
function schema(properties: Record<string, unknown>, required: string[]): Readonly<Record<string, unknown>> {
  return { type: 'object', additionalProperties: false, properties: { id, ...properties }, required: ['id', ...required] };
}
/** Static contract consumed by the model and the domain registration contract suite. */
export const pluginSourceAgentToolCatalog: AgentToolDefinition[] = [
  { name: 'plugin_source_create', description: 'Creates a minimal valid site-local tier-3 draft with a manifest, server entry and README. Existing drafts are retained; existing installs are opened without overwrite.' + WORKFLOW,
    sideEffects: 'mutates-durable-state', authorization: { permission: 'admin.plugins.enable' }, inputSchema: schema({ name: text, description: text }, ['name', 'description']) },
  { name: 'plugin_source_open', description: 'Creates a working draft from this site plugin’s latest installed version. Reopening retains all unsealed edits.' + WORKFLOW,
    sideEffects: 'mutates-durable-state', authorization: { permission: 'admin.plugins.enable' }, inputSchema: schema({}, []) },
  { name: 'plugin_source_list', description: 'Lists paths and byte sizes in an opened plugin draft. Use before guessing filenames.' + WORKFLOW,
    sideEffects: 'none', authorization: { permission: 'admin.plugins.read' }, inputSchema: schema({}, []) },
  { name: 'plugin_source_read', description: 'Reads one draft file as text, up to 1 MiB. Read first before an exact edit.' + WORKFLOW,
    sideEffects: 'none', authorization: { permission: 'admin.plugins.read' }, inputSchema: schema({ path: file }, ['path']) },
  { name: 'plugin_source_write', description: 'Creates or overwrites one draft file as text (1 MiB per file; 8 MiB / 512 entries per draft). Use edit for a small change. Live installed bytes remain immutable.' + WORKFLOW,
    sideEffects: 'mutates-durable-state', authorization: { permission: 'admin.plugins.enable' }, inputSchema: schema({ path: file, content: text }, ['path', 'content']) },
  { name: 'plugin_source_edit', description: 'Replaces one exact occurrence of oldString with newString. Refuses zero or multiple matches without writing; use more context or replaceAll:true. Replacement text is literal.' + WORKFLOW,
    sideEffects: 'mutates-durable-state', authorization: { permission: 'admin.plugins.enable' }, inputSchema: schema({ path: file, oldString: { type: 'string', minLength: 1 }, newString: text, replaceAll: { type: 'boolean' } }, ['path', 'oldString', 'newString']) },
  { name: 'plugin_source_delete', description: 'Permanently deletes one draft file after confirmation. Does not remove installed versions; plugins_uninstall owns that. A changed file refuses the approved deletion.' + WORKFLOW,
    sideEffects: 'deletes-durable-state', authorization: { permission: 'admin.plugins.enable' }, inputSchema: schema({ path: file }, ['path']) },
  { name: 'plugin_source_seal', description: 'Validates the draft manifest, computes integrity for every package file, uses a higher manifest version or bumps the latest patch on updates, and installs through the existing installer. Keeps active versions plus the newest three for rollback after a successful reload and reloads enabled code through the controlled loader; initially disabled plugins stay OFF. Validation errors explain what to fix. Check installed/reloaded/reloadError. Runs directly on desktop/dev; hosted installs require TOVU_PLUGIN_LOCAL_INSTALL=1.' + WORKFLOW,
    sideEffects: 'mutates-durable-state', authorization: { permission: 'admin.plugins.enable' }, inputSchema: schema({}, []) },
  { name: 'plugin_source_rollback', description: 'Reinstalls the previous package’s bytes as a new patch version through the same seal/installer/reload path. Preserves active versions, the newest three releases and your unsealed draft. Fails plainly when no previous version exists. If reload quarantined the plugin, enable it after rollback.' + WORKFLOW,
    sideEffects: 'mutates-durable-state', authorization: { permission: 'admin.plugins.enable' }, inputSchema: schema({}, []) },
];
/** Independently derived from calls to the source port: reads are read-only, delete unlinks,
 * and create/open/write/edit/seal/rollback durably publish bytes. */
export const pluginSourceDerivedRisk: DerivedRiskByToolId = new Map([
  ['plugin_source_create', 'mutates-durable-state'], ['plugin_source_open', 'mutates-durable-state'],
  ['plugin_source_list', 'none'], ['plugin_source_read', 'none'], ['plugin_source_write', 'mutates-durable-state'],
  ['plugin_source_edit', 'mutates-durable-state'], ['plugin_source_delete', 'deletes-durable-state'],
  ['plugin_source_seal', 'mutates-durable-state'], ['plugin_source_rollback', 'mutates-durable-state'],
]);
type SourceDeps = Pick<PluginsToolDeps, 'workspaceId' | 'authorize' | 'pluginSource'>;

/** Bind authenticated chat operations to the existing source owner and shared approval transport.
 * @param required Narrow site deps and human exchange transport.
 * @param _optional Reserved registration options.
 * @returns Complete registrations; typed source/install refusals become actionable input errors.
 */
export function buildPluginSourceRegistrations(required: { deps: SourceDeps; surfaces: AssistantSurfaceDeps }, _optional = {}): ToolRegistration[] {
  const { deps, surfaces } = required;
  async function authorize(ctx: ToolExecutionContext, permission: string): Promise<void> {
    await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission }, { entityType: 'plugin' });
  }
  function source(): PluginSourcePort {
    if (!deps.pluginSource) throw new ToolInputError({ message: 'Site plugin source authoring is unavailable: this site has no plugin directory.' });
    return deps.pluginSource;
  }
  async function relay<T>(run: () => Promise<T>): Promise<T> {
    try { return await run(); }
    catch (error) {
      if (error instanceof PluginSourceError || error instanceof PluginInstallError) throw new ToolInputError({ message: `${error.code}: ${error.message}` });
      throw error;
    }
  }
  const handlers: Record<string, ToolHandler> = {};
  for (const tool of pluginSourceAgentToolCatalog) {
    if (tool.name === 'plugin_source_delete') continue;
    handlers[tool.name] = async ctx => {
      await authorize(ctx, tool.authorization.permission);
      const input = requireInputRecord({ input: ctx.input });
      const pluginId = requireString({ input, key: 'id' });
      const string = (key: string) => {
        const value = input[key];
        if (typeof value !== 'string') throw new ToolInputError({ message: `${key} must be a string.` });
        return value;
      };
      return relay(async () => {
        const port = source();
        switch (tool.name) {
          case 'plugin_source_create': return port.create({ id: pluginId, name: string('name'), description: string('description') }, {});
          case 'plugin_source_open': return port.open({ id: pluginId }, {});
          case 'plugin_source_list': return port.list({ id: pluginId }, {});
          case 'plugin_source_read': return port.read({ id: pluginId, path: string('path') }, {});
          case 'plugin_source_write': return port.write({ id: pluginId, path: string('path'), content: string('content') }, {});
          case 'plugin_source_edit': {
            if (input.replaceAll !== undefined && typeof input.replaceAll !== 'boolean') throw new ToolInputError({ message: 'replaceAll must be a boolean.' });
            return port.edit({ id: pluginId, path: string('path'), oldString: string('oldString'), newString: string('newString'), ...(input.replaceAll === undefined ? {} : { replaceAll: input.replaceAll }) }, {});
          }
          case 'plugin_source_seal': return port.seal({ id: pluginId }, {});
          case 'plugin_source_rollback': return port.rollback({ id: pluginId }, {});
          default: throw new ToolInputError({ message: `Unknown source tool ${tool.name}.` });
        }
      });
    };
  }
  // Only permanent source-file deletion asks. The approved file text is pinned across the wait;
  // neither the model's input nor a later draft edit can stand in for human approval.
  handlers.plugin_source_delete = approvalToolHandler({ surfaces,
    prepare: async ({ ctx }) => {
      await authorize(ctx, 'admin.plugins.enable');
      const input = requireInputRecord({ input: ctx.input });
      const target = { id: requireString({ input, key: 'id' }), path: requireString({ input, key: 'path' }) };
      const prior = await relay(() => source().read(target, {}));
      return { target, prior };
    },
    describe: ({ prepared }) => ({ toolId: 'plugin_source_delete', errorCode: 'PLUGIN_SOURCE_DELETE_CONFIRM', title: 'Permanently delete this draft file?', danger: true,
      details: [{ label: 'Plugin', value: prepared.target.id }, { label: 'Draft file', value: prepared.target.path }], confirmLabel: 'Delete', cancelLabel: 'Cancel' }),
    run: async ({ ctx, prepared }) => {
      await authorize(ctx, 'admin.plugins.enable');
      return relay(async () => {
        return source().delete(prepared.target, { expectedDigest: prepared.prior.digest });
      });
    },
  }, { flag: 'deleted' });
  return buildDomainRegistrations({ metadata: toolMetadata, domain: 'plugin-source', catalogModule: 'features/plugin-runtime/source-tools.ts', catalog: indexCatalogById({ catalog: pluginSourceAgentToolCatalog }), derivedRisk: pluginSourceDerivedRisk, handlers });
}

/** Register beside the theme and plugin lifecycle tools in the first-party catalog. */
export function contributePluginSourceTools(_required = {}, _optional = {}): ToolContributor {
  return { domain: 'plugin-source', build: (deps, surfaces) => buildPluginSourceRegistrations({ deps, surfaces }, {}), risk: pluginSourceDerivedRisk };
}
